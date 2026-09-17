-- ============================================================================
-- MIGRATION: 20260918000000_add_superadmin_email_config.sql
-- DESCRIPTION:
--   Replaces the hardcoded Superadmin email literal with a database-backed
--   configuration value, so the address can be changed at runtime without
--   editing or redeploying any SQL.
--
--   The value lives in the single row of public.system_config where
--   key = 'superadmin_email'. Every RLS policy and helper function now reads
--   it exclusively through public.is_superadmin().
--
-- WHY THE VALUE LIVES IN THE DATABASE (and not a Vercel env var):
--   Supabase SQL executes inside the Postgres instance, which has no access to
--   Vercel environment variables. The database must therefore own the value.
--   Vercel remains the control plane: POST /api/sync-superadmin-email pushes
--   SUPERADMIN_EMAIL into this table using the service role key.
--
-- HOW TO CHANGE THE SUPERADMIN EMAIL:
--   Option 1 (Vercel-driven, recommended):
--     1. Update SUPERADMIN_EMAIL in Vercel -> Settings -> Environment Variables
--     2. POST /api/sync-superadmin-email with the SUPERADMIN_SYNC_TOKEN bearer
--   Option 2 (direct):
--     UPDATE public.system_config
--     SET value = 'new.address@example.com', updated_at = now()
--     WHERE key = 'superadmin_email';
--
-- SAFETY:
--   * Fully idempotent -- safe to re-run.
--   * Wrapped in a single transaction (all-or-nothing).
--   * A commented rollback block is provided at the bottom of this file.
--   * Superseded policies from earlier migrations are intentionally NOT touched.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CONFIGURATION STORAGE (the single source of truth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the previously hardcoded address so behaviour is byte-for-byte
-- unchanged immediately after this migration runs.
INSERT INTO public.system_config (key, value)
VALUES ('superadmin_email', 'wolf.palomar@gmail.com')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.system_config IS
  'Runtime configuration for the Palomar GYM management system. Holds the configurable Superadmin email address.';

COMMENT ON COLUMN public.system_config.key IS
  'Configuration key. Currently used: ''superadmin_email''.';

-- RLS enabled with NO policies => anon/authenticated cannot read OR write it.
-- The service_role bypasses RLS, which is how /api/sync-superadmin-email writes.
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. HELPER FUNCTIONS (the ONE place the email is read from)
-- ============================================================================

-- Reads the configured Superadmin address. SECURITY DEFINER so it can read
-- public.system_config even when invoked from an RLS policy context.
CREATE OR REPLACE FUNCTION public.get_superadmin_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.system_config WHERE key = 'superadmin_email'),
    ''
  );
$$;

-- Hide the raw address from clients; only the boolean result is exposed.
-- The owner (postgres) retains execute rights, so is_superadmin() still works.
REVOKE ALL ON FUNCTION public.get_superadmin_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_superadmin_email() FROM anon;
REVOKE ALL ON FUNCTION public.get_superadmin_email() FROM authenticated;

-- The canonical check used by every policy and every admin function below.
-- NOTE: the `<> ''` guard is critical. Without it, a missing config row would
-- evaluate as '' = '' and silently promote every anonymous caller to Superadmin.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.get_superadmin_email() <> ''
     AND LOWER(COALESCE(auth.jwt() ->> 'email', '')) = LOWER(public.get_superadmin_email());
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_superadmin_email() TO service_role;


-- ============================================================================
-- 3. REDEFINE HELPER FUNCTIONS
--    Each previously compared auth.jwt() ->> 'email' to the hardcoded literal.
--    They now defer to public.is_superadmin().
--    No policy changes are needed for these -- policies call them by name and
--    therefore pick up the new behaviour automatically.
-- ============================================================================

-- 3.1 public.is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        lower(public.get_user_role()) = 'admin' OR
        (auth.jwt() -> 'app_metadata' ->> 'role') ILIKE 'admin' OR
        (auth.jwt() -> 'user_metadata' ->> 'role') ILIKE 'admin' OR
        public.is_superadmin()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 3.2 public.is_admin_or_superadmin()
--     Consumed by: products + sales RLS (20260715000000) and
--     revenue_goals RLS (20260827200000).
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    -- 1. Configurable Superadmin check
    public.is_superadmin()
    OR
    -- 2. Check profiles table with explicit enum to text casting
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'superadmin')
        AND (status IS NULL OR status::text = 'active')
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_superadmin() TO authenticated;

