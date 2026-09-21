-- Migration 011: add offer metadata to menu_items
-- Safe additive migration for existing data. No old data is deleted.

ALTER TABLE IF EXISTS menu_items
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

UPDATE menu_items
SET discount_type = 'none'
WHERE discount_type IS NULL OR discount_type = '';

UPDATE menu_items
SET discount_percentage = 0
WHERE discount_percentage IS NULL;

UPDATE menu_items
SET discount_amount = 0
WHERE discount_amount IS NULL;

ALTER TABLE IF EXISTS menu_items
  DROP CONSTRAINT IF EXISTS menu_items_discount_percentage_check,
  DROP CONSTRAINT IF EXISTS menu_items_discount_amount_check,
  DROP CONSTRAINT IF EXISTS menu_items_discount_type_check;

ALTER TABLE IF EXISTS menu_items
  ADD CONSTRAINT menu_items_discount_type_check
    CHECK (discount_type IN ('none', 'percentage')),
  ADD CONSTRAINT menu_items_discount_percentage_check
    CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  ADD CONSTRAINT menu_items_discount_amount_check
    CHECK (discount_amount >= 0);

UPDATE menu_items
SET discount_type = 'none', discount_percentage = 0, discount_amount = 0
WHERE discount_type = 'percentage' AND (discount_percentage IS NULL OR discount_percentage <= 0);
