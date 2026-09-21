-- ============================================================================
-- MIGRATION: 20260919000000_transfer_superadmin_ownership.sql
-- DESCRIPTION:
--   Removes the Superadmin ownership transfer function from the database.
--   Retains get_superadmin_email_for_admin() for Superadmin resolution in the UI.
-- ============================================================================

BEGIN;

-- 1. Remove the ownership transfer function
DROP FUNCTION IF EXISTS public.transfer_superadmin_ownership(TEXT, TEXT);

-- 2. Ensure system_config exists
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'system_config' AND policyname = 'Allow authenticated read system_config'
  ) THEN
    CREATE POLICY "Allow authenticated read system_config"
      ON public.system_config FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 3. Superadmin email resolver functions (retained for UI permissions)
CREATE OR REPLACE FUNCTION public.get_superadmin_email()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT trim(value) INTO v_email
  FROM public.system_config
  WHERE key = 'superadmin_email'
  LIMIT 1;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN lower(v_email);
  END IF;

  RETURN 'wolf.palomar@gmail.com';
END;
$$;

REVOKE ALL ON FUNCTION public.get_superadmin_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_superadmin_email() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_superadmin_email TEXT;
  v_caller_email TEXT;
BEGIN
  v_superadmin_email := public.get_superadmin_email();
  IF v_superadmin_email IS NULL OR v_superadmin_email = '' THEN
    RETURN FALSE;
  END IF;

  SELECT lower(trim(email)) INTO v_caller_email
  FROM auth.users
  WHERE id = auth.uid();

  IF v_caller_email IS NULL OR v_caller_email = '' THEN
    v_caller_email := lower(trim(COALESCE(auth.jwt()->>'email', '')));
  END IF;

  RETURN v_caller_email = lower(trim(v_superadmin_email));
END;
$$;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_superadmin_email_for_admin()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NOT public.is_superadmin() THEN
    SELECT COALESCE(p.role::text, u.raw_app_meta_data->>'role', '') INTO v_role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = auth.uid();

    IF COALESCE(v_role, '') <> 'admin' THEN
      RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
    END IF;
  END IF;

  RETURN public.get_superadmin_email();
END;
$$;

REVOKE ALL ON FUNCTION public.get_superadmin_email_for_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_superadmin_email_for_admin() TO authenticated;

COMMIT;