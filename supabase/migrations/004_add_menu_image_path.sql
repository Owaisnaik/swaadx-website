-- 004_add_menu_image_path.sql
-- Add image_path column to menu_items to store storage path for reliable deletion

ALTER TABLE IF EXISTS menu_items
ADD COLUMN IF NOT EXISTS image_path text;

-- No default; preserve existing rows
UPDATE menu_items SET image_path = NULL WHERE image_path IS NULL;
