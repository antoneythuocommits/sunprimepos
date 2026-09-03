import { readFileSync } from 'node:fs';
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

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const sql = readFileSync(resolve(__dirname, '../../migrations/002_seed.sql'), 'utf8');
  await client.query(sql);
  await client.end();
  console.log('Seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
