import { describe, expect, it } from 'vitest';
import { parseInventorySource } from './services/inventoryImport.js';

describe('parseInventorySource', () => {
  it('parses MySQL INSERT dumps with canonical columns', () => {
    const sql = `
      INSERT INTO inventory (name, sku, buying_price, selling_price, stock_quantity, unit, is_active)
      VALUES
        ('White Bread', 'BRD-001', 40.00, 55.00, 50, 'pcs', 1),
        ('Cake', NULL, 80, 120, 10, 'pcs', 0);
    `;
    const rows = parseInventorySource(sql);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'White Bread',
      sku: 'BRD-001',
      buying_price: 40,
      selling_price: 55,
      stock_quantity: 50,
      unit: 'pcs',
      is_active: true,
    });
    expect(rows[1]).toMatchObject({
      name: 'Cake',
      sku: null,
      selling_price: 120,
      is_active: false,
    });
  });

  it('maps common MySQL aliases', () => {
    const sql = `
      INSERT INTO stock (product_name, barcode, cost, price, qty)
      VALUES ('Milk', 'DRY-001', 45, 60, 12);
    `;
    const rows = parseInventorySource(sql);
    expect(rows[0]).toMatchObject({
      name: 'Milk',
      sku: 'DRY-001',
      buying_price: 45,
      selling_price: 60,
      stock_quantity: 12,
    });
  });

  it('parses CSV headers', () => {
    const csv = `name,sku,buying_price,selling_price,stock_quantity,unit,is_active
Sugar,GRC-001,120,150,25,kg,1`;
    const rows = parseInventorySource(csv);
    expect(rows[0].name).toBe('Sugar');
    expect(rows[0].stock_quantity).toBe(25);
    expect(rows[0].category).toBe('general');
  });

  it('maps category including fegi', () => {
    const sql = `
      INSERT INTO inventory (name, selling_price, category)
      VALUES ('Sportsman', 350, 'FEGI');
    `;
    const rows = parseInventorySource(sql);
    expect(rows[0].category).toBe('fegi');
  });
});
