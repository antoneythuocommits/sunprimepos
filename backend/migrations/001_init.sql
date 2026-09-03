-- Sunprime POS schema
-- Run against Supabase Postgres (service role / SQL editor or migrate script)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- App users mirrored from Supabase Auth (role + active flag)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY, -- matches auth.users.id
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  buying_price NUMERIC(12, 2) NOT NULL CHECK (buying_price >= 0),
  selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
  stock_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_name_idx ON products (name);
CREATE INDEX IF NOT EXISTS products_active_idx ON products (is_active);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  cashier_id UUID NOT NULL REFERENCES app_users (id),
  customer_id UUID REFERENCES customers (id),
  sale_type TEXT NOT NULL CHECK (sale_type IN ('cash', 'credit')),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  paid_amount NUMERIC(12, 2) NOT NULL CHECK (paid_amount >= 0),
  change_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON sales (customer_id);
CREATE INDEX IF NOT EXISTS sales_status_idx ON sales (status);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products (id),
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  buying_price NUMERIC(12, 2) NOT NULL CHECK (buying_price >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id);

CREATE TABLE IF NOT EXISTS credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers (id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  receipt_number TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_payments_customer_id_idx ON credit_payments (customer_id);

CREATE TABLE IF NOT EXISTS credit_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_payment_id UUID NOT NULL REFERENCES credit_payments (id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales (id),
  amount_allocated NUMERIC(12, 2) NOT NULL CHECK (amount_allocated > 0)
);

CREATE INDEX IF NOT EXISTS credit_alloc_payment_idx ON credit_payment_allocations (credit_payment_id);
CREATE INDEX IF NOT EXISTS credit_alloc_sale_idx ON credit_payment_allocations (sale_id);

-- Gapless sequential receipt counters (locked inside transactions)
CREATE TABLE IF NOT EXISTS receipt_counters (
  name TEXT PRIMARY KEY,
  last_value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO receipt_counters (name, last_value)
VALUES ('sale', 0), ('credit_payment', 0)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id),
  delta NUMERIC(12, 3) NOT NULL,
  reason TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES app_users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT 'Sunprime',
  receipt_contact TEXT NOT NULL DEFAULT '0722932780',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (id, business_name, receipt_contact)
VALUES (1, 'Sunprime', '0722932780')
ON CONFLICT (id) DO NOTHING;

-- Helper: next receipt number within a transaction (caller must lock row)
-- Usage from app: SELECT last_value FROM receipt_counters WHERE name = $1 FOR UPDATE;
