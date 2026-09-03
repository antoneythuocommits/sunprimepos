import pg from 'pg';
import { env } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl || undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
});

export type DbClient = pg.PoolClient;

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value == null) return 0;
  return Number(value);
}
