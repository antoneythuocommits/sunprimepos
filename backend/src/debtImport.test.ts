import { describe, expect, it } from 'vitest';
import { parseDebtSource, planDebtImport } from './services/debtImport.js';

const sample = `
INSERT INTO debts (
  customer_name, phone, receipt_number, debt_date, product_name,
  quantity, unit_price, line_total, paid_amount, debt_balance
) VALUES
  ('Jane Wanjiku', '0712345678', 'OLD-1001', '2026-03-01', 'White Bread Loaf', 2, 55.00, 110.00, 50.00, 160.00),
  ('Jane Wanjiku', '0712345678', 'OLD-1001', '2026-03-01', 'Croissant', 2, 50.00, 100.00, 50.00, 160.00),
  ('Peter Otieno', '0722000000', 'OLD-1002', '2026-04-12', 'Opening balance', 1, 800.00, 800.00, 0.00, 800.00);
`;

describe('parseDebtSource', () => {
  it('reads one row per item from a debts INSERT', () => {
    const parsed = parseDebtSource(sample);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      customer_name: 'Jane Wanjiku',
      phone: '0712345678',
      receipt_number: 'OLD-1001',
      debt_date: '2026-03-01',
      product_name: 'White Bread Loaf',
      quantity: 2,
      unit_price: 55,
      line_total: 110,
      paid_amount: 50,
      debt_balance: 160,
    });
  });

  it('maps common column aliases and ignores sku 0', () => {
    const sql = `
      INSERT INTO \`outstanding\` (\`customer\`, \`invoice\`, \`item\`, \`qty\`, \`price\`, \`line_amount\`, \`amount_paid\`, \`balance\`, \`barcode\`)
      VALUES ('Mary', 'INV-9', 'Milk', 1, 60, 60, 10, 50, '0');
    `;
    const parsed = parseDebtSource(sql);
    expect(parsed.rows[0]).toMatchObject({
      customer_name: 'Mary',
      receipt_number: 'INV-9',
      product_name: 'Milk',
      sku: null,
      paid_amount: 10,
      debt_balance: 50,
    });
  });

  it('parses CSV', () => {
    const csv = `customer_name,receipt_number,product_name,quantity,unit_price,line_total,paid_amount,debt_balance
Asha,OLD-3,Sugar,2,50,100,20,80`;
    const parsed = parseDebtSource(csv);
    expect(parsed.rows[0].customer_name).toBe('Asha');
    expect(parsed.rows[0].line_total).toBe(100);
  });
});

describe('planDebtImport', () => {
  it('groups item rows into one debt and checks the balance', () => {
    const plan = planDebtImport(parseDebtSource(sample).rows);
    expect(plan.debts).toHaveLength(2);
    expect(plan.debts[0]).toMatchObject({
      receipt_number: 'OLD-1001',
      total_amount: 210,
      paid_amount: 50,
      debt_balance: 160,
    });
    expect(plan.debts[0].items.map((item) => item.product_name)).toEqual([
      'White Bread Loaf',
      'Croissant',
    ]);
    expect(plan.debts[1]).toMatchObject({
      receipt_number: 'OLD-1002',
      paid_amount: 0,
      debt_balance: 800,
    });
  });

  it('skips a receipt whose paid amount and balance do not match the items', () => {
    const parsed = parseDebtSource(`
      INSERT INTO debts (customer_name, receipt_number, product_name, quantity, unit_price, line_total, paid_amount, debt_balance)
      VALUES ('Jane', 'OLD-1', 'Bread', 1, 100, 100, 10, 50);
    `);
    const plan = planDebtImport(parsed.rows);
    expect(plan.debts).toHaveLength(0);
    expect(plan.skip_reasons[0]).toMatch(/does not balance/);
  });

  it('derives a missing paid amount from the balance', () => {
    const parsed = parseDebtSource(`
      INSERT INTO debts (customer_name, receipt_number, product_name, quantity, unit_price, line_total, debt_balance)
      VALUES ('Jane', 'OLD-1', 'Bread', 1, 100, 100, 40);
    `);
    const plan = planDebtImport(parsed.rows);
    expect(plan.debts[0]).toMatchObject({ paid_amount: 60, debt_balance: 40, total_amount: 100 });
  });

  it('skips debts that are already fully paid', () => {
    const parsed = parseDebtSource(`
      INSERT INTO debts (customer_name, receipt_number, product_name, quantity, unit_price, line_total, paid_amount, debt_balance)
      VALUES ('Jane', 'OLD-1', 'Bread', 1, 100, 100, 100, 0);
    `);
    const plan = planDebtImport(parsed.rows);
    expect(plan.debts).toHaveLength(0);
    expect(plan.skip_reasons[0]).toMatch(/fully paid/);
  });
});
