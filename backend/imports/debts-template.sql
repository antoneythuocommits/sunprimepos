-- Sunprime POS debt extract
-- One row per item. Repeat customer, receipt, paid_amount, and debt_balance
-- on every item that belongs to the same debt.
--
-- For one receipt_number:
--   sum(line_total) - paid_amount = debt_balance
--
-- Leave out debts that are already fully paid.

INSERT INTO debts (
  customer_name,
  phone,
  receipt_number,
  debt_date,
  product_name,
  quantity,
  unit_price,
  line_total,
  paid_amount,
  debt_balance
) VALUES
  ('Jane Wanjiku', '0712345678', 'OLD-1001', '2026-03-01', 'White Bread Loaf', 2, 55.00, 110.00, 50.00, 160.00),
  ('Jane Wanjiku', '0712345678', 'OLD-1001', '2026-03-01', 'Croissant', 2, 50.00, 100.00, 50.00, 160.00),
  ('Peter Otieno', '0722000000', 'OLD-1002', '2026-04-12', 'Opening balance', 1, 800.00, 800.00, 0.00, 800.00);
