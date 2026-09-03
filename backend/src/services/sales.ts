import {
  applyFifoPayment,
  computeChange,
  computeSaleTotals,
  createSaleSchema,
  lineTotal,
  roundMoney,
  SaleType,
  type CreateSaleInput,
  type CreditSettlementReceipt,
  type SaleWithItems,
} from '@sunprime/shared';
import { pool, toNumber, withTransaction, type DbClient } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { nextReceiptNumber } from './receipts.js';

function mapSale(row: Record<string, unknown>): SaleWithItems['items'] extends never ? never : Omit<SaleWithItems, 'items'> {
  return {
    id: String(row.id),
    receipt_number: String(row.receipt_number),
    cashier_id: String(row.cashier_id),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    sale_type: row.sale_type as SaleType,
    total_amount: toNumber(row.total_amount),
    paid_amount: toNumber(row.paid_amount),
    change_amount: toNumber(row.change_amount),
    status: row.status as 'completed' | 'void',
    created_at: new Date(String(row.created_at)).toISOString(),
    customer_name: row.customer_name ? String(row.customer_name) : null,
    cashier_email: row.cashier_email ? String(row.cashier_email) : null,
  };
}

async function loadSaleItems(client: DbClient | typeof pool, saleId: string) {
  const result = await client.query(
    `SELECT id, sale_id, product_id, product_name, quantity, unit_price, buying_price, line_total
     FROM sale_items WHERE sale_id = $1 ORDER BY id`,
    [saleId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    sale_id: String(row.sale_id),
    product_id: String(row.product_id),
    product_name: String(row.product_name),
    quantity: toNumber(row.quantity),
    unit_price: toNumber(row.unit_price),
    buying_price: toNumber(row.buying_price),
    line_total: toNumber(row.line_total),
  }));
}

