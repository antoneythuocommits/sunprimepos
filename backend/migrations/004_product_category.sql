-- Product category (fegi uses special POS quantity/price rules)

ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE products
SET category = 'general'
WHERE category IS NULL OR BTRIM(category) = '';

ALTER TABLE products ALTER COLUMN category SET DEFAULT 'general';
ALTER TABLE products ALTER COLUMN category SET NOT NULL;

CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
