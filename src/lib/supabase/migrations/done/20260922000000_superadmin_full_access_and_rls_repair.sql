-- ============================================================================
-- MIGRATION: 20260922000000_superadmin_full_access_and_rls_repair.sql
-- DESCRIPTION:
--   Repairs the Row Level Security blockers that stop the Superadmin from
--   saving System Settings, and guarantees that the Superadmin account can
--   never be denied by an RLS policy anywhere in the public schema.
--
-- VERIFIED ROOT CAUSES (checked against the live Development project
-- dotawlqogonuwpbaumfh on 2026-09-22):
--
--   1. WRONG SUPERADMIN ADDRESS STORED IN THE DATABASE
--      public.system_config -> key 'superadmin_email' contained
--      '2212adrian@palomargym.noemail' (written on 2026-09-20 by the now
--      removed ownership-transfer feature). public.is_superadmin() therefore
--      evaluated to FALSE for wolf.palomar@gmail.com: the account was
--      Superadmin in the UI only, because the UI resolves the address from
--      VITE_SUPERADMIN_EMAIL at build time.
--      FIX: re-seed the config row from VITE_SUPERADMIN_EMAIL and harden
--      is_superadmin() with a canonical allow-list fallback so a stale or
--      blank config can never lock the owner out again.
--
--   2. public.gym_profile HAD NO INSERT POLICY
--      System Settings -> Gym Profile saves with
--      supabase.from('gym_profile').upsert([...]), which PostgREST sends as
--      INSERT ... ON CONFLICT (id) DO UPDATE. Postgres requires an INSERT
--      policy (WITH CHECK) for that statement, and only SELECT + UPDATE
--      policies existed:
--        new row violates row-level security policy for table "gym_profile"
--      FIX: add INSERT and DELETE policies for Admin/Superadmin and rebuild
--      the UPDATE policy on top of public.is_admin().
--
--   3. public.system_config ONLY ALLOWED WRITES FOR ONE KEY
--      Its write policies matched key = 'security_access_control' only, and a
--      legacy USING (true) SELECT policy exposed 'superadmin_email' to every
--      authenticated user.
--      FIX: Admin/Superadmin INSERT/UPDATE/DELETE for every key, a SELECT
--      policy that hides 'superadmin_email' from ordinary staff, and removal
--      of the legacy over-permissive policy.
--
--   4. THE SUPERADMIN HAS NO public.profiles ROW (BY DESIGN)
--      src/stores/authStore.ts intentionally skips the profile fetch/create
--      branch for the env-based Superadmin, so every DB authorization check
--      that depended on profiles.role / profiles.status was FALSE for it.
--      FIX: is_superadmin() resolves the caller from auth.users / auth.jwt()
--      and never depends on public.profiles.
--
-- DESIGN NOTES:
--   * One permissive policy - "Superadmin full access" - is installed on every
--     RLS-enabled table in public for role authenticated, with
--     USING / WITH CHECK = public.is_superadmin().
--     Postgres OR-s permissive policies, so this can only ADD access for the
--     Superadmin; no staff or admin capability is removed.
--   * Tables with RLS DISABLED are skipped on purpose: they cannot deny
--     anything, and enabling RLS there would break other roles.
--   * Tables created later are not covered automatically. Re-run this file
--     (it is idempotent) after adding a new table.
--
-- SAFETY:
--   * Fully idempotent - safe to run repeatedly.
--   * Wrapped in a single transaction (all-or-nothing).
--   * Ends with verification assertions that abort the migration on failure.
--   * Rollback notes at the bottom of the file.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CANONICAL SUPERADMIN ADDRESS (single source of truth for the database)
--    Mirrors VITE_SUPERADMIN_EMAIL in .env.development / .env.production and
--    SUPERADMIN_EMAIL on the hosting platform.
-- ============================================================================
INSERT INTO public.system_config (key, value, updated_at)
VALUES ('superadmin_email', 'wolf.palomar@gmail.com', now())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- ============================================================================
-- 2. AUTHORIZATION HELPERS (the only place identity is decided)
-- ============================================================================

-- 2.1 Reads the configured Superadmin address, lower-cased. Falls back to the
--     canonical address when the row is missing or empty.
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
  SELECT lower(trim(value)) INTO v_email
  FROM public.system_config
  WHERE key = 'superadmin_email'
  LIMIT 1;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN lower('wolf.palomar@gmail.com');
  END IF;

  RETURN v_email;
END;
$$;

-- 2.2 Canonical allow-list, mirroring VITE_SUPERADMIN_EMAIL.
--     Postgres cannot read Vite/Vercel environment variables, so the same
--     address is mirrored here as a safety net: a wrong value pushed into
--     public.system_config can never lock the owner out of the system again.
CREATE OR REPLACE FUNCTION public.get_superadmin_allowlist()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['wolf.palomar@gmail.com']::TEXT[];
$$;

