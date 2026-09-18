-- Speed up barcode/SKU lookup and product search on large catalogs.
-- Exact SKU queries used LOWER(sku), which could not use the unique sku btree index.
-- Name/SKU typeahead used ILIKE '%term%', which cannot use btree indexes.

CREATE INDEX IF NOT EXISTS products_sku_lower_idx
  ON products (LOWER(sku))
  WHERE sku IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_sku_trgm_idx
  ON products USING gin (sku gin_trgm_ops);
