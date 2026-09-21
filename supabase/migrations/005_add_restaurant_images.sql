-- Migration 005: Add restaurant cover image columns
-- Adds cover_image (public URL) and cover_image_path (storage path) to restaurants

ALTER TABLE IF EXISTS restaurants
ADD COLUMN IF NOT EXISTS cover_image text;

ALTER TABLE IF EXISTS restaurants
ADD COLUMN IF NOT EXISTS cover_image_path text;

-- No other schema changes. This migration is safe to run multiple times.