-- 3.3 public.is_cash_admin()
--     Consumed by: all 7 cash_sessions / cash_transactions policies.
CREATE OR REPLACE FUNCTION public.is_cash_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    public.is_superadmin()
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'superadmin')
        AND (status IS NULL OR status::text = 'active')
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_cash_admin() TO authenticated;

-- 3.4 public.check_profile_update_privileges()  [BEFORE UPDATE trigger on profiles]
CREATE OR REPLACE FUNCTION public.check_profile_update_privileges()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Retrieve execution credentials of the active caller
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  -- If caller is not an admin and not the superadmin, prevent modifications to role or status columns
  IF NOT public.is_superadmin()
     AND COALESCE(caller_role, '') <> 'admin' THEN

    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to modify role levels.';
    END IF;

    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to modify account statuses.';
    END IF;
  END IF;

  -- Security Lock: Protect administrator account statuses from being manipulated by normal admins
  IF NOT public.is_superadmin() AND OLD.role = 'admin'::public.user_role THEN
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

-- 3.5 public.admin_delete_user(UUID)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
  target_role TEXT;
  target_status TEXT;
BEGIN
  -- Retrieve current caller profile role correctly
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  -- Retrieve target user role and status
  SELECT role::text, status::text INTO target_role, target_status
  FROM public.profiles WHERE id = target_user_id;

  -- Verify general administrative permissions (Must be admin or superadmin)
  IF NOT public.is_superadmin()
     AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
  END IF;

  -- Constraint: Active administrator accounts can only be deleted by the Superadmin
  IF COALESCE(target_role, '') = 'admin'
     AND COALESCE(target_status, '') = 'active'
     AND NOT public.is_superadmin() THEN
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

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- 3.6 public.admin_register_user(TEXT, TEXT, TEXT, TEXT)
CREATE OR REPLACE FUNCTION public.admin_register_user(
  new_email TEXT,
  new_password TEXT,
  new_name TEXT,
  new_role TEXT
)
RETURNS UUID
SECURITY DEFINER
-- Added extensions to search_path to resolve pgcrypto functions safely
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  new_user_id UUID;
  caller_role TEXT;
