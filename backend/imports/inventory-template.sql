-- Sunprime POS inventory extract
-- Export from MySQL using these EXACT column names, then upload the .sql file.
--
-- Example MySQL extract:
--   SELECT
--     name,
--     sku,
--     buying_price,
--     selling_price,
--     stock_quantity,
--     unit,
--     category,
--     is_active
--   FROM your_mysql_stock_table;
--
-- Required columns: name, selling_price
-- Optional columns: sku, buying_price, stock_quantity, unit, category, is_active

INSERT INTO inventory (
  name,
  sku,
  buying_price,
  selling_price,
  stock_quantity,
  unit,
  category,
  is_active
) VALUES
  ('White Bread Loaf', 'BRD-001', 40.00, 55.00, 50, 'pcs', 'general', 1),
  ('Croissant', 'PST-001', 30.00, 50.00, 40, 'pcs', 'fegi', 1);