export async function createSale(cashierId: string, rawInput: unknown): Promise<SaleWithItems> {
  const input: CreateSaleInput = createSaleSchema.parse(rawInput);

  if (input.sale_type === SaleType.CREDIT) {
    if (!input.customer_id) {
      throw new HttpError(400, 'customer_id is required for credit sales');
    }
    if (roundMoney(input.paid_amount) !== 0) {
      throw new HttpError(400, 'Credit sales must have paid_amount of 0');
    }
  }

  return withTransaction(async (client) => {
    const lineSnapshots: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      buying_price: number;
      line_total: number;
    }> = [];

    for (const item of input.items) {
      const productRes = await client.query(
        `SELECT id, name, buying_price, selling_price, stock_quantity, allow_negative_stock, is_active
         FROM products WHERE id = $1 FOR UPDATE`,
        [item.product_id],
      );
      const product = productRes.rows[0];
      if (!product || !product.is_active) {
        throw new HttpError(400, `Product not found or inactive: ${item.product_id}`);
      }

      const qty = roundMoney(item.quantity);
      const unitPrice = roundMoney(item.unit_price);
      const buyingPrice = toNumber(product.buying_price);
      const currentStock = toNumber(product.stock_quantity);
      const newStock = roundMoney(currentStock - qty);

      if (newStock < 0 && !product.allow_negative_stock) {
        throw new HttpError(400, `Insufficient stock for ${product.name}`);
      }

      await client.query(`UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2`, [
        newStock,
        product.id,
      ]);

      lineSnapshots.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: unitPrice,
        buying_price: buyingPrice,
        line_total: lineTotal(qty, unitPrice),
      });
    }

    const { total_amount } = computeSaleTotals(lineSnapshots);
    const paid_amount =
      input.sale_type === SaleType.CREDIT ? 0 : roundMoney(input.paid_amount);
    if (input.sale_type === SaleType.CASH && paid_amount < total_amount) {
      throw new HttpError(400, 'paid_amount must cover total for cash sales');
    }
    const change_amount =
      input.sale_type === SaleType.CREDIT ? 0 : computeChange(paid_amount, total_amount);

    if (input.customer_id) {
      const cust = await client.query(`SELECT id FROM customers WHERE id = $1`, [input.customer_id]);
      if (!cust.rows[0]) throw new HttpError(400, 'Customer not found');
    }

    const receipt_number = await nextReceiptNumber(client, 'sale');

    const saleRes = await client.query(
      `INSERT INTO sales (
         receipt_number, cashier_id, customer_id, sale_type,
         total_amount, paid_amount, change_amount, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'completed')
       RETURNING *`,
      [
        receipt_number,
        cashierId,
        input.customer_id ?? null,
        input.sale_type,
        total_amount,
        paid_amount,
        change_amount,
      ],
    );

    const sale = saleRes.rows[0];
    const items = [];
    for (const line of lineSnapshots) {
      const itemRes = await client.query(
        `INSERT INTO sale_items (
           sale_id, product_id, product_name, quantity, unit_price, buying_price, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          sale.id,
          line.product_id,
          line.product_name,
          line.quantity,
          line.unit_price,
          line.buying_price,
          line.line_total,
        ],
      );
      const row = itemRes.rows[0];
      items.push({
        id: String(row.id),
        sale_id: String(row.sale_id),
        product_id: String(row.product_id),
        product_name: String(row.product_name),
        quantity: toNumber(row.quantity),
        unit_price: toNumber(row.unit_price),
        buying_price: toNumber(row.buying_price),
        line_total: toNumber(row.line_total),
      });
    }

    return { ...mapSale(sale), items };
  });
}

export async function listSales(params: {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ sales: SaleWithItems[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const values: unknown[] = [];
  const where: string[] = [`s.status = 'completed'`];

  if (params.from) {
    values.push(params.from);
    where.push(`s.created_at >= $${values.length}::date`);
  }
  if (params.to) {
    values.push(params.to);
    where.push(`s.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (params.cursor) {
    values.push(params.cursor);
    where.push(`s.created_at < $${values.length}::timestamptz`);
  }

  values.push(limit + 1);
  const result = await pool.query(
    `SELECT s.*, c.name AS customer_name, u.email AS cashier_email
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN app_users u ON u.id = s.cashier_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  const rows = result.rows.slice(0, limit);
  const sales: SaleWithItems[] = [];
  for (const row of rows) {
    const items = await loadSaleItems(pool, row.id);
    sales.push({ ...mapSale(row), items });
  }

  const next_cursor =
    result.rows.length > limit ? new Date(String(rows[rows.length - 1].created_at)).toISOString() : null;

  return { sales, next_cursor };
}

export async function getSale(id: string): Promise<SaleWithItems> {
  const result = await pool.query(
    `SELECT s.*, c.name AS customer_name, u.email AS cashier_email
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN app_users u ON u.id = s.cashier_id
     WHERE s.id = $1`,
    [id],
  );
  if (!result.rows[0]) throw new HttpError(404, 'Sale not found');
  const items = await loadSaleItems(pool, id);
  return { ...mapSale(result.rows[0]), items };
}

export async function getCustomerCredit(customerId: string) {
  const customerRes = await pool.query(`SELECT * FROM customers WHERE id = $1`, [customerId]);
  if (!customerRes.rows[0]) throw new HttpError(404, 'Customer not found');
  const customer = customerRes.rows[0];

  const salesRes = await pool.query(
    `SELECT s.*,
       COALESCE((
         SELECT SUM(a.amount_allocated) FROM credit_payment_allocations a WHERE a.sale_id = s.id
       ), 0) AS allocated_total
     FROM sales s
     WHERE s.customer_id = $1 AND s.sale_type = 'credit' AND s.status = 'completed'
     ORDER BY s.created_at ASC`,
    [customerId],
  );

  const orders = [];
  let total_outstanding = 0;
  for (const row of salesRes.rows) {
    const allocated = toNumber(row.allocated_total);
    const outstanding = roundMoney(toNumber(row.total_amount) - allocated);
    if (outstanding <= 0) continue;
    const items = await loadSaleItems(pool, row.id);
    orders.push({
      sale: mapSale(row),
      items,
      outstanding_balance: outstanding,
      allocated_total: allocated,
    });
    total_outstanding = roundMoney(total_outstanding + outstanding);
  }

  return {
    customer: {
      id: String(customer.id),
      name: String(customer.name),
      phone: customer.phone ? String(customer.phone) : null,
      notes: customer.notes ? String(customer.notes) : null,
      created_at: new Date(String(customer.created_at)).toISOString(),
    },
    orders,
    total_outstanding,
  };
}

export async function applyCreditPayment(
  customerId: string,
  amount: number,
): Promise<CreditSettlementReceipt> {
  const paymentAmount = roundMoney(amount);
  if (paymentAmount <= 0) throw new HttpError(400, 'Payment amount must be positive');

  return withTransaction(async (client) => {
    const customerRes = await client.query(`SELECT * FROM customers WHERE id = $1 FOR UPDATE`, [
      customerId,
    ]);
    if (!customerRes.rows[0]) throw new HttpError(404, 'Customer not found');
    const customer = customerRes.rows[0];

    const salesRes = await client.query(
      `SELECT s.*,
         COALESCE((
           SELECT SUM(a.amount_allocated) FROM credit_payment_allocations a WHERE a.sale_id = s.id
         ), 0) AS allocated_total
       FROM sales s
       WHERE s.customer_id = $1 AND s.sale_type = 'credit' AND s.status = 'completed'
       ORDER BY s.created_at ASC
       FOR UPDATE OF s`,
      [customerId],
    );

    const fifoOrders = salesRes.rows
      .map((row) => ({
        sale_id: String(row.id),
        outstanding: roundMoney(toNumber(row.total_amount) - toNumber(row.allocated_total)),
        row,
      }))
      .filter((o) => o.outstanding > 0);

    if (fifoOrders.length === 0) {
      throw new HttpError(400, 'Customer has no outstanding credit');
    }

    const fifo = applyFifoPayment(
      fifoOrders.map((o) => ({ sale_id: o.sale_id, outstanding: o.outstanding })),
      paymentAmount,
    );

    if (fifo.amount_applied <= 0) {
      throw new HttpError(400, 'Nothing to apply');
    }

    const receipt_number = await nextReceiptNumber(client, 'credit_payment');
    const paymentRes = await client.query(
      `INSERT INTO credit_payments (customer_id, amount, receipt_number)
       VALUES ($1, $2, $3) RETURNING *`,
      [customerId, fifo.amount_applied, receipt_number],
    );
    const payment = paymentRes.rows[0];

    const orders = [];
    for (const alloc of fifo.allocations) {
      await client.query(
        `INSERT INTO credit_payment_allocations (credit_payment_id, sale_id, amount_allocated)
         VALUES ($1, $2, $3)`,
        [payment.id, alloc.sale_id, alloc.amount_allocated],
      );
      const orderMeta = fifoOrders.find((o) => o.sale_id === alloc.sale_id)!;
      const items = await loadSaleItems(client, alloc.sale_id);
      orders.push({
        sale_id: alloc.sale_id,
        receipt_number: String(orderMeta.row.receipt_number),
        created_at: new Date(String(orderMeta.row.created_at)).toISOString(),
        items,
        amount_allocated: alloc.amount_allocated,
        remaining_balance: alloc.remaining_balance,
      });
    }

    // Remaining debt after this payment across ALL still-open orders
    let total_remaining = 0;
    for (const o of fifoOrders) {
      const applied = fifo.allocations.find((a) => a.sale_id === o.sale_id);
      const rem = applied ? applied.remaining_balance : o.outstanding;
      total_remaining = roundMoney(total_remaining + rem);
    }

    return {
      receipt_number: String(payment.receipt_number),
      customer: {
        id: String(customer.id),
        name: String(customer.name),
        phone: customer.phone ? String(customer.phone) : null,
        notes: customer.notes ? String(customer.notes) : null,
        created_at: new Date(String(customer.created_at)).toISOString(),
      },
      paid_amount: toNumber(payment.amount),
      orders,
      total_remaining_debt: total_remaining,
      created_at: new Date(String(payment.created_at)).toISOString(),
    };
  });
}