BEGIN
  -- 1. Security Check: Validate that the client caller is an administrator or superadmin
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF NOT public.is_superadmin() AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to pre-register users.';
  END IF;

  -- 2. Insert credentials directly into auth.users (Unconfirmed for email users to allow signup confirmation triggers)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    is_anonymous
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    new_email,
    extensions.crypt(new_password, extensions.gen_salt('bf')),
    CASE WHEN new_email LIKE '%@palomargym.noemail' THEN now() ELSE NULL END, -- email_confirmed_at remains NULL for email accounts to enable signup mailers
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', new_role), -- Synced raw_app_meta_data role on creation
    jsonb_build_object('full_name', new_name),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '', -- confirmation_token must not be null
    '', -- recovery_token must not be null
    '', -- email_change
    '', -- email_change_token_new
    '', -- email_change_token_current
    NULL, -- phone
    NULL, -- phone_confirmed_at
    '', -- phone_change
    '', -- phone_change_token
    0, -- email_change_confirm_status
    NULL, -- banned_until
    '', -- reauthentication_token
    NULL, -- reauthentication_sent_at
    false, -- is_sso_user
    false -- is_anonymous
  )
  RETURNING id INTO new_user_id;

  -- 3. Insert the REQUIRED identity mapping (email is omitted as it is automatically populated via system-generated expressions)
  INSERT INTO auth.identities (
    id, -- Expects UUID primary key
    user_id,
    provider,
    provider_id, -- Expects TEXT
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(), -- Generate secure UUID for the primary key
    new_user_id,
    'email',
    new_user_id::text, -- Match user UUID as text string
    jsonb_build_object('sub', new_user_id::text, 'email', new_email, 'email_verified', false),
    now(),
    now(),
    now()
  );

  -- 4. Sync or create corresponding profiles dataset block in public.profiles (Explicitly cast role variable to Enum)
  INSERT INTO public.profiles (id, username, role, status, email, created_at, updated_at)
  VALUES (
    new_user_id,
    new_name,
    new_role::public.user_role,
    CASE WHEN new_email LIKE '%@palomargym.noemail' THEN 'active'::public.user_status ELSE 'pending'::public.user_status END,
    new_email,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      role = EXCLUDED.role,
      email = EXCLUDED.email,
      updated_at = now();

  RETURN new_user_id;
END;
$$;

-- Grant execution privileges to authenticated administrative sessions
GRANT EXECUTE ON FUNCTION public.admin_register_user(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 3.7 public.admin_sign_out_user(UUID)
--     NOTE: This function is defined twice in the migration history
--     (20260909000001 and 20260909120000). The 20260909120000 definition is the
--     live one, so this redefinition follows that body.
CREATE OR REPLACE FUNCTION public.admin_sign_out_user(target_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Verify caller is Superadmin or an active Admin
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF NOT public.is_superadmin() AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can sign out user sessions.';
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

COMMENT ON FUNCTION public.admin_sign_out_user(UUID) IS
'Terminates all active login sessions and invalidates refresh tokens for a target user ID. Restricted to the configured Superadmin and admin accounts.';

-- 3.8 public.admin_update_username(UUID, TEXT)
CREATE OR REPLACE FUNCTION public.admin_update_username(target_user_id UUID, new_username TEXT)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  caller_role TEXT;
  cleaned_username TEXT;
BEGIN
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF NOT public.is_superadmin() AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can modify user usernames.';
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

-- 3.9 public.export_database_dump()
CREATE OR REPLACE FUNCTION public.export_database_dump()
RETURNS jsonb AS $$
DECLARE
    r RECORD;
    table_json JSONB;
    backup_payload JSONB := '{}'::jsonb;
BEGIN
    IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND LOWER(profiles.role::text) IN ('admin', 'superadmin')
        ) AND NOT public.is_superadmin() THEN
            RAISE EXCEPTION 'Access Denied: You do not have administrative clearance.';
        END IF;
    END IF;

    FOR r IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('spatial_ref_sys', 'database_backups')
    LOOP
        BEGIN
            EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM %I t', r.table_name)
            INTO table_json;
            backup_payload := jsonb_set(backup_payload, ARRAY[r.table_name], table_json, true);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to backup table %: %', r.table_name, SQLERRM;
        END;
    END LOOP;

    RETURN backup_payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.10 public.restore_database_from_payload(JSONB)
CREATE OR REPLACE FUNCTION public.restore_database_from_payload(backup_payload JSONB)
RETURNS void AS $$
DECLARE
    table_rows JSONB;
    table_to_restore TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND LOWER(profiles.role::text) IN ('admin', 'superadmin')
    ) AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Access Denied: Administrative clearance required for restoration.';
    END IF;

    IF backup_payload IS NULL OR backup_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'Invalid or empty backup payload provided.';
    END IF;

    EXECUTE 'SET LOCAL session_replication_role = ''replica''';

    FOR table_to_restore IN SELECT jsonb_object_keys(backup_payload) LOOP
        -- Safeguard: Never drop or overwrite the registry table
        IF table_to_restore != 'database_backups' AND EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = table_to_restore
        ) THEN
            EXECUTE format('DELETE FROM %I WHERE true', table_to_restore);
            table_rows := backup_payload->table_to_restore;

            IF jsonb_array_length(table_rows) > 0 THEN
                EXECUTE format(
                    'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, %L)',
                    table_to_restore,
                    table_to_restore,
                    table_rows
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. RECREATE LIVE INLINE POLICIES
--    These policies compared auth.jwt() ->> 'email' to the literal directly,
--    so they must be dropped and recreated. Only policies that are still the
--    effective (non-superseded) definition are included here. Policies already
--    replaced by later migrations are deliberately left untouched.
-- ============================================================================

-- 4.1 Profiles UPDATE (source: 20260701120000)
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
  -- Configurable Superadmin can edit any user's profile
  public.is_superadmin()
)
WITH CHECK (
  auth.uid() = id
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  )
  OR
  public.is_superadmin()
);

-- 4.2 Avatars storage: upload (source: 20260701120000)
DROP POLICY IF EXISTS "Allow authenticated users to upload avatars" ON storage.objects;
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
    public.is_superadmin()
  )
);

