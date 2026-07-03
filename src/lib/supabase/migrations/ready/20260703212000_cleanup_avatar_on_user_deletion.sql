-- Migration: Automatically purge user avatar files from storage when their profile is deleted
-- Path: supabase/migrations/ready/20260703212000_cleanup_avatar_on_user_deletion.sql

-- 1. Create a trigger function that deletes the user's avatar files from storage.objects
CREATE OR REPLACE FUNCTION public.cleanup_user_avatar_before_delete()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, storage
LANGUAGE plpgsql
AS $$
BEGIN
  -- Deletes any file stored inside the user's specific subfolder in the "avatars" bucket
  DELETE FROM storage.objects
  WHERE bucket_id = 'avatars'
    AND name LIKE OLD.id::text || '/%';
  RETURN OLD;
END;
$$;

-- 2. Ensure postgres ownership so it executes with administrative privileges to bypass RLS on storage.objects
ALTER FUNCTION public.cleanup_user_avatar_before_delete() OWNER TO postgres;

-- 3. Attach the BEFORE DELETE trigger to the public.profiles table
DROP TRIGGER IF EXISTS on_profile_deleted_cleanup_avatar ON public.profiles;
CREATE TRIGGER on_profile_deleted_cleanup_avatar
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_user_avatar_before_delete();