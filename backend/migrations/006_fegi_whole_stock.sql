-- Fegi stock is counted in whole pieces only.

UPDATE products
SET stock_quantity = ROUND(stock_quantity), updated_at = NOW()
WHERE LOWER(BTRIM(category)) = 'fegi'
  AND stock_quantity <> ROUND(stock_quantity);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_fegi_whole_stock;
ALTER TABLE products ADD CONSTRAINT products_fegi_whole_stock
  CHECK (LOWER(BTRIM(category)) <> 'fegi' OR stock_quantity = TRUNC(stock_quantity));
