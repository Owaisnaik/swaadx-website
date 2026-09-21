-- 003_storage_policies_restaurant_menu_images.sql
-- Policies for Supabase Storage bucket: restaurant-menu-images
-- This migration drops any existing policies with the given names and then creates
-- the four required policies for the bucket_id = 'restaurant-menu-images'.
--
-- Policy semantics:
--  - SELECT : public read (so stored public URLs remain accessible)
--  - INSERT/UPDATE/DELETE : restricted to role "authenticated" (Supabase users)
--
-- Note: Because this project uses Clerk for authentication, server-side uploads/deletes
-- via Edge Functions using the SUPABASE_SERVICE_ROLE_KEY remain the recommended approach.

-- Remove any existing policies created by previous runs (idempotent)
DROP POLICY IF EXISTS public_select_restaurant_menu_images ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_insert_restaurant_menu_images ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_update_restaurant_menu_images ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_delete_restaurant_menu_images ON storage.objects;

-- Create SELECT policy: public read for objects in the restaurant-menu-images bucket
CREATE POLICY public_select_restaurant_menu_images ON storage.objects
  FOR SELECT
  USING (bucket_id = 'restaurant-menu-images');

-- Create INSERT policy: only Supabase-authenticated role can insert into this bucket
CREATE POLICY allow_authenticated_insert_restaurant_menu_images ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'restaurant-menu-images');

-- Create UPDATE policy: only Supabase-authenticated role can update objects in this bucket
CREATE POLICY allow_authenticated_update_restaurant_menu_images ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'restaurant-menu-images')
  WITH CHECK (bucket_id = 'restaurant-menu-images');

-- Create DELETE policy: only Supabase-authenticated role can delete objects in this bucket
CREATE POLICY allow_authenticated_delete_restaurant_menu_images ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'restaurant-menu-images');

-- End of migration
