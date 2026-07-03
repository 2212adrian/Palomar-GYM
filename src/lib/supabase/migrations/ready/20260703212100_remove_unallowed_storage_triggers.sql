-- Migration: Remove unallowed storage triggers and restore admin deletion helper
-- Path: supabase/migrations/ready/20260703212100_remove_unallowed_storage_triggers.sql

-- 1. Remove the blocked trigger from public.profiles
DROP TRIGGER IF EXISTS on_profile_deleted_cleanup_avatar ON public.profiles;

-- 2. Remove the trigger function
DROP FUNCTION IF EXISTS public.cleanup_user_avatar_before_delete();

-- 3. Restore public.admin_delete_user to its original allowed state
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