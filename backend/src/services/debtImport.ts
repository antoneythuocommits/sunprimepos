import { roundMoney, roundQuantity } from '@sunprime/shared';
import { toNumber, withTransaction, type DbClient } from '../db.js';
import { nextReceiptNumber } from './receipts.js';

export interface DebtImportLine {
  customer_name: string;
  phone: string | null;
  receipt_number: string;
  debt_date: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  paid_amount: number | null;
  debt_balance: number | null;
}

export interface DebtItem {
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface DebtImportGroup {
  customer_name: string;
  phone: string | null;
  receipt_number: string;
  debt_date: string | null;
  paid_amount: number;
  debt_balance: number;
  total_amount: number;
  items: DebtItem[];
}

export interface DebtParseResult {
  rows: DebtImportLine[];
  skipped: number;
  skip_reasons: string[];
}

export interface DebtPlan {
  debts: DebtImportGroup[];
  skipped: number;
  skip_reasons: string[];
}

export interface DebtImportResult {
  debts: number;
  payments: number;
  customers_created: number;
  removed: number;
  skipped: number;
  total: number;
  skip_reasons: string[];
}

const REASON_LIMIT = 12;
const PLACEHOLDER_NAME = 'Imported credit item';

const COLUMN_ALIASES: Record<keyof DebtImportLine, string[]> = {
  customer_name: ['customer_name', 'customer', 'debtor', 'client_name', 'client'],
  phone: ['phone', 'mobile', 'tel', 'telephone'],
  receipt_number: ['receipt_number', 'receipt', 'invoice', 'invoice_no', 'invoice_number', 'debt_no', 'debt_id'],
  debt_date: ['debt_date', 'date', 'sale_date', 'created_at'],
  product_name: ['product_name', 'item_name', 'item', 'product', 'description'],
  sku: ['sku', 'barcode', 'code', 'item_code', 'product_code'],
  quantity: ['quantity', 'qty'],
  unit_price: ['unit_price', 'price', 'selling_price'],
  line_total: ['line_total', 'line_amount', 'item_total'],
  paid_amount: ['paid_amount', 'amount_paid', 'paid'],
  debt_balance: ['debt_balance', 'balance', 'outstanding', 'balance_due'],
};

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .replace(/^[`'"[]+|[`'"\]]+$/g, '')
    .toLowerCase();
}

function resolveField(header: string): keyof DebtImportLine | null {
  const key = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof DebtImportLine,
    string[],
  ][]) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseSku(value: unknown): string | null {
  if (value == null) return null;
  const sku = String(value).trim();
  if (!sku || sku === '0') return null;
  return sku.slice(0, 64);
}

function parseDate(value: unknown): string | null | undefined {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return undefined;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function pushReason(reasons: string[], reason: string) {
  if (reasons.includes(reason) || reasons.length >= REASON_LIMIT) return;
  reasons.push(reason);
}

function reject(reasons: string[], skipped: { n: number }, reason: string): null {
  skipped.n += 1;
  pushReason(reasons, reason);
  return null;
}

function toLine(
  raw: Record<string, unknown>,
  reasons: string[],
  skipped: { n: number },
): DebtImportLine | null {
  const mapped: Partial<Record<keyof DebtImportLine, unknown>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = resolveField(key);
    if (field && mapped[field] == null) mapped[field] = value;
  }

  const customer = mapped.customer_name == null ? '' : String(mapped.customer_name).trim();
  const product = mapped.product_name == null ? '' : String(mapped.product_name).trim();
  const receipt = mapped.receipt_number == null ? '' : String(mapped.receipt_number).trim();
  if (!customer || !product || !receipt) {
    return reject(reasons, skipped, 'A row is missing customer_name, receipt_number, or product_name');
  }

  const quantity = parseNumber(mapped.quantity);
  const unitPrice = parseNumber(mapped.unit_price);
  if (quantity == null || quantity <= 0 || unitPrice == null || unitPrice < 0) {
    return reject(reasons, skipped, `Receipt ${receipt} has an item without quantity and unit_price`);
  }

  const qty = roundQuantity(quantity);
  const price = roundMoney(unitPrice);
  if (qty <= 0) {
    return reject(reasons, skipped, `Receipt ${receipt} has a quantity of 0`);
  }

  const explicitTotal = parseNumber(mapped.line_total);
  const lineTotal = explicitTotal == null ? roundMoney(qty * price) : roundMoney(Math.max(0, explicitTotal));
  const debtDate = parseDate(mapped.debt_date);
  if (debtDate === undefined) {
    return reject(reasons, skipped, `Receipt ${receipt} has a debt_date that is not YYYY-MM-DD`);
  }

  const phoneRaw = mapped.phone == null ? '' : String(mapped.phone).trim();

  return {
    customer_name: customer.slice(0, 200),
    phone: phoneRaw ? phoneRaw.slice(0, 30) : null,
    receipt_number: receipt.slice(0, 60),
    debt_date: debtDate,
    product_name: product.slice(0, 200),
    sku: parseSku(mapped.sku),
    quantity: qty,
    unit_price: price,
    line_total: lineTotal,
    paid_amount: parseNumber(mapped.paid_amount),
    debt_balance: parseNumber(mapped.debt_balance),
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((v) => v.trim());
}

function parseCsv(text: string, reasons: string[], skipped: { n: number }): DebtImportLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('--'));
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const rows: DebtImportLine[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      raw[h] = cols[i] ?? '';
    });
    const row = toLine(raw, reasons, skipped);
    if (row) rows.push(row);
  }
  return rows;
}

