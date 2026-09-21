-- Add restaurant-managed optional extras to menu items.
CREATE TABLE IF NOT EXISTS menu_item_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_item_addons_item_idx ON menu_item_addons(menu_item_id);
CREATE INDEX IF NOT EXISTS menu_item_addons_restaurant_idx ON menu_item_addons(restaurant_id);

ALTER TABLE menu_item_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY menu_item_addons_select_public
  ON menu_item_addons FOR SELECT USING (active = true);
CREATE POLICY menu_item_addons_no_direct_write
  ON menu_item_addons FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selected_addons jsonb NOT NULL DEFAULT '[]'::jsonb;
