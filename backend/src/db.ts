import pg from 'pg';
import { env } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl || undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 4_000,
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

const CONNECTIVITY_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '57P01',
  '57P02',
  '57P03',
]);

export function isConnectivityError(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 4 && current; i += 1) {
    if (typeof current !== 'object' || current == null) break;
    const rec = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof rec.code === 'string' && CONNECTIVITY_CODES.has(rec.code)) return true;
    if (
      typeof rec.message === 'string' &&
      /timeout exceeded when trying to connect|connection terminated|connect e|getaddrinfo|enotfound|econnrefused|etimedout|network is unreachable|could not connect|connection refused|ssl (?:connection|syscall)|no pg_hba/i.test(
        rec.message,
      )
    ) {
      return true;
    }
    current = rec.cause;
  }
  return false;
}

export async function checkDatabase(timeoutMs = 3000): Promise<boolean> {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('ETIMEDOUT')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}
