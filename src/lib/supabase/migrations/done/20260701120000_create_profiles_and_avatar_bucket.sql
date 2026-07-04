-- Migration: Setup Profiles Table, Custom Enum Statuses/Roles, Private Bucket, and Deletion Helpers
-- Path: src/lib/supabase/migrations/ready/20260701120000_create_profiles_and_avatar_bucket.sql

-- 1. Safely drop existing triggers only if the profiles table actually exists to prevent "relation does not exist" errors
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    DROP TRIGGER IF EXISTS on_profile_updated_sync ON public.profiles;
    DROP TRIGGER IF EXISTS on_profile_role_updated ON public.profiles;
    DROP TRIGGER IF EXISTS on_before_profile_update ON public.profiles;
  END IF;
END$$;


-- 2. Drop existing storage policies temporarily to break dependency loops
DROP POLICY IF EXISTS "Allow authenticated read access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete avatars" ON storage.objects;


-- 3. Create public.profiles table (Now guaranteed to exist for all subsequent queries)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  role public.user_role DEFAULT 'staff'::public.user_role,
  avatar_url TEXT,
  status public.user_status DEFAULT 'pending'::public.user_status,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- 4. Convert pre-existing table columns to use custom Enum Types
-- Safely drop old TEXT check constraints on pre-existing tables if any
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

-- Convert existing TEXT status columns to public.user_status Enum type cleanly
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.profiles ALTER COLUMN status TYPE public.user_status USING (status::public.user_status);
    ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'pending'::public.user_status;
  ELSE
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status public.user_status DEFAULT 'pending'::public.user_status;
  END IF;
END$$;

-- Convert existing TEXT role columns to public.user_role Enum type cleanly
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.profiles ALTER COLUMN role TYPE public.user_role USING (role::public.user_role);
    ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'staff'::public.user_role;
  ELSE
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.user_role DEFAULT 'staff'::public.user_role;
  END IF;
END$$;

-- Safely ensure timestamp columns exist on pre-existing tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();


-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow authenticated reads on any profile
DROP POLICY IF EXISTS "Allow authenticated read on profiles" ON public.profiles;
CREATE POLICY "Allow authenticated read on profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Update policy: Allow individuals to modify their own profile data, and administrators/superadmin to edit any profile
DROP POLICY IF EXISTS "Allow authenticated users to update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated updates on profiles" ON public.profiles;

CREATE POLICY "Allow authenticated updates on profiles" 
ON public.profiles FOR UPDATE
TO authenticated
USING (
  -- Users can edit their own profiles
  auth.uid() = id
  OR
  -- Administrators can edit any user's profile
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  )
  OR
  -- Superadmin can edit any user's profile via secure JWT claim lookup
  auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
)
WITH CHECK (
  auth.uid() = id
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  )
  OR
  auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
);


-- 5. Protection Guard: Prevent unauthorized privilege escalation or status manipulation by non-admins
CREATE OR REPLACE FUNCTION public.check_profile_update_privileges()
RETURNS TRIGGER AS $$
DECLARE
  caller_email TEXT;
  caller_role TEXT;
BEGIN
  -- Retrieve execution credentials of the active caller
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  -- If caller is not an admin and not the superadmin, prevent modifications to role or status columns
  IF COALESCE(caller_email, '') <> 'wolf.palomar@gmail.com' 
     AND COALESCE(caller_role, '') <> 'admin' THEN
    
    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to modify role levels.';
    END IF;

    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to modify account statuses.';
    END IF;
  END IF;

  -- Security Lock: Protect administrator account statuses from being manipulated by normal admins
  IF COALESCE(caller_email, '') <> 'wolf.palomar@gmail.com' AND OLD.role = 'admin'::public.user_role THEN
    IF NEW.status <> OLD.status OR NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Access Denied: Administrator roles and statuses can only be modified by the Superadmin.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth; -- Scoped search path to bypass schema permission limits

-- Force superuser ownership
ALTER FUNCTION public.check_profile_update_privileges() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_before_profile_update ON public.profiles;
CREATE TRIGGER on_before_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_profile_update_privileges();


-- 6. Configure Private avatars Bucket (Marked public as false)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET file_size_limit = 20971520, 
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
WHERE id = 'avatars';


-- 7. Re-create storage access policies for private bucket (uses secure JWT claim lookup)
CREATE POLICY "Allow authenticated read access to avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Allow authenticated users to upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'::public.user_role
    )
    OR
    auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
  )
);

CREATE POLICY "Allow authenticated users to update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'::public.user_role
    )
    OR
    auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
  )
);

CREATE POLICY "Allow authenticated users to delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'::public.user_role
    )
    OR
    auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
  )
);


-- 8. Corrected superadmin deletion helper
DROP FUNCTION IF EXISTS public.admin_delete_user(UUID);

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
  caller_email TEXT;
  target_role TEXT;
  target_status TEXT;
BEGIN
  -- Retrieve current caller email and profile role correctly
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  -- Retrieve target user role and status
  SELECT role::text, status::text INTO target_role, target_status 
  FROM public.profiles WHERE id = target_user_id;

  -- Verify general administrative permissions (Must be admin or superadmin)
  IF COALESCE(caller_email, '') <> 'wolf.palomar@gmail.com' 
     AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
  END IF;

  -- Constraint: Active administrator accounts can only be deleted by the Superadmin
  IF COALESCE(target_role, '') = 'admin' 
     AND COALESCE(target_status, '') = 'active' 
     AND COALESCE(caller_email, '') <> 'wolf.palomar@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied: Active administrator accounts can only be deleted by the Superadmin.';
  END IF;

  -- Constraint: Prevent deleting oneself
  IF auth.uid() = target_user_id THEN
    RAISE EXCEPTION 'Access Denied: You cannot delete your own account.';
  END IF;

  -- Delete from auth.users (cascades to public.profiles)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Re-grant execute privileges
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;


-- 9. Realtime Replication Activation: Enables instant client sync upon changes to profiles table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr 
      JOIN pg_class c ON pr.prrelid = c.oid 
      JOIN pg_namespace n ON c.relnamespace = n.oid 
      WHERE n.nspname = 'public' AND c.relname = 'profiles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
  END IF;
END$$;