function parseSqlString(sql: string, start: number): { value: string; next: number } {
  const quote = sql[start];
  let i = start + 1;
  let value = '';
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '\\' && i + 1 < sql.length) {
      value += sql[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      if (sql[i + 1] === quote) {
        value += quote;
        i += 2;
        continue;
      }
      return { value, next: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return { value, next: i };
}

function parseSqlValue(sql: string, start: number): { value: unknown; next: number } {
  let i = start;
  while (i < sql.length && /\s/.test(sql[i])) i += 1;
  const rest = sql.slice(i);
  if (/^null\b/i.test(rest)) return { value: null, next: i + 4 };
  if (/^true\b/i.test(rest)) return { value: true, next: i + 4 };
  if (/^false\b/i.test(rest)) return { value: false, next: i + 5 };
  if (sql[i] === "'" || sql[i] === '"') {
    const parsed = parseSqlString(sql, i);
    return { value: parsed.value, next: parsed.next };
  }
  const match = rest.match(/^[+-]?\d+(\.\d+)?/);
  if (match) return { value: Number(match[0]), next: i + match[0].length };
  const ident = rest.match(/^[A-Za-z_][\w]*/);
  if (ident) return { value: ident[0], next: i + ident[0].length };
  return { value: null, next: i + 1 };
}

function parseSqlTuple(sql: string, start: number): { values: unknown[]; next: number } {
  let i = start;
  while (i < sql.length && sql[i] !== '(') i += 1;
  i += 1;
  const values: unknown[] = [];
  while (i < sql.length) {
    while (i < sql.length && /[\s,]/.test(sql[i])) i += 1;
    if (sql[i] === ')') return { values, next: i + 1 };
    const parsed = parseSqlValue(sql, i);
    values.push(parsed.value);
    i = parsed.next;
  }
  return { values, next: i };
}

function tableAcceptsDebtRows(table: string, headers: string[]): boolean {
  const short = normalizeHeader(table).split('.').pop() ?? '';
  if (['debts', 'debt', 'credit', 'credit_debts', 'debt_items', 'outstanding'].includes(short)) {
    return true;
  }
  const fields = new Set(headers.map((header) => resolveField(header)).filter(Boolean));
  return fields.has('customer_name') && fields.has('product_name') && fields.has('receipt_number');
}

function parseSqlInserts(sql: string, reasons: string[], skipped: { n: number }): DebtImportLine[] {
  const rows: DebtImportLine[] = [];
  const insertRe = /insert\s+into\s+([^\s(]+)\s*\(([^)]+)\)\s*values/gi;
  let match: RegExpExecArray | null;
  while ((match = insertRe.exec(sql))) {
    const headers = match[2].split(',').map((h) => normalizeHeader(h));
    if (!tableAcceptsDebtRows(match[1], headers)) continue;
    let i = match.index + match[0].length;
    while (i < sql.length) {
      while (i < sql.length && /[\s,]/.test(sql[i])) i += 1;
      if (sql[i] === ';') break;
      if (sql[i] !== '(') break;
      const tuple = parseSqlTuple(sql, i);
      const raw: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        raw[h] = tuple.values[idx];
      });
      const row = toLine(raw, reasons, skipped);
      if (row) rows.push(row);
      i = tuple.next;
    }
  }
  return rows;
}

