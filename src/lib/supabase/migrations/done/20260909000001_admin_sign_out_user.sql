-- ============================================================================
-- Migration: 20260909000002_admin_sign_out_user.sql
-- Description: RPC function for revoking all active sessions and refresh tokens
--              for a specific user.
-- Superadmin: wolf.palomar@gmail.com
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_sign_out_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
-- SECURITY DEFINER executes with elevated privileges to access auth.sessions
SECURITY DEFINER
-- Pin search path to mitigate search-path hijacking
SET search_path = public, auth
AS $$
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. AUTHORIZATION CHECK
  -- --------------------------------------------------------------------------
  -- Allow execution if:
  --   a) Caller is the Superadmin (wolf.palomar@gmail.com)
  --   b) Caller has an active 'admin' role in public.profiles
  --
  -- Note: We use `role::text = 'admin'` to safely compare enum values without
  -- triggering "invalid input value for enum user_role" errors.
  IF LOWER(COALESCE(auth.jwt() ->> 'email', '')) <> 'wolf.palomar@gmail.com'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
       AND role::text = 'admin'
     ) THEN
    RAISE EXCEPTION 'Unauthorized: Only system administrators can revoke user sessions.';
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. REVOKE ACTIVE SESSIONS
  -- --------------------------------------------------------------------------
  -- Deleting from auth.sessions immediately terminates all active web/mobile
  -- sessions in Supabase GoTrue Auth for this user.
  DELETE FROM auth.sessions 
  WHERE user_id = target_user_id;

  -- --------------------------------------------------------------------------
  -- 3. INVALIDATE ORPHAN REFRESH TOKENS
  -- --------------------------------------------------------------------------
  -- Purge refresh tokens linked to the deleted sessions to prevent automatic
  -- token renewal on the client side.
  DELETE FROM auth.refresh_tokens 
  WHERE session_id NOT IN (
    SELECT id FROM auth.sessions
  );

  -- --------------------------------------------------------------------------
  -- 4. TOUCH AUTH USER RECORD
  -- --------------------------------------------------------------------------
  -- Update timestamp in auth.users to notify GoTrue that account state changed.
  UPDATE auth.users
  SET updated_at = NOW()
  WHERE id = target_user_id;

END;
$$;

-- ----------------------------------------------------------------------------
-- Permissions & Access Controls
-- ----------------------------------------------------------------------------
-- Revoke all default public execution rights
REVOKE ALL ON FUNCTION public.admin_sign_out_user(UUID) FROM PUBLIC;

-- Allow authenticated users to invoke via supabase.rpc()
-- (The internal IF check above ensures only admins and wolf.palomar@gmail.com can run it)
GRANT EXECUTE ON FUNCTION public.admin_sign_out_user(UUID) TO authenticated;

-- Allow background service roles / workers to invoke if needed
GRANT EXECUTE ON FUNCTION public.admin_sign_out_user(UUID) TO service_role;

-- Documentation
COMMENT ON FUNCTION public.admin_sign_out_user(UUID) IS 
'Terminates all active login sessions and invalidates refresh tokens for a target user ID. Restricted to wolf.palomar@gmail.com and admin accounts.';