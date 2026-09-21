-- Migration 008: move delivery settings to menu items while keeping restaurant delivery radius as the restaurant-level field.
-- This migration is additive for menu_items and keeps the restaurant-level delivery radius distinct.

ALTER TABLE IF EXISTS restaurants
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric DEFAULT 0;

UPDATE restaurants
SET delivery_radius_km = 0
WHERE delivery_radius_km IS NULL;

ALTER TABLE IF EXISTS menu_items
  ADD COLUMN IF NOT EXISTS free_delivery boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric,
  ADD COLUMN IF NOT EXISTS preparation_time_minutes integer,
  ADD COLUMN IF NOT EXISTS available boolean DEFAULT true;

UPDATE menu_items
SET free_delivery = false
WHERE free_delivery IS NULL;

UPDATE menu_items
SET delivery_fee = NULL
WHERE delivery_fee IS NULL;

UPDATE menu_items
SET preparation_time_minutes = NULL
WHERE preparation_time_minutes IS NULL;

UPDATE menu_items
SET available = true
WHERE available IS NULL;

ALTER TABLE IF EXISTS restaurants
  DROP COLUMN IF EXISTS free_delivery,
  DROP COLUMN IF EXISTS delivery_fee,
  DROP COLUMN IF EXISTS preparation_time_minutes;
