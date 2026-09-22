-- Add Admin-controlled restaurant lifecycle state without changing operational availability.
ALTER TABLE IF EXISTS restaurants
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by_admin_id text,
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE IF EXISTS restaurants
  DROP CONSTRAINT IF EXISTS restaurants_lifecycle_status_check;

ALTER TABLE IF EXISTS restaurants
  ADD CONSTRAINT restaurants_lifecycle_status_check
  CHECK (lifecycle_status IN ('active', 'archived'));

UPDATE restaurants
SET lifecycle_status = 'active'
WHERE lifecycle_status IS NULL;

DROP POLICY IF EXISTS "public_select_restaurants" ON restaurants;
CREATE POLICY "public_select_restaurants" ON restaurants
FOR SELECT USING (lifecycle_status = 'active');

DROP POLICY IF EXISTS "public_select_menu_items" ON menu_items;
CREATE POLICY "public_select_menu_items" ON menu_items
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM restaurants
    WHERE restaurants.id = menu_items.restaurant_id
      AND restaurants.lifecycle_status = 'active'
  )
);
