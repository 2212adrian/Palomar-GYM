-- ============================================================================
-- Migration: 20260920000000_security_access_control.sql
-- Description: Security & Permissions Configuration + Supabase Realtime
-- ============================================================================

BEGIN;

-- 1. Ensure system_config table exists
CREATE TABLE IF NOT EXISTS public.system_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Seed initial security access configuration if not present
INSERT INTO public.system_config (key, value, updated_at)
VALUES (
  'security_access_control',
  '{"location_restriction_enabled":false,"gym_latitude":14.5995,"gym_longitude":120.9842,"geofence_radius_meters":150,"gym_address":"Palomar Gym Headquarters","wifi_restriction_enabled":false,"require_trusted_network":false,"trusted_networks":[],"enforce_on_roles":["staff","admin"],"bypass_superadmin":true}',
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 3. RLS policies on public.system_config
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_authenticated_read_public_config" ON public.system_config;
CREATE POLICY "allow_authenticated_read_public_config"
  ON public.system_config
  FOR SELECT
  TO authenticated
  USING (key <> 'superadmin_email');

DROP POLICY IF EXISTS "allow_admin_update_security_config" ON public.system_config;
CREATE POLICY "allow_admin_update_security_config"
  ON public.system_config
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_superadmin()
    AND key = 'security_access_control'
  )
  WITH CHECK (
    public.is_admin_or_superadmin()
    AND key = 'security_access_control'
  );

DROP POLICY IF EXISTS "allow_admin_insert_security_config" ON public.system_config;
CREATE POLICY "allow_admin_insert_security_config"
  ON public.system_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_superadmin()
    AND key = 'security_access_control'
  );

-- 4. Helper Function: get_security_access_config()
CREATE OR REPLACE FUNCTION public.get_security_access_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_raw TEXT;
BEGIN
  SELECT value INTO v_raw
  FROM public.system_config
  WHERE key = 'security_access_control';

  IF v_raw IS NULL OR v_raw = '' THEN
    RETURN '{"location_restriction_enabled":false,"gym_latitude":14.5995,"gym_longitude":120.9842,"geofence_radius_meters":150,"gym_address":"Palomar Gym Headquarters","wifi_restriction_enabled":false,"require_trusted_network":false,"trusted_networks":[],"enforce_on_roles":["staff","admin"],"bypass_superadmin":true}'::jsonb;
  END IF;

  RETURN v_raw::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN '{"location_restriction_enabled":false,"gym_latitude":14.5995,"gym_longitude":120.9842,"geofence_radius_meters":150,"gym_address":"Palomar Gym Headquarters","wifi_restriction_enabled":false,"require_trusted_network":false,"trusted_networks":[],"enforce_on_roles":["staff","admin"],"bypass_superadmin":true}'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.get_security_access_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_security_access_config() TO authenticated;

-- 5. Helper Function: update_security_access_config(p_config jsonb)
CREATE OR REPLACE FUNCTION public.update_security_access_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email TEXT;
  v_caller_id UUID;
  v_val TEXT;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can modify security access settings.';
  END IF;

  v_caller_id := auth.uid();
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
  v_val := p_config::text;

  INSERT INTO public.system_config (key, value, updated_at)
  VALUES ('security_access_control', v_val, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();

  BEGIN
    PERFORM public.log_audit_entry(
      v_caller_id,
      COALESCE(v_caller_email, 'Admin'),
      'SECURITY_ACCESS_CONFIG_UPDATED',
      'system_config/security_access_control',
      'Security and access control configuration updated.'
    );
  EXCEPTION WHEN OTHERS THEN
  END;

  RETURN p_config;
END;
$$;

REVOKE ALL ON FUNCTION public.update_security_access_config(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_security_access_config(jsonb) TO authenticated;

-- 6. Enable Realtime broadcast on system_config
ALTER TABLE public.system_config REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_config;
  END IF;
END $$;

COMMIT;