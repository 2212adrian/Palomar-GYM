-- ==============================================================================
-- Migration: 20260909120000_add_email_verification_and_admin_user_actions.sql
-- Description:
--   1. Adds email_verification_enabled to public.profiles for post-login 2FA.
--   2. Provides admin_sign_out_user() to terminate active sessions for any user.
--   3. Provides admin_update_username() for username administration.
--   4. Provides admin_delete_user() for complete user purging with cascade cleanup.
-- ==============================================================================

-- 1. Add email_verification_enabled column to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS email_verification_enabled BOOLEAN DEFAULT FALSE;

-- 2. Admin RPC to sign out all active sessions for a user
CREATE OR REPLACE FUNCTION public.admin_sign_out_user(target_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
  caller_email TEXT;
  is_caller_superadmin BOOLEAN := FALSE;
BEGIN
  SELECT LOWER(TRIM(email)) INTO caller_email FROM auth.users WHERE id = auth.uid();
  SELECT LOWER(role::text) INTO caller_role FROM public.profiles WHERE id = auth.uid();

  BEGIN
    SELECT public.is_superadmin() INTO is_caller_superadmin;
  EXCEPTION WHEN OTHERS THEN
    is_caller_superadmin := FALSE;
  END;

  IF caller_email = 'wolf.palomar@gmail.com' THEN
    is_caller_superadmin := TRUE;
  END IF;

  IF NOT is_caller_superadmin AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
  END IF;

  -- Invalidate all active sessions in auth.sessions & refresh tokens
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  DELETE FROM auth.refresh_tokens 
  WHERE user_id = target_user_id::text 
     OR session_id IN (SELECT id FROM auth.sessions WHERE user_id = target_user_id);

  -- Force token rotation for this user
  UPDATE auth.users 
  SET reauthentication_token = gen_random_uuid()::text,
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sign_out_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sign_out_user(UUID) TO service_role;

-- 3. Admin RPC to update username safely
CREATE OR REPLACE FUNCTION public.admin_update_username(target_user_id UUID, new_username TEXT)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
  caller_email TEXT;
  cleaned_username TEXT;
  is_caller_superadmin BOOLEAN := FALSE;
BEGIN
  SELECT LOWER(TRIM(email)) INTO caller_email FROM auth.users WHERE id = auth.uid();
  SELECT LOWER(role::text) INTO caller_role FROM public.profiles WHERE id = auth.uid();

  BEGIN
    SELECT public.is_superadmin() INTO is_caller_superadmin;
  EXCEPTION WHEN OTHERS THEN
    is_caller_superadmin := FALSE;
  END;

  IF caller_email = 'wolf.palomar@gmail.com' THEN
    is_caller_superadmin := TRUE;
  END IF;

  IF NOT is_caller_superadmin AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
  END IF;

  cleaned_username := trim(new_username);
  IF length(cleaned_username) < 2 THEN
    RAISE EXCEPTION 'Username must be at least 2 characters.';
  END IF;

  -- Check for uniqueness in profiles
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(cleaned_username) AND id <> target_user_id) THEN
    RAISE EXCEPTION 'Username "%" is already in use.', cleaned_username;
  END IF;

  -- Update profiles
  UPDATE public.profiles
  SET username = cleaned_username,
      updated_at = now()
  WHERE id = target_user_id;

  -- Update auth user raw_user_meta_data
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{full_name}',
    to_jsonb(cleaned_username)
  )
  WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_username(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_username(UUID, TEXT) TO service_role;

-- 4. Admin RPC to permanently delete a user account
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
  caller_email TEXT;
  target_email TEXT;
  is_caller_superadmin BOOLEAN := FALSE;
BEGIN
  -- 1. Identify Caller
  SELECT LOWER(TRIM(email)) INTO caller_email FROM auth.users WHERE id = auth.uid();
  SELECT LOWER(role::text) INTO caller_role FROM public.profiles WHERE id = auth.uid();

  BEGIN
    SELECT public.is_superadmin() INTO is_caller_superadmin;
  EXCEPTION WHEN OTHERS THEN
    is_caller_superadmin := FALSE;
  END;

  IF caller_email = 'wolf.palomar@gmail.com' THEN
    is_caller_superadmin := TRUE;
  END IF;

  -- 2. Permission Guard: Superadmin or Admin only
  IF NOT is_caller_superadmin AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
  END IF;

  -- 3. Self Deletion Guard
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Access Denied: You cannot delete your own session account.';
  END IF;

  -- 4. Superadmin Target Protection
  SELECT LOWER(TRIM(email)) INTO target_email FROM auth.users WHERE id = target_user_id;

  IF target_email = 'wolf.palomar@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied: The Superadmin account cannot be deleted.';
  END IF;

  -- 5. Cascade Cleanup across auth and public schema
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  DELETE FROM auth.refresh_tokens 
  WHERE user_id = target_user_id::text 
     OR session_id IN (SELECT id FROM auth.sessions WHERE user_id = target_user_id);

  DELETE FROM auth.identities WHERE user_id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO service_role;