-- 2.3 The canonical Superadmin test used by every policy. Never depends on
--     public.profiles (the Superadmin account has no profile row).
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_caller TEXT := '';
  v_configured TEXT;
  v_jwt_role TEXT;
  v_profile_role TEXT;
BEGIN
  -- Never promote an anonymous caller.
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Resolve the caller's own address from auth.users (authoritative), then
  -- fall back to the JWT claim.
  SELECT lower(trim(u.email)) INTO v_caller
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF v_caller IS NULL OR v_caller = '' THEN
    v_caller := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  END IF;

  IF v_caller = '' THEN
    RETURN FALSE;
  END IF;

  -- (A) Address configured in the database.
  v_configured := lower(trim(COALESCE(public.get_superadmin_email(), '')));
  IF v_configured <> '' AND v_caller = v_configured THEN
    RETURN TRUE;
  END IF;

  -- (B) Canonical allow-list safety net.
  IF v_caller = ANY (public.get_superadmin_allowlist()) THEN
    RETURN TRUE;
  END IF;

  -- (C) Explicit Superadmin role claims (future-proof, no enum change needed).
  v_jwt_role := lower(COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  ));
  IF v_jwt_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  SELECT lower(COALESCE(role::text, '')) INTO v_profile_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_profile_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2.4 Administrator test. Deliberately permissive: it keeps every capability
--     the previous definitions granted (profiles.role = 'admin', JWT metadata
--     role) and only ADDS the role-independent Superadmin path. No status
--     filter is applied, so pending admins keep the access they had before.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF public.is_superadmin() THEN
    RETURN TRUE;
  END IF;

  IF lower(COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin' THEN
    RETURN TRUE;
  END IF;

  IF lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '')) = 'admin' THEN
    RETURN TRUE;
  END IF;

  SELECT lower(COALESCE(role::text, '')) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IN ('admin', 'superadmin') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2.5 Consumed by products, sales, revenue_goals and system_config policies.
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin();
$$;

-- 2.6 Consumed by every cash_sessions / cash_transactions policy.
CREATE OR REPLACE FUNCTION public.is_cash_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.get_superadmin_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_superadmin_email() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_superadmin_allowlist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_superadmin_allowlist() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_superadmin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_cash_admin() TO authenticated, service_role;

-- ============================================================================
-- 3. SUPERADMIN FULL ACCESS ON EVERY RLS-ENABLED TABLE IN public
--    Permissive policies are OR-ed, so this only ever ADDS access for the
--    Superadmin. Tables with RLS disabled are skipped: no policy can block
--    them, and enabling RLS would break unrelated roles.
-- ============================================================================
DO $$
DECLARE
  r RECORD;
  v_policy CONSTANT TEXT := 'Superadmin full access';
  v_installed INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated '
      'USING (public.is_superadmin()) WITH CHECK (public.is_superadmin())',
      v_policy,
      r.table_name
    );
    v_installed := v_installed + 1;
    RAISE NOTICE '[superadmin-rls-repair] full access granted on public.%', r.table_name;
  END LOOP;

  RAISE NOTICE '[superadmin-rls-repair] policy installed on % RLS-enabled table(s).', v_installed;
END $$;

-- ============================================================================
-- 4. public.gym_profile - MAKE UPSERT WORK AGAIN
--    (SELECT stays public, because the login screen renders branding while
--     unauthenticated)
-- ============================================================================
DROP POLICY IF EXISTS "Allow public read access to gym profile" ON public.gym_profile;
CREATE POLICY "Allow public read access to gym profile"
  ON public.gym_profile FOR SELECT
  TO public
  USING (true);

-- The missing policy that caused:
--   new row violates row-level security policy for table "gym_profile"
DROP POLICY IF EXISTS "Allow admins to insert gym profile" ON public.gym_profile;
CREATE POLICY "Allow admins to insert gym profile"
  ON public.gym_profile FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to update gym profile" ON public.gym_profile;
CREATE POLICY "Allow admins to update gym profile"
  ON public.gym_profile FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to delete gym profile" ON public.gym_profile;
CREATE POLICY "Allow admins to delete gym profile"
  ON public.gym_profile FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 5. public.system_config - WRITE ACCESS FOR EVERY KEY + STOP THE LEAK
-- ============================================================================
-- Legacy policy from 20260919000000: USING (true) exposed EVERY row,
-- including 'superadmin_email', to any authenticated user.
DROP POLICY IF EXISTS "Allow authenticated read system_config" ON public.system_config;

-- Staff keep read access to the operational keys only; Admin/Superadmin can
-- read every row (including 'superadmin_email').
DROP POLICY IF EXISTS "allow_authenticated_read_public_config" ON public.system_config;
CREATE POLICY "allow_authenticated_read_public_config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (key <> 'superadmin_email' OR public.is_admin());

-- Superseded narrow policies (key = 'security_access_control' only).
DROP POLICY IF EXISTS "allow_admin_insert_security_config" ON public.system_config;
DROP POLICY IF EXISTS "allow_admin_update_security_config" ON public.system_config;

