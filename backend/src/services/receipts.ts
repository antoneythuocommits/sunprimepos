import type { DbClient } from '../db.js';

/** Lock counter row and return next gapless sequential receipt number. */
export async function nextReceiptNumber(client: DbClient, counterName: 'sale' | 'credit_payment'): Promise<string> {
  const result = await client.query<{ last_value: string }>(
    `SELECT last_value FROM receipt_counters WHERE name = $1 FOR UPDATE`,
    [counterName],
  );
  if (!result.rows[0]) {
    throw new Error(`Receipt counter '${counterName}' not found`);
  }
  const next = Number(result.rows[0].last_value) + 1;
  await client.query(`UPDATE receipt_counters SET last_value = $1 WHERE name = $2`, [next, counterName]);

  const prefix = counterName === 'sale' ? 'S' : 'CP';
  return `${prefix}-${String(next).padStart(6, '0')}`;
}