-- 4.3 Avatars storage: update (source: 20260701120000)
DROP POLICY IF EXISTS "Allow authenticated users to update avatars" ON storage.objects;
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
    public.is_superadmin()
  )
);

-- 4.4 Avatars storage: delete (source: 20260701120000)
DROP POLICY IF EXISTS "Allow authenticated users to delete avatars" ON storage.objects;
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
    public.is_superadmin()
  )
);
-- 4.5-4.8 Backup records (source: 20260704140000)
DROP POLICY IF EXISTS "Allow admins to read backup records" ON public.database_backups;
DROP POLICY IF EXISTS "Allow admins to insert backup records" ON public.database_backups;
DROP POLICY IF EXISTS "Allow admins to update backup records" ON public.database_backups;
DROP POLICY IF EXISTS "Allow admins to delete backup records" ON public.database_backups;

CREATE POLICY "Allow admins to read backup records"
ON public.database_backups FOR SELECT TO authenticated
USING (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR public.is_superadmin()
);

CREATE POLICY "Allow admins to insert backup records"
ON public.database_backups FOR INSERT TO authenticated
WITH CHECK (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR public.is_superadmin()
);

CREATE POLICY "Allow admins to update backup records"
ON public.database_backups FOR UPDATE TO authenticated
USING (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR public.is_superadmin()
);

CREATE POLICY "Allow admins to delete backup records"
ON public.database_backups FOR DELETE TO authenticated
USING (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR public.is_superadmin()
);

-- 4.9-4.12 Backup files (storage bucket 'backups') (source: 20260704140000)
DROP POLICY IF EXISTS "Allow admins to read backup files" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to upload backup files" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to update backup files" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to delete backup files" ON storage.objects;

CREATE POLICY "Allow admins to read backup files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR public.is_superadmin()
  )
);

CREATE POLICY "Allow admins to upload backup files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR public.is_superadmin()
  )
);

CREATE POLICY "Allow admins to update backup files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR public.is_superadmin()
  )
);

CREATE POLICY "Allow admins to delete backup files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR public.is_superadmin()
  )
);

-- 4.13 rates_config UPDATE (source: 20260704150000)
DROP POLICY IF EXISTS "Allow admins to update rates" ON public.rates_config;
CREATE POLICY "Allow admins to update rates"
ON public.rates_config
FOR UPDATE
TO authenticated
USING (
  public.is_superadmin()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  public.is_superadmin()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- 4.14 audit_logs SELECT (source: 20260704160000)
DROP POLICY IF EXISTS "Allow admins to read audit logs" ON public.audit_logs;
CREATE POLICY "Allow admins to read audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- 4.15 gym_profile UPDATE (source: 20260704170000)
DROP POLICY IF EXISTS "Allow admins to update gym profile" ON public.gym_profile;
CREATE POLICY "Allow admins to update gym profile"
ON public.gym_profile
FOR UPDATE
TO authenticated
USING (
  public.is_superadmin()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  public.is_superadmin()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- 4.16 / 4.17 - INTENTIONALLY SKIPPED: sales SELECT and UPDATE policies
-- ----------------------------------------------------------------------------
-- The FINAL definitions of "Allow authenticated users to view sales" and
-- "Allow authorized users to update sales" come from 20260715000000, NOT from
-- 20260714180000. That newer version already calls public.is_admin_or_superadmin()
-- and contains NO inline email literal, so both policies are fully covered by
-- section 3.2 above. They must NOT be recreated here.
--
-- WARNING: recreating these from the earlier 20260714180000 body would be a
-- REGRESSION. It would:
--   * restore staff UPDATE rights on sales that 20260715000000 deliberately
--     removed (that migration narrowed UPDATE to admins only), and
--   * drop the role = 'superadmin' and status = 'active' checks that
--     is_admin_or_superadmin() provides.
--
-- For reference, the live definitions (20260715000000) are:
--   view sales   : USING (public.is_admin_or_superadmin() OR (deleted_at IS NULL
--                  AND (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date))
--   update sales : USING (public.is_admin_or_superadmin())
--                  WITH CHECK (public.is_admin_or_superadmin())
--   insert sales : WITH CHECK (deleted_at IS NULL)   -- no literal, no action needed
-- (The sales DELETE policy IS recreated below as 4.20, because its latest
--  definition in 20260916140000 does still contain the inline literal.)

-- 4.18 members SELECT (source: 20260804150100)
DROP POLICY IF EXISTS "Allow authenticated users to view members" ON public.members;
CREATE POLICY "Allow authenticated users to view members" ON public.members
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'::public.user_role
        )
        OR public.is_superadmin()
        OR deleted_at IS NULL
    );

-- 4.19 members DELETE (source: 20260804150100)
DROP POLICY IF EXISTS "Allow admin and superadmin to delete members" ON public.members;
CREATE POLICY "Allow admin and superadmin to delete members" ON public.members
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'::public.user_role
        )
        OR public.is_superadmin()
    );

