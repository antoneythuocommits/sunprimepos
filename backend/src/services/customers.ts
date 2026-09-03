import { createCustomerSchema, roundMoney, type Customer } from '@sunprime/shared';
import { pool, toNumber } from '../db.js';
import { HttpError } from '../middleware/error.js';

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: row.phone ? String(row.phone) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export async function listCustomers(
  search?: string,
): Promise<(Customer & { outstanding: number })[]> {
  const values: unknown[] = [];
  let where = '1=1';
  if (search) {
    values.push(`%${search}%`);
    where = `(name ILIKE $1 OR COALESCE(phone, '') ILIKE $1)`;
  }
  const result = await pool.query(
    `SELECT * FROM customers WHERE ${where} ORDER BY name ASC LIMIT 200`,
    values,
  );

  const customers = [];
  for (const row of result.rows) {
    const outstandingRes = await pool.query(
      `SELECT s.total_amount,
         COALESCE((SELECT SUM(a.amount_allocated) FROM credit_payment_allocations a WHERE a.sale_id = s.id), 0) AS allocated
       FROM sales s
       WHERE s.customer_id = $1 AND s.sale_type = 'credit' AND s.status = 'completed'`,
      [row.id],
    );
    let outstanding = 0;
    for (const s of outstandingRes.rows) {
      outstanding = roundMoney(outstanding + (toNumber(s.total_amount) - toNumber(s.allocated)));
    }
    customers.push({ ...mapCustomer(row), outstanding });
  }
  return customers;
}

export async function createCustomer(raw: unknown): Promise<Customer> {
  const input = createCustomerSchema.parse(raw);
  const result = await pool.query(
    `INSERT INTO customers (name, phone, notes) VALUES ($1,$2,$3) RETURNING *`,
    [input.name, input.phone ?? null, input.notes ?? null],
  );
  return mapCustomer(result.rows[0]);
}

export async function getCustomer(id: string): Promise<Customer> {
  const result = await pool.query(`SELECT * FROM customers WHERE id = $1`, [id]);
  if (!result.rows[0]) throw new HttpError(404, 'Customer not found');
  return mapCustomer(result.rows[0]);
}
