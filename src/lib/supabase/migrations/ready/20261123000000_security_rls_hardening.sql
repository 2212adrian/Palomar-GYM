-- ============================================================================
-- MIGRATION: 20261123000000_security_rls_hardening.sql
-- DESCRIPTION:
--   Tightens permissive INSERT/UPDATE policies on attendance, sales, and
--   sync_conflicts so disabled or non-active profiles cannot write records
--   using stale tokens, while preserving all valid active staff and admin
--   front-desk operations.
-- ============================================================================

BEGIN;

-- Helper: true when caller is SuperAdmin, active Admin, or active Staff
CREATE OR REPLACE FUNCTION public.is_active_operator()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF public.is_superadmin() OR public.is_admin() THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
  );
END;
$$;

-- 1. Tighten attendance INSERT policy (block disabled/pending profiles)
DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON public.attendance;
CREATE POLICY "Authenticated users can insert attendance"
  ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.is_active_operator());

-- 2. Tighten sales INSERT policy (block disabled/pending profiles)
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
CREATE POLICY "Authenticated users can insert sales"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.is_active_operator());

-- 3. Remove any lingering permissive update policy on sync_conflicts
DROP POLICY IF EXISTS "Allow authenticated users to update sync conflicts" ON public.sync_conflicts;
DROP POLICY IF EXISTS "Only SuperAdmin can access sync_conflicts" ON public.sync_conflicts;
CREATE POLICY "Only SuperAdmin can access sync_conflicts"
  ON public.sync_conflicts FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

COMMIT;
