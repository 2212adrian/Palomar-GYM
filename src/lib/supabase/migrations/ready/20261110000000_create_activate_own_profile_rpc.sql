-- Migration: Activate own profile on login, self-healing Google OAuth, and update privilege check trigger
-- Path: src/lib/supabase/migrations/ready/20261110000000_create_activate_own_profile_rpc.sql

-- 1. Ensure authenticated users can insert their own profile (e.g. for Google OAuth)
DROP POLICY IF EXISTS "Allow authenticated insert own profile" ON public.profiles;
CREATE POLICY "Allow authenticated insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 2. Update profile update privileges trigger to allow self-activation from 'pending' to 'active'
CREATE OR REPLACE FUNCTION public.check_profile_update_privileges()
RETURNS TRIGGER AS $$
DECLARE
  caller_email TEXT;
  caller_role TEXT;
  configured_superadmin TEXT;
BEGIN
  -- Retrieve execution credentials of the active caller
  SELECT LOWER(TRIM(email)) INTO caller_email FROM auth.users WHERE id = auth.uid();
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  -- Retrieve runtime superadmin email if system_config exists
  BEGIN
    SELECT LOWER(TRIM(value)) INTO configured_superadmin
    FROM public.system_config
    WHERE key = 'superadmin_email';
  EXCEPTION WHEN OTHERS THEN
    configured_superadmin := NULL;
  END;

  configured_superadmin := COALESCE(NULLIF(configured_superadmin, ''), 'wolf.palomar@gmail.com');

  -- Special Exception: Allow any authenticated user to activate their own pending profile upon login
  -- as long as their role is NOT being modified.
  IF auth.uid() = NEW.id 
     AND (OLD.status = 'pending' OR OLD.status IS NULL) 
     AND NEW.status = 'active' 
     AND NEW.role = OLD.role THEN
    RETURN NEW;
  END IF;

  -- If caller is not an admin and not the superadmin, prevent modifications to role or status columns
  IF COALESCE(caller_email, '') <> configured_superadmin
     AND COALESCE(caller_email, '') <> 'wolf.palomar@gmail.com' 
     AND COALESCE(caller_role, '') <> 'admin' THEN
    
    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to modify role levels.';
    END IF;

    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to modify account statuses.';
    END IF;
  END IF;

  -- Security Lock: Protect administrator account statuses from being manipulated by normal admins
  IF COALESCE(caller_email, '') <> configured_superadmin
     AND COALESCE(caller_email, '') <> 'wolf.palomar@gmail.com' 
     AND OLD.role = 'admin'::public.user_role THEN
    IF NEW.status <> OLD.status OR NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Access Denied: Administrator roles and statuses can only be modified by the Superadmin.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth;

ALTER FUNCTION public.check_profile_update_privileges() OWNER TO postgres;

-- 3. Function to allow an authenticated user to activate their own profile or create it if missing
CREATE OR REPLACE FUNCTION public.activate_own_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_name TEXT;
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- First attempt: activate existing pending profile
  UPDATE public.profiles
  SET status = 'active'::public.user_status,
      updated_at = NOW()
  WHERE id = v_uid
    AND (status = 'pending'::public.user_status OR status IS NULL);

  -- If no profile exists at all (e.g. direct Google OAuth login without pre-registration), auto-create active profile
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    SELECT email, 
           COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1), 'Staff Member')
    INTO v_email, v_name
    FROM auth.users
    WHERE id = v_uid;

    -- Default to staff role for safety, unless email matches configured superadmin
    IF v_email = 'wolf.palomar@gmail.com' THEN
      v_role := 'admin'::public.user_role;
    ELSE
      v_role := 'staff'::public.user_role;
    END IF;

    INSERT INTO public.profiles (id, username, email, role, status, created_at, updated_at)
    VALUES (
      v_uid,
      COALESCE(v_name, 'Staff Member'),
      v_email,
      v_role,
      'active'::public.user_status,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET status = 'active'::public.user_status,
        updated_at = NOW();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_own_profile() TO authenticated;