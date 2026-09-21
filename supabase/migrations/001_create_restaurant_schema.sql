-- 001_create_restaurant_schema.sql
-- Creates restaurants, menu_items, orders, and order_items tables
-- Enables Row Level Security (RLS) and restricts direct client writes.

-- Note: Apply this migration to your Supabase project using the Supabase SQL editor
-- or the Supabase migrations tooling. The Edge Functions (server-side) will use the
-- Supabase service-role key to perform writes and bypass RLS safely.

-- Enable uuid-ossp or pgcrypto as needed (depends on Supabase DB extensions)
-- Using gen_random_uuid() from pgcrypto (available in Supabase)

-- Restaurants table: public SELECT, writes only via service-role (no client policies)
CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_clerk_user_id text NOT NULL,
  name text NOT NULL,
  description text,
  address text,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- Menu items: each belongs to a restaurant. Public SELECT allowed.
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  image text,
  veg boolean DEFAULT false,
  category text,
  recommended boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Orders: sensitive data — do NOT allow public SELECT. Only server functions with service role will read/write.
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_clerk_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  subtotal numeric NOT NULL,
  delivery_fee numeric NOT NULL DEFAULT 0,
  taxes numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  estimated_delivery text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id),
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security on sensitive tables
ALTER TABLE IF EXISTS restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_items ENABLE ROW LEVEL SECURITY;

-- Policies:
-- 1) Allow anonymous/public SELECT on restaurants and menu_items (customers need to browse menus)
-- 2) Do NOT create INSERT/UPDATE/DELETE policies for these tables — this prevents direct client writes.
--    Instead, server-side Edge Functions (running with the service-role key) will perform writes.

-- restaurants: allow select for all

CREATE POLICY "public_select_restaurants" ON restaurants
FOR SELECT USING (true);

-- menu_items: allow select for all

CREATE POLICY "public_select_menu_items" ON menu_items
FOR SELECT USING (true);

-- orders & order_items: do NOT create public select policies. Access must go through server functions.

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_clerk_user_id ON orders(customer_clerk_user_id);

-- Notes for deployment:
--  - Deploy this migration in your Supabase project.
--  - Ensure the Edge Functions are deployed and configured with CLERK_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY.
--  - Edge Functions will be the only way to mutate restaurants/menu_items/orders to enforce Clerk-based auth.