DROP POLICY IF EXISTS "allow_admin_insert_system_config" ON public.system_config;
CREATE POLICY "allow_admin_insert_system_config"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "allow_admin_update_system_config" ON public.system_config;
CREATE POLICY "allow_admin_update_system_config"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "allow_admin_delete_system_config" ON public.system_config;
CREATE POLICY "allow_admin_delete_system_config"
  ON public.system_config FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 6. VERIFICATION - aborts the whole transaction if anything is off
-- ============================================================================
DO $$
DECLARE
  v_email TEXT;
  v_helpers TEXT[] := ARRAY[
    'get_superadmin_email',
    'get_superadmin_allowlist',
    'is_superadmin',
    'is_admin',
    'is_admin_or_superadmin',
    'is_cash_admin'
  ];
  v_name TEXT;
  v_policies INT;
  v_gym_policies INT;
BEGIN
  SELECT lower(trim(value)) INTO v_email
  FROM public.system_config
  WHERE key = 'superadmin_email';

  IF v_email IS DISTINCT FROM 'wolf.palomar@gmail.com' THEN
    RAISE EXCEPTION
      'Migration aborted: system_config.superadmin_email is % but must be wolf.palomar@gmail.com',
      COALESCE(v_email, '<missing>');
  END IF;

  FOREACH v_name IN ARRAY v_helpers LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    ) THEN
      RAISE EXCEPTION 'Migration aborted: public.%() is missing.', v_name;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND policyname = 'Superadmin full access';

  IF v_policies = 0 THEN
    RAISE EXCEPTION
      'Migration aborted: no "Superadmin full access" policy was installed.';
  END IF;

  SELECT count(*) INTO v_gym_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'gym_profile'
    AND cmd = 'INSERT';

  IF v_gym_policies = 0 THEN
    RAISE EXCEPTION
      'Migration aborted: public.gym_profile still has no INSERT policy (upsert would fail).';
  END IF;

  RAISE NOTICE
    '[superadmin-rls-repair] OK - superadmin_email=%, helpers=%, superadmin policies=%, gym_profile INSERT policies=%',
    v_email, array_length(v_helpers, 1), v_policies, v_gym_policies;
END $$;

COMMIT;

-- ============================================================================
-- 7. POST-DEPLOY CHECK (run after applying, signed in as the Superadmin)
-- ----------------------------------------------------------------------------
--   SQL Editor (as the project owner - auth.uid() is NULL there, so the helpers
--   intentionally report false; use it only to inspect the stored values):
--     SELECT key, value FROM public.system_config WHERE key = 'superadmin_email';
--     SELECT tablename, policyname, cmd FROM pg_policies
--      WHERE schemaname = 'public' AND policyname IN (
--        'Superadmin full access',
--        'Allow admins to insert gym profile',
--        'allow_admin_update_system_config'
--      )
--      ORDER BY tablename, cmd;
--
--   Browser DevTools console of the running app (returns true only for the
--   configured Superadmin account). Replace <ref>, <url> and <anon-key> with
--   the values from .env.development / .env.production:
--     const s  = JSON.parse(localStorage.getItem('sb-<ref>-auth-token'));
--     const r  = await fetch('<url>/rest/v1/rpc/is_superadmin', {
--       method: 'POST',
--       headers: {
--         'Content-Type': 'application/json',
--         apikey: '<anon-key>',
--         Authorization: 'Bearer ' + s.access_token,
--       },
--     });
--     await r.json();   // => true
--
--   Simplest end-to-end check: reload System Settings, press SAVE CHANGES on
--   "Gym Profile" and on "Facility Access & Security". Both must toast success.
-- ============================================================================

-- ============================================================================
-- 8. ROLLBACK (commented out - run only to undo this migration)
-- ----------------------------------------------------------------------------
--   BEGIN;
--
--   -- 8.1 Remove the Superadmin catch-all policies
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT tablename FROM pg_policies
--              WHERE schemaname = 'public' AND policyname = 'Superadmin full access'
--     LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
--                      'Superadmin full access', r.tablename);
--     END LOOP;
--   END $$;
--
--   -- 8.2 Drop the gym_profile INSERT/DELETE policies
--   DROP POLICY IF EXISTS "Allow admins to insert gym profile" ON public.gym_profile;
--   DROP POLICY IF EXISTS "Allow admins to delete gym profile" ON public.gym_profile;
--
--   -- 8.3 Restore the previous system_config policies
--   DROP POLICY IF EXISTS "allow_admin_insert_system_config" ON public.system_config;
--   DROP POLICY IF EXISTS "allow_admin_update_system_config" ON public.system_config;
--   DROP POLICY IF EXISTS "allow_admin_delete_system_config" ON public.system_config;
--
--   -- 8.4 Restore the pre-2026-09-22 helper definitions by re-running
--   --     20260919000000_transfer_superadmin_ownership.sql (section 3) and
--   --     20260918000000_add_superadmin_email_config.sql (sections 3.1-3.4).
--
--   COMMIT;
-- ============================================================================





