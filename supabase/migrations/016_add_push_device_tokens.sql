-- Stores Expo push tokens for customer and restaurant devices.
-- Writes are performed by the Supabase Edge Function using the service role.

CREATE TABLE IF NOT EXISTS push_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  role text NOT NULL CONSTRAINT push_device_tokens_role_check CHECK (role IN ('customer', 'restaurant')),
  expo_push_token text NOT NULL UNIQUE,
  platform text CONSTRAINT push_device_tokens_platform_check CHECK (platform IS NULL OR platform IN ('android', 'ios')),
  device_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_device_tokens_clerk_user_role_idx
  ON push_device_tokens (clerk_user_id, role);

ALTER TABLE push_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER push_device_tokens_set_updated_at
BEFORE UPDATE ON push_device_tokens
FOR EACH ROW
EXECUTE FUNCTION update_review_updated_at();
