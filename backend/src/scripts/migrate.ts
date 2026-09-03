import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const migrationsDir = resolve(__dirname, '../../migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.includes('seed'))
    .sort();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const applied = await client.query(`SELECT 1 FROM schema_migrations WHERE filename = $1`, [file]);
    if (applied.rowCount) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`apply ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  await client.end();
  console.log('Migrations complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