function parseJson(text: string, reasons: string[], skipped: { n: number }): DebtImportLine[] {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { rows?: unknown[] }).rows)
      ? (data as { rows: unknown[] }).rows
      : null;
  if (!list) return [];
  return list
    .map((item) =>
      item && typeof item === 'object' ? toLine(item as Record<string, unknown>, reasons, skipped) : null,
    )
    .filter((row): row is DebtImportLine => Boolean(row));
}

export function parseDebtSource(text: string): DebtParseResult {
  const trimmed = text.trim();
  const skip_reasons: string[] = [];
  const skipped = { n: 0 };
  if (!trimmed) return { rows: [], skipped: 0, skip_reasons };

  let rows: DebtImportLine[] = [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      rows = parseJson(trimmed, skip_reasons, skipped);
    } catch {
      rows = [];
    }
  } else if (/insert\s+into/i.test(trimmed)) {
    rows = parseSqlInserts(trimmed, skip_reasons, skipped);
  } else {
    rows = parseCsv(trimmed, skip_reasons, skipped);
  }

  return {
    rows,
    skipped: skipped.n,
    skip_reasons,
  };
}

function moneyText(value: number): string {
  return value.toFixed(2);
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function planDebtImport(lines: DebtImportLine[]): DebtPlan {
  const grouped = new Map<string, DebtImportLine[]>();
  for (const line of lines) {
    const key = line.receipt_number;
    const list = grouped.get(key);
    if (list) list.push(line);
    else grouped.set(key, [line]);
  }

  const debts: DebtImportGroup[] = [];
  const skip_reasons: string[] = [];
  let skipped = 0;
  let settled = 0;

  for (const [receipt, items] of grouped) {
    const first = items[0];
    const customerMismatch = items.some((item) => !sameText(item.customer_name, first.customer_name));
    if (customerMismatch) {
      skipped += 1;
      pushReason(skip_reasons, `Receipt ${receipt} mixes more than one customer`);
      continue;
    }

    const phones = [...new Set(items.map((item) => item.phone).filter((phone): phone is string => Boolean(phone)))];
    if (phones.length > 1) {
      skipped += 1;
      pushReason(skip_reasons, `Receipt ${receipt} has more than one phone number`);
      continue;
    }

    const dates = [...new Set(items.map((item) => item.debt_date).filter((date): date is string => Boolean(date)))];
    if (dates.length > 1) {
      skipped += 1;
      pushReason(skip_reasons, `Receipt ${receipt} has more than one debt_date`);
      continue;
    }

    const paidValues = [...new Set(items.map((item) => (item.paid_amount == null ? null : roundMoney(item.paid_amount))))];
    const balanceValues = [
      ...new Set(items.map((item) => (item.debt_balance == null ? null : roundMoney(item.debt_balance)))),
    ];
    const statedPaid = paidValues.filter((value): value is number => value != null);
    const statedBalance = balanceValues.filter((value): value is number => value != null);
    if (statedPaid.length > 1) {
      skipped += 1;
      pushReason(skip_reasons, `Receipt ${receipt} repeats different paid_amount values`);
      continue;
    }
    if (statedBalance.length > 1) {
      skipped += 1;
      pushReason(skip_reasons, `Receipt ${receipt} repeats different debt_balance values`);
      continue;
    }

    const total = roundMoney(items.reduce((sum, item) => sum + item.line_total, 0));
    let paid = statedPaid[0];
    let balance = statedBalance[0];
    if (paid == null && balance == null) {
      skipped += 1;
      pushReason(skip_reasons, `Receipt ${receipt} needs paid_amount or debt_balance`);
      continue;
    }
    if (paid == null) paid = roundMoney(total - balance!);
    if (balance == null) balance = roundMoney(total - paid);
    if (paid < 0 || balance < 0) {
      skipped += 1;
      pushReason(
        skip_reasons,
        `Receipt ${receipt} has a negative figure (items ${moneyText(total)}, paid ${moneyText(paid)}, balance ${moneyText(balance)})`,
      );
      continue;
    }
    if (roundMoney(total - paid) !== balance) {
      skipped += 1;
      pushReason(
        skip_reasons,
        `Receipt ${receipt} does not balance: items ${moneyText(total)} − paid ${moneyText(paid)} should equal ${moneyText(roundMoney(total - paid))}, file has ${moneyText(balance)}`,
      );
      continue;
    }
    if (balance <= 0) {
      skipped += 1;
      settled += 1;
      continue;
    }

    debts.push({
      customer_name: first.customer_name,
      phone: phones[0] ?? null,
      receipt_number: receipt,
      debt_date: dates[0] ?? null,
      paid_amount: paid,
      debt_balance: balance,
      total_amount: total,
      items: items.map((item) => ({
        product_name: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      })),
    });
  }

  if (settled > 0) {
    pushReason(
      skip_reasons,
      `Skipped ${settled} debt${settled === 1 ? '' : 's'} that are already fully paid`,
    );
  }

  return { debts, skipped, skip_reasons };
}

type ProductRef = { id: string; buying_price: number };

async function claimReceipt(client: DbClient, raw: string): Promise<string> {
  const base = raw.trim().slice(0, 60);
  const candidates = [base];
  if (!base.toUpperCase().startsWith('IMP-')) candidates.push(`IMP-${base}`.slice(0, 60));
  for (let n = 2; n <= 30; n += 1) {
    candidates.push(`IMP-${n}-${base}`.slice(0, 60));
  }
  for (const candidate of candidates) {
    const hit = await client.query(`SELECT 1 FROM sales WHERE receipt_number = $1`, [candidate]);
    if (!hit.rowCount) return candidate;
  }
  throw new Error(`Could not assign a receipt number for ${base}`);
}

async function customerId(
  client: DbClient,
  debt: DebtImportGroup,
  cache: Map<string, string>,
  created: { count: number },
): Promise<string> {
  const nameKey = `n:${debt.customer_name.toLowerCase()}`;
  if (debt.phone) {
    const phoneKey = `p:${debt.phone}`;
    const cachedPhone = cache.get(phoneKey);
    if (cachedPhone) return cachedPhone;
    const byPhone = await client.query<{ id: string }>(
      `SELECT id FROM customers WHERE phone = $1 LIMIT 1`,
      [debt.phone],
    );
    if (byPhone.rows[0]) {
      const id = String(byPhone.rows[0].id);
      cache.set(phoneKey, id);
      cache.set(nameKey, id);
      return id;
    }
  }

  const cachedName = cache.get(nameKey);
  if (cachedName) {
    if (debt.phone) {
      await client.query(
        `UPDATE customers SET phone = $2 WHERE id = $1 AND (phone IS NULL OR BTRIM(phone) = '')`,
        [cachedName, debt.phone],
      );
      cache.set(`p:${debt.phone}`, cachedName);
    }
    return cachedName;
  }

  const byName = await client.query<{ id: string }>(
    `SELECT id FROM customers WHERE LOWER(BTRIM(name)) = LOWER($1) ORDER BY created_at ASC LIMIT 1`,
    [debt.customer_name],
  );
  if (byName.rows[0]) {
    const id = String(byName.rows[0].id);
    cache.set(nameKey, id);
    if (debt.phone) {
      await client.query(
        `UPDATE customers SET phone = $2 WHERE id = $1 AND (phone IS NULL OR BTRIM(phone) = '')`,
        [id, debt.phone],
      );
      cache.set(`p:${debt.phone}`, id);
    }
    return id;
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id`,
    [debt.customer_name, debt.phone],
  );
  const id = String(inserted.rows[0].id);
  created.count += 1;
  cache.set(nameKey, id);
  if (debt.phone) cache.set(`p:${debt.phone}`, id);
  return id;
}

async function placeholderProduct(client: DbClient, cache: Map<string, ProductRef>): Promise<ProductRef> {
  const cached = cache.get('placeholder');
  if (cached) return cached;
  const existing = await client.query<{ id: string; buying_price: string }>(
    `SELECT id, buying_price FROM products WHERE name = $1 LIMIT 1`,
    [PLACEHOLDER_NAME],
  );
  if (existing.rows[0]) {
    const ref = { id: String(existing.rows[0].id), buying_price: toNumber(existing.rows[0].buying_price) };
    cache.set('placeholder', ref);
    return ref;
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO products (name, sku, buying_price, selling_price, stock_quantity, unit, category, is_active)
     VALUES ($1, NULL, 0, 0, 0, 'pcs', 'general', FALSE)
     RETURNING id`,
    [PLACEHOLDER_NAME],
  );
  const ref = { id: String(inserted.rows[0].id), buying_price: 0 };
  cache.set('placeholder', ref);
  return ref;
}

async function resolveProduct(
  client: DbClient,
  item: DebtItem,
  cache: Map<string, ProductRef>,
): Promise<ProductRef> {
  if (item.sku) {
    const skuKey = `sku:${item.sku.toLowerCase()}`;
    const cachedSku = cache.get(skuKey);
    if (cachedSku) return cachedSku;
    const bySku = await client.query<{ id: string; buying_price: string }>(
      `SELECT id, buying_price FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1`,
      [item.sku],
    );
    if (bySku.rows[0]) {
      const ref = { id: String(bySku.rows[0].id), buying_price: toNumber(bySku.rows[0].buying_price) };
      cache.set(skuKey, ref);
      return ref;
    }
  }

  const nameKey = `name:${item.product_name.toLowerCase()}`;
  const cachedName = cache.get(nameKey);
  if (cachedName) return cachedName;
  const byName = await client.query<{ id: string; buying_price: string }>(
    `SELECT id, buying_price FROM products WHERE LOWER(BTRIM(name)) = LOWER($1) LIMIT 1`,
    [item.product_name],
  );
  if (byName.rows[0]) {
    const ref = { id: String(byName.rows[0].id), buying_price: toNumber(byName.rows[0].buying_price) };
    cache.set(nameKey, ref);
    return ref;
  }

  return placeholderProduct(client, cache);
}

export async function importDebtRows(
  cashierId: string,
  debts: DebtImportGroup[],
  onProgress?: (progress: DebtImportResult & { done: number }) => void,
): Promise<DebtImportResult> {
  const result: DebtImportResult = {
    debts: 0,
    payments: 0,
    customers_created: 0,
    removed: 0,
    skipped: 0,
    total: debts.length,
    skip_reasons: [],
  };

  await withTransaction(async (client) => {
    const existing = await client.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM sales WHERE sale_type = 'credit'`,
    );
    result.removed = Number(existing.rows[0]?.n ?? 0);
    await client.query(`DELETE FROM credit_payments`);
    await client.query(`DELETE FROM sales WHERE sale_type = 'credit'`);

    const customers = new Map<string, string>();
    const products = new Map<string, ProductRef>();
    const created = { count: 0 };
    let done = 0;

    for (const debt of debts) {
      const customer = await customerId(client, debt, customers, created);
      const receipt = await claimReceipt(client, debt.receipt_number);
      const sale = await client.query<{ id: string }>(
        `INSERT INTO sales (
           receipt_number, cashier_id, customer_id, sale_type,
           total_amount, paid_amount, change_amount, status, created_at
         ) VALUES ($1, $2, $3, 'credit', $4, 0, 0, 'completed', COALESCE($5::timestamptz, NOW()))
         RETURNING id`,
        [receipt, cashierId, customer, debt.total_amount, debt.debt_date],
      );
      const saleId = String(sale.rows[0].id);

      for (const item of debt.items) {
        const product = await resolveProduct(client, item, products);
        await client.query(
          `INSERT INTO sale_items (
             sale_id, product_id, product_name, quantity, unit_price, buying_price, line_total
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            saleId,
            product.id,
            item.product_name,
            item.quantity,
            item.unit_price,
            product.buying_price,
            item.line_total,
          ],
        );
      }

      if (debt.paid_amount > 0) {
        const paymentReceipt = await nextReceiptNumber(client, 'credit_payment');
        const payment = await client.query<{ id: string }>(
          `INSERT INTO credit_payments (customer_id, amount, receipt_number, created_at)
           VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
           RETURNING id`,
          [customer, debt.paid_amount, paymentReceipt, debt.debt_date],
        );
        await client.query(
          `INSERT INTO credit_payment_allocations (credit_payment_id, sale_id, amount_allocated)
           VALUES ($1, $2, $3)`,
          [payment.rows[0].id, saleId, debt.paid_amount],
        );
        result.payments += 1;
      }

      result.debts += 1;
      done += 1;
      onProgress?.({ ...result, customers_created: created.count, done });
    }

    result.customers_created = created.count;
  });

  return result;
}
