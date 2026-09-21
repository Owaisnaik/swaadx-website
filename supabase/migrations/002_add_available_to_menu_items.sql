-- Migration: add available boolean column to menu_items for restaurant admin
-- Run this migration in your Supabase project to allow menu items to track availability.

ALTER TABLE IF EXISTS menu_items
ADD COLUMN IF NOT EXISTS available boolean DEFAULT true;

-- Optionally set default for existing rows
UPDATE menu_items SET available = true WHERE available IS NULL;
