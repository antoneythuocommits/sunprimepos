import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { importInventoryRows, parseInventorySource } from '../services/inventoryImport.js';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: pnpm db:import-inventory -- path/to/inventory.sql');
    console.error('Accepted files: .sql (MySQL INSERT dump), .csv, or .json');
    process.exit(1);
  }

  const text = readFileSync(resolve(process.cwd(), file), 'utf8');
  const rows = parseInventorySource(text);
  if (!rows.length) {
    console.error('No inventory rows found. Check column names in the file.');
    process.exit(1);
  }

  const result = await importInventoryRows(rows);
  await pool.end();
  console.log(
    `Imported ${result.total} rows: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`,
  );
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
