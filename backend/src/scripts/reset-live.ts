import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query('BEGIN');
  try {
    await client.query(`
      TRUNCATE TABLE
        credit_payment_allocations,
        credit_payments,
        sale_items,
        sales,
        stock_adjustments,
        customers,
        products
      RESTART IDENTITY CASCADE
    `);
    await client.query(`UPDATE receipt_counters SET last_value = 0`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  const users = await client.query(`SELECT username, email, role FROM app_users ORDER BY created_at`);
  await client.end();
  console.log('Live reset complete. Business data cleared. Users kept:');
  for (const row of users.rows) {
    console.log(`  ${row.role}: ${row.username} (${row.email})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
