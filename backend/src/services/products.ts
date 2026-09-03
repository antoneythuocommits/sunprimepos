import {
  createProductSchema,
  stockAdjustSchema,
  updateProductSchema,
  roundMoney,
  type InventoryValuation,
  type Product,
} from '@sunprime/shared';
import { pool, toNumber, withTransaction } from '../db.js';
import { HttpError } from '../middleware/error.js';

function mapProduct(row: Record<string, unknown>, includeBuying: boolean): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    sku: row.sku ? String(row.sku) : null,
    buying_price: includeBuying ? toNumber(row.buying_price) : 0,
    selling_price: toNumber(row.selling_price),
    stock_quantity: toNumber(row.stock_quantity),
    unit: String(row.unit),
    is_active: Boolean(row.is_active),
    allow_negative_stock: Boolean(row.allow_negative_stock),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listProducts(params: {
  search?: string;
  active?: boolean;
  limit?: number;
  cursor?: string;
  includeBuying: boolean;
}): Promise<{ products: Product[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const values: unknown[] = [];
  const where: string[] = ['1=1'];

  if (params.search) {
    values.push(`%${params.search}%`);
    where.push(`(name ILIKE $${values.length} OR COALESCE(sku, '') ILIKE $${values.length})`);
  }
  if (params.active !== undefined) {
    values.push(params.active);
    where.push(`is_active = $${values.length}`);
  }
  if (params.cursor) {
    values.push(params.cursor);
    where.push(`name > $${values.length}`);
  }

  values.push(limit + 1);
  const result = await pool.query(
    `SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY name ASC LIMIT $${values.length}`,
    values,
  );
  const rows = result.rows.slice(0, limit);
  return {
    products: rows.map((r) => mapProduct(r, params.includeBuying)),
    next_cursor: result.rows.length > limit ? String(rows[rows.length - 1].name) : null,
  };
}

export async function getProductBySku(
  sku: string,
  includeBuying: boolean,
): Promise<Product | null> {
  const trimmed = sku.trim();
  if (!trimmed) return null;
  const result = await pool.query(
    `SELECT * FROM products
     WHERE is_active = TRUE AND LOWER(COALESCE(sku, '')) = LOWER($1)
     LIMIT 1`,
    [trimmed],
  );
  if (!result.rows[0]) return null;
  return mapProduct(result.rows[0], includeBuying);
}

export async function createProduct(raw: unknown, includeBuying: boolean): Promise<Product> {
  const input = createProductSchema.parse(raw);
  const result = await pool.query(
    `INSERT INTO products (
       name, sku, buying_price, selling_price, stock_quantity, unit, is_active, allow_negative_stock
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      input.name,
      input.sku ?? null,
      roundMoney(input.buying_price),
      roundMoney(input.selling_price),
      input.stock_quantity,
      input.unit,
      input.is_active,
      input.allow_negative_stock,
    ],
  );
  return mapProduct(result.rows[0], includeBuying);
}

export async function updateProduct(
  id: string,
  raw: unknown,
  includeBuying: boolean,
): Promise<Product> {
  const input = updateProductSchema.parse(raw);
  const existing = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Product not found');

  const current = existing.rows[0];
  const result = await pool.query(
    `UPDATE products SET
       name = $1, sku = $2, buying_price = $3, selling_price = $4,
       unit = $5, is_active = $6, allow_negative_stock = $7, updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [
      input.name ?? current.name,
      input.sku !== undefined ? input.sku : current.sku,
      input.buying_price !== undefined ? roundMoney(input.buying_price) : current.buying_price,
      input.selling_price !== undefined ? roundMoney(input.selling_price) : current.selling_price,
      input.unit ?? current.unit,
      input.is_active ?? current.is_active,
      input.allow_negative_stock ?? current.allow_negative_stock,
      id,
    ],
  );
  return mapProduct(result.rows[0], includeBuying);
}

export async function adjustStock(
  productId: string,
  userId: string,
  raw: unknown,
  includeBuying: boolean,
): Promise<Product> {
  const input = stockAdjustSchema.parse(raw);

  return withTransaction(async (client) => {
    const productRes = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [
      productId,
    ]);
    if (!productRes.rows[0]) throw new HttpError(404, 'Product not found');
    const product = productRes.rows[0];
    const newStock = roundMoney(toNumber(product.stock_quantity) + input.delta);
    if (newStock < 0 && !product.allow_negative_stock) {
      throw new HttpError(400, 'Stock would go negative');
    }
    await client.query(
      `INSERT INTO stock_adjustments (product_id, delta, reason, user_id) VALUES ($1,$2,$3,$4)`,
      [productId, input.delta, input.reason, userId],
    );
    const updated = await client.query(
      `UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newStock, productId],
    );
    return mapProduct(updated.rows[0], includeBuying);
  });
}

export async function getInventoryValuation(): Promise<InventoryValuation> {
  const result = await pool.query(
    `SELECT id, name, sku, stock_quantity, unit, buying_price, selling_price
     FROM products WHERE is_active = TRUE ORDER BY name`,
  );
  let total_at_buying = 0;
  let total_at_selling = 0;
  const products = result.rows.map((row) => {
    const qty = toNumber(row.stock_quantity);
    const buying = toNumber(row.buying_price);
    const selling = toNumber(row.selling_price);
    const value_at_buying = roundMoney(qty * buying);
    const value_at_selling = roundMoney(qty * selling);
    total_at_buying = roundMoney(total_at_buying + value_at_buying);
    total_at_selling = roundMoney(total_at_selling + value_at_selling);
    return {
      product_id: String(row.id),
      name: String(row.name),
      sku: row.sku ? String(row.sku) : null,
      stock_quantity: qty,
      unit: String(row.unit),
      buying_price: buying,
      selling_price: selling,
      value_at_buying,
      value_at_selling,
    };
  });
  return { total_at_buying, total_at_selling, products };
}
