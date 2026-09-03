INSERT INTO products (name, sku, buying_price, selling_price, stock_quantity, unit, is_active)
SELECT 'White Bread Loaf', 'BRD-001', 40.00, 55.00, 50, 'pcs', TRUE
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BRD-001');

INSERT INTO products (name, sku, buying_price, selling_price, stock_quantity, unit, is_active)
SELECT 'Chocolate Cake Slice', 'CKE-001', 80.00, 120.00, 20, 'pcs', TRUE
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'CKE-001');

INSERT INTO products (name, sku, buying_price, selling_price, stock_quantity, unit, is_active)
SELECT 'Croissant', 'PST-001', 30.00, 50.00, 40, 'pcs', TRUE
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'PST-001');

INSERT INTO products (name, sku, buying_price, selling_price, stock_quantity, unit, is_active)
SELECT 'Sugar 1kg', 'GRC-001', 120.00, 150.00, 25, 'kg', TRUE
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'GRC-001');

INSERT INTO products (name, sku, buying_price, selling_price, stock_quantity, unit, is_active)
SELECT 'Milk 500ml', 'DRY-001', 45.00, 60.00, 30, 'pcs', TRUE
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'DRY-001');

INSERT INTO customers (name, phone, notes)
SELECT 'Walk-in Credit Customer', '0700000000', 'Sample customer for credit sales'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE phone = '0700000000'
);
