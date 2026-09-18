import { withTransaction } from '../db.js';

export interface InventoryImportRow {
  name: string;
  sku: string | null;
  buying_price: number;
  selling_price: number;
  stock_quantity: number;
  unit: string;
  category: string;
  is_active: boolean;
}

const COLUMN_ALIASES: Record<keyof InventoryImportRow, string[]> = {
  name: ['name', 'product_name', 'item_name', 'item', 'product', 'description'],
  sku: ['sku', 'barcode', 'code', 'item_code', 'product_code'],
  buying_price: ['buying_price', 'buy_price', 'cost', 'cost_price', 'purchase_price', 'buying'],
  selling_price: ['selling_price', 'sell_price', 'price', 'selling', 'retail_price', 'unit_price'],
  stock_quantity: ['stock_quantity', 'stock', 'qty', 'quantity', 'quantity_on_hand', 'qoh', 'on_hand'],
  unit: ['unit', 'uom', 'units'],
  category: ['category', 'cat', 'product_category', 'item_category', 'type'],
  is_active: ['is_active', 'active', 'status', 'enabled'],
};

function normalizeHeader(raw: string): string {
  return raw.trim().replace(/^[`'"[]+|[`'"\]]+$/g, '').toLowerCase();
}

function resolveField(header: string): keyof InventoryImportRow | null {
  const key = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof InventoryImportRow,
    string[],
  ][]) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

function parseBoolean(value: unknown, fallback = true): boolean {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'n', 'inactive', 'disabled', 'off'].includes(text)) return false;
  if (['1', 'true', 'yes', 'y', 'active', 'enabled', 'on'].includes(text)) return true;
  return fallback;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function parseSku(value: unknown): string | null {
  if (value == null) return null;
  const sku = String(value).trim();
  return sku ? sku : null;
}

function parseCategory(value: unknown): string {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return 'general';
  if (raw.toLowerCase() === 'fegi') return 'fegi';
  return raw.slice(0, 50);
}

function toRow(raw: Record<string, unknown>): InventoryImportRow | null {
  const mapped: Partial<Record<keyof InventoryImportRow, unknown>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = resolveField(key);
    if (field) mapped[field] = value;
  }

  const name = mapped.name == null ? '' : String(mapped.name).trim();
  if (!name) return null;

  return {
    name: name.slice(0, 200),
    sku: parseSku(mapped.sku),
    buying_price: Math.max(0, parseNumber(mapped.buying_price, 0)),
    selling_price: Math.max(0, parseNumber(mapped.selling_price, 0)),
    stock_quantity: parseNumber(mapped.stock_quantity, 0),
    unit: (mapped.unit == null || String(mapped.unit).trim() === ''
      ? 'pcs'
      : String(mapped.unit).trim()
    ).slice(0, 20),
    category: parseCategory(mapped.category),
    is_active: parseBoolean(mapped.is_active, true),
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

function parseCsv(text: string): InventoryImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const rows: InventoryImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      raw[h] = cols[i] ?? '';
    });
    const row = toRow(raw);
    if (row) rows.push(row);
  }
  return rows;
}

function parseJson(text: string): InventoryImportRow[] {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown[] }).rows)
    ? (data as { rows: unknown[] }).rows
    : null;
  if (!list) return [];
  return list
    .map((item) => (item && typeof item === 'object' ? toRow(item as Record<string, unknown>) : null))
    .filter((row): row is InventoryImportRow => Boolean(row));
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

function parseSqlInserts(sql: string): InventoryImportRow[] {
  const rows: InventoryImportRow[] = [];
  const insertRe = /insert\s+into\s+([^\s(]+)\s*\(([^)]+)\)\s*values/gi;
  let match: RegExpExecArray | null;
  while ((match = insertRe.exec(sql))) {
    const headers = match[2].split(',').map((h) => normalizeHeader(h));
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
      const row = toRow(raw);
      if (row) rows.push(row);
      i = tuple.next;
    }
  }
  return rows;
}

export function parseInventorySource(text: string): InventoryImportRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const jsonRows = parseJson(trimmed);
      if (jsonRows.length) return jsonRows;
    } catch {
      // fall through
    }
  }

  if (/insert\s+into/i.test(trimmed)) {
    const sqlRows = parseSqlInserts(trimmed);
    if (sqlRows.length) return sqlRows;
  }

  return parseCsv(trimmed);
}

export const INVENTORY_IMPORT_COLUMNS = {
  required: ['name', 'selling_price'] as const,
  optional: ['sku', 'buying_price', 'stock_quantity', 'unit', 'category', 'is_active'] as const,
};

export interface InventoryImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export async function importInventoryRows(
  rows: InventoryImportRow[],
  onProgress?: (progress: InventoryImportResult & { done: number }) => void,
): Promise<InventoryImportResult> {
  const result: InventoryImportResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: rows.length,
  };

  await withTransaction(async (client) => {
    let done = 0;
    for (const row of rows) {
      if (!row.name || row.selling_price < 0) {
        result.skipped += 1;
        done += 1;
        onProgress?.({ ...result, done });
        continue;
      }

      let existing: { id: string } | undefined;
      if (row.sku) {
        existing = (
          await client.query<{ id: string }>(
            `SELECT id FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1`,
            [row.sku],
          )
        ).rows[0];
      } else {
        existing = (
          await client.query<{ id: string }>(
            `SELECT id FROM products WHERE sku IS NULL AND LOWER(name) = LOWER($1) LIMIT 1`,
            [row.name],
          )
        ).rows[0];
      }

      if (existing) {
        await client.query(
          `UPDATE products SET
             name = $1,
             sku = $2,
             buying_price = $3,
             selling_price = $4,
             stock_quantity = $5,
             unit = $6,
             category = $7,
             is_active = $8,
             updated_at = NOW()
           WHERE id = $9`,
          [
            row.name,
            row.sku,
            row.buying_price,
            row.selling_price,
            row.stock_quantity,
            row.unit,
            row.category,
            row.is_active,
            existing.id,
          ],
        );
        result.updated += 1;
      } else {
        await client.query(
          `INSERT INTO products
             (name, sku, buying_price, selling_price, stock_quantity, unit, category, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            row.name,
            row.sku,
            row.buying_price,
            row.selling_price,
            row.stock_quantity,
            row.unit,
            row.category,
            row.is_active,
          ],
        );
        result.inserted += 1;
      }
      done += 1;
      onProgress?.({ ...result, done });
    }
  });

  return result;
}
