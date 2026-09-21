-- Migration 007: add restaurant profile, delivery, availability, and menu metadata fields
-- Safe additive migration for existing records. No old files are modified.

ALTER TABLE IF EXISTS restaurants
  ADD COLUMN IF NOT EXISTS cuisine text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS free_delivery boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preparation_time_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS menu_items
  ADD COLUMN IF NOT EXISTS free_delivery boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dietary_labels text DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS spice_level text DEFAULT 'None';

UPDATE restaurants
SET free_delivery = false
WHERE free_delivery IS NULL;

UPDATE restaurants
SET delivery_fee = 0
WHERE delivery_fee IS NULL;

UPDATE restaurants
SET delivery_radius_km = 0
WHERE delivery_radius_km IS NULL;

UPDATE restaurants
SET preparation_time_minutes = 0
WHERE preparation_time_minutes IS NULL;

UPDATE restaurants
SET is_available = true
WHERE is_available IS NULL;

UPDATE restaurants
SET opening_hours = '{}'::jsonb
WHERE opening_hours IS NULL;

UPDATE menu_items
SET free_delivery = false
WHERE free_delivery IS NULL;

UPDATE menu_items
SET dietary_labels = 'None'
WHERE dietary_labels IS NULL OR dietary_labels = '';

UPDATE menu_items
SET spice_level = 'None'
WHERE spice_level IS NULL OR spice_level = '';