-- 4.20 sales DELETE (source: 20260916140000)
DROP POLICY IF EXISTS "Allow authorized users to delete sales" ON public.sales;
CREATE POLICY "Allow authorized users to delete sales" ON public.sales
    FOR DELETE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR public.is_superadmin())
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = sales.cash_session_id AND cs.status = 'open'
            )
        )
    );

-- 4.21 attendance DELETE (source: 20260916140000)
DROP POLICY IF EXISTS "Allow authorized users to delete attendance" ON public.attendance;
CREATE POLICY "Allow authorized users to delete attendance" ON public.attendance
    FOR DELETE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR public.is_superadmin())
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = attendance.cash_session_id AND cs.status = 'open'
            )
        )
    );

-- 4.22 attendance UPDATE (source: 20260916140000)
DROP POLICY IF EXISTS "Allow authenticated users to update attendance" ON public.attendance;
CREATE POLICY "Allow authenticated users to update attendance" ON public.attendance
    FOR UPDATE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR public.is_superadmin())
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = attendance.cash_session_id AND cs.status = 'open'
            )
        )
    )
    WITH CHECK (
        (lower(public.get_user_role()) = 'admin' OR public.is_superadmin())
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = attendance.cash_session_id AND cs.status = 'open'
            )
        )
    );

-- ============================================================================
-- 5. AUDIT LOG: PURGE THE EMAIL LITERAL FROM HISTORICAL SEED ROWS
--    The seed rows written by 20260704160000 stored the Superadmin address in
--    public.audit_logs.actor_username. Those rows already exist in the live
--    database, so editing the original migration file would have no effect --
--    the data must be corrected here instead.
--
--    NOTE ON RLS: the "Prevent manual updates on audit logs" policy uses
--    USING (false), but it applies only to the `authenticated` role. Running
--    this migration as the owner (postgres) -- e.g. from the Supabase SQL
--    Editor -- bypasses RLS, so this UPDATE succeeds.
-- ============================================================================
UPDATE public.audit_logs
SET actor_username = 'System'
WHERE actor_username = 'wolf.palomar@gmail.com';

-- ============================================================================
-- 6. FINAL VERIFICATION ASSERTIONS
--    These raise an exception (rolling the whole migration back) if the
--    configurable helpers were not installed correctly.
-- ============================================================================
DO $$
BEGIN
  IF public.get_superadmin_email() = '' THEN
    RAISE EXCEPTION
      'Migration aborted: public.system_config row for key ''superadmin_email'' is missing or empty.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_superadmin'
  ) THEN
    RAISE EXCEPTION 'Migration aborted: public.is_superadmin() was not created.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- 7. ROLLBACK (commented out -- run only if you need to undo this migration)
-- ----------------------------------------------------------------------------
-- Restores the hardcoded-literal behaviour. The literal is put back in ONE
-- place; every policy keeps calling is_superadmin(), which is harmless.
--
--   BEGIN;
--
--   -- Point the helpers back at a fixed address
--   CREATE OR REPLACE FUNCTION public.get_superadmin_email()
--   RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
--   AS $$ SELECT 'wolf.palomar@gmail.com'::text; $$;
--
--   -- Belt-and-braces: drop the config table
--   -- DROP TABLE IF EXISTS public.system_config;
--
--   COMMIT;
--
-- To additionally revert the individual policies to their literal-based
-- definitions, re-run the DROP/CREATE blocks from the original migrations:
--   20260701120000, 20260704140000, 20260704150000, 20260704160000,
--   20260704170000, 20260714180000, 20260804150100, 20260916140000
-- (all under src/lib/supabase/migrations/done/).
-- ============================================================================

