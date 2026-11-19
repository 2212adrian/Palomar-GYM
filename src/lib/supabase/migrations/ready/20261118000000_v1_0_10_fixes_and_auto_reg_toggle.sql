-- ============================================================================
-- Migration: v1.0.10 Fixes — Profile Trigger Identity RPC Support, Profile Auto-Activation,
--            and Auto-Enable Online Registration on Cash Session Open
-- ============================================================================
-- Resolves:
--   1. `revert_user_to_local_email()` & `sync_linked_google_email()` failing with
--      "Access Denied: Only Administrators can modify account role, status, or email."
--      for Staff users because `check_profile_update_privileges()` blocked email updates
--      even inside SECURITY DEFINER identity RPCs.
--   2. Sync linked Google email into `auth.users`, `auth.identities` (email provider),
--      and `public.profiles` cleanly when binding/unbinding Google on non-email accounts.
--   3. Hardens `activate_own_profile()` using `public.is_superadmin()`.
--   4. Automatically sets `online_registration_enabled = 'true'` whenever a cash session opens.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. `public.profiles` RLS Policies & Registration Security Setup
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
REVOKE ALL ON public.profiles FROM anon;

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;
END $$;

-- Service role key & backend functions retain unrestricted access during registration & sync
CREATE POLICY "Service role full access on profiles"
    ON public.profiles FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can read their own profile; Admins/SuperAdmins can read all
CREATE POLICY "Users read own profile and admins read all"
    ON public.profiles FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR public.is_admin()
    );

-- Admins, SuperAdmins, and self-registration flows can insert profiles (guarded by BEFORE INSERT trigger)
CREATE POLICY "Admins and self insert on profiles"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR id = auth.uid()
    );

-- Staff can update own profile (role/status/email locked by trigger); Admins manage Staff; SuperAdmin manages all
CREATE POLICY "Self or authorized admin update on profiles"
    ON public.profiles FOR UPDATE TO authenticated
    USING (
        id = auth.uid()
        OR public.is_superadmin()
        OR (
            public.is_admin()
            AND LOWER(role::text) NOT IN ('admin', 'superadmin')
        )
    )
    WITH CHECK (
        id = auth.uid()
        OR public.is_superadmin()
        OR (
            public.is_admin()
            AND LOWER(role::text) NOT IN ('admin', 'superadmin')
        )
    );

-- Authorized admin delete on profiles
CREATE POLICY "Authorized admin delete on profiles"
    ON public.profiles FOR DELETE TO authenticated
    USING (
        public.is_superadmin()
        OR (
            public.is_admin()
            AND id <> auth.uid()
            AND LOWER(role::text) NOT IN ('admin', 'superadmin')
        )
    );

-- ----------------------------------------------------------------------------
-- 1. Profile Insert & Update Privilege Guard Triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_profile_insert_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_superadmin BOOLEAN;
    v_is_admin BOOLEAN;
    v_via_identity_rpc BOOLEAN;
BEGIN
    -- Allow service_role / postgres internal operations when auth.uid() is NULL
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_via_identity_rpc := (COALESCE(current_setting('app.via_identity_rpc', true), '') = 'on');
    IF v_via_identity_rpc THEN
        RETURN NEW;
    END IF;

    v_is_superadmin := public.is_superadmin();
    v_is_admin := public.is_admin();

    -- Only SuperAdmin can insert a 'superadmin' profile row
    IF LOWER(COALESCE(NEW.role::text, 'staff')) = 'superadmin' AND NOT v_is_superadmin THEN
        RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can provision SuperAdmin profiles.';
    END IF;

    -- Admins/SuperAdmins can insert new user profiles during registration
    IF v_is_admin THEN
        RETURN NEW;
    END IF;

    -- Non-admin self-insert: strictly restricted to own UID with 'staff' role
    IF NEW.id <> auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: Only Administrators can create profiles for other users.';
    END IF;

    IF LOWER(COALESCE(NEW.role::text, 'staff')) <> 'staff' THEN
        RAISE EXCEPTION 'Access Denied: Self-registered profiles cannot self-assign administrative roles.';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_profile_insert_privileges() OWNER TO postgres;

DROP TRIGGER IF EXISTS tr_check_profile_insert_privileges ON public.profiles;
CREATE TRIGGER tr_check_profile_insert_privileges
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_profile_insert_privileges();

CREATE OR REPLACE FUNCTION public.check_profile_update_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_superadmin BOOLEAN;
    v_is_admin BOOLEAN;
    v_via_identity_rpc BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_is_superadmin := public.is_superadmin();
    v_is_admin := public.is_admin();
    v_via_identity_rpc := (COALESCE(current_setting('app.via_identity_rpc', true), '') = 'on');

    -- Non-admin (Staff) updating own profile
    IF NOT v_is_admin THEN
        IF NEW.id <> auth.uid() THEN
            RAISE EXCEPTION 'Access Denied: Staff can only edit their own profile.';
        END IF;

        -- Allow trusted identity RPCs (`sync_linked_google_email` / `revert_user_to_local_email`)
        -- to synchronize the user's own email without modifying role or account status.
        IF v_via_identity_rpc
           AND NEW.role IS NOT DISTINCT FROM OLD.role
           AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
            RETURN NEW;
        END IF;

        -- Allow self-activation from 'pending' -> 'active' without altering role or email
        IF (OLD.status = 'pending'::public.user_status OR OLD.status IS NULL)
           AND NEW.status = 'active'::public.user_status
           AND NEW.role IS NOT DISTINCT FROM OLD.role
           AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
            RETURN NEW;
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.status IS DISTINCT FROM OLD.status
           OR NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Access Denied: Only Administrators can modify account role, status, or email.';
        END IF;

        RETURN NEW;
    END IF;

    -- Admin vs Admin protection: non-SuperAdmin cannot modify ANY other admin/superadmin row
    IF NOT v_is_superadmin AND OLD.id <> auth.uid() AND LOWER(OLD.role::text) IN ('admin', 'superadmin') THEN
        RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can modify Administrator accounts.';
    END IF;

    -- Non-SuperAdmin cannot edit own role/status to superadmin or alter admin role
    IF NOT v_is_superadmin AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
        IF LOWER(NEW.role::text) = 'superadmin' OR LOWER(OLD.role::text) IN ('admin', 'superadmin') THEN
            RAISE EXCEPTION 'Access Denied: Administrator roles and statuses can only be modified by the SuperAdmin.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_profile_update_privileges() OWNER TO postgres;

DROP TRIGGER IF EXISTS tr_check_profile_update_privileges ON public.profiles;
CREATE TRIGGER tr_check_profile_update_privileges
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_profile_update_privileges();

-- ----------------------------------------------------------------------------
-- 1B. Hardened SECURITY DEFINER Registration Function (`admin_register_user`)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_register_user(
    new_email TEXT,
    new_password TEXT,
    new_name TEXT,
    new_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    new_user_id UUID;
    v_clean_email TEXT := lower(trim(COALESCE(new_email, '')));
    v_clean_name TEXT := trim(COALESCE(new_name, ''));
    v_clean_role TEXT := lower(trim(COALESCE(new_role, 'staff')));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to pre-register users.';
    END IF;

    IF v_clean_role = 'superadmin' AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can provision SuperAdmin accounts.';
    END IF;

    IF v_clean_role NOT IN ('admin', 'staff') THEN
        v_clean_role := 'staff';
    END IF;

    IF v_clean_email = '' THEN
        RAISE EXCEPTION 'Email address or local handle is required.';
    END IF;

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
        v_clean_email,
        extensions.crypt(new_password, extensions.gen_salt('bf')),
        CASE WHEN v_clean_email LIKE '%@palomargym.noemail' THEN now() ELSE NULL END,
        jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', v_clean_role),
        jsonb_build_object('full_name', v_clean_name),
        'authenticated',
        'authenticated',
        now(),
        now(),
        '',
        '',
        '',
        '',
        '',
        NULL,
        NULL,
        '',
        '',
        0,
        NULL,
        '',
        NULL,
        false,
        false
    )
    RETURNING id INTO new_user_id;

    INSERT INTO auth.identities (
        id,
        user_id,
        provider,
        provider_id,
        identity_data,
        last_sign_in_at,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        new_user_id,
        'email',
        new_user_id::text,
        jsonb_build_object('sub', new_user_id::text, 'email', v_clean_email, 'email_verified', v_clean_email LIKE '%@palomargym.noemail'),
        now(),
        now(),
        now()
    );

    -- Authorize profile creation inside transaction even when RLS is strictly enforced
    PERFORM set_config('app.via_identity_rpc', 'on', true);

    INSERT INTO public.profiles (id, username, role, status, email, created_at, updated_at)
    VALUES (
        new_user_id,
        v_clean_name,
        v_clean_role::public.user_role,
        CASE WHEN v_clean_email LIKE '%@palomargym.noemail' THEN 'active'::public.user_status ELSE 'pending'::public.user_status END,
        v_clean_email,
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

ALTER FUNCTION public.admin_register_user(TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_register_user(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_user(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Trusted Google Email Binding / Unbinding & Noemail Swap RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_linked_google_email()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_google_identity RECORD;
    v_google_email TEXT;
    v_current_email TEXT;
    v_profile_email TEXT;
    v_was_noemail BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT lower(trim(COALESCE(email, ''))) INTO v_current_email FROM auth.users WHERE id = v_user_id;
    SELECT lower(trim(COALESCE(email, ''))) INTO v_profile_email FROM public.profiles WHERE id = v_user_id;

    -- Find linked google identity for this user in auth.identities
    SELECT * INTO v_google_identity
    FROM auth.identities
    WHERE user_id = v_user_id
      AND provider = 'google'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_google_identity IS NULL THEN
        RETURN jsonb_build_object('success', false, 'was_noemail', (v_current_email LIKE '%@palomargym.noemail'), 'message', 'No Google identity linked');
    END IF;

    v_google_email := lower(trim(COALESCE(
        v_google_identity.identity_data->>'email',
        v_google_identity.email
    )));

    IF v_google_email IS NULL OR v_google_email = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Google email not found in identity data');
    END IF;

    v_was_noemail := (v_current_email LIKE '%@palomargym.noemail' OR v_profile_email LIKE '%@palomargym.noemail');

    -- Synchronize whenever current auth/profile email is a placeholder or differs from the Google email
    IF v_was_noemail
       OR COALESCE(v_current_email, '') <> v_google_email
       OR COALESCE(v_profile_email, '') <> v_google_email THEN

        -- Ensure no other account already owns this email
        IF EXISTS (
            SELECT 1
            FROM auth.users
            WHERE lower(email) = v_google_email
              AND id <> v_user_id
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'was_noemail', v_was_noemail,
                'message', 'Email ' || v_google_email || ' is already used by another account'
            );
        END IF;

        UPDATE auth.users
        SET email = v_google_email,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = v_user_id;

        -- Keep local email identity synced so password sign-in works with the new Google email too
        UPDATE auth.identities
        SET identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object(
                'email', v_google_email,
                'email_verified', true
            ),
            updated_at = now()
        WHERE user_id = v_user_id
          AND provider = 'email';

        -- Authorize profile email update inside trigger for this transaction
        PERFORM set_config('app.via_identity_rpc', 'on', true);

        UPDATE public.profiles
        SET email = v_google_email,
            updated_at = now()
        WHERE id = v_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'updated', true,
            'was_noemail', v_was_noemail,
            'old_email', COALESCE(NULLIF(v_current_email, ''), v_profile_email),
            'new_email', v_google_email,
            'email', v_google_email
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'updated', false,
        'was_noemail', false,
        'email', v_current_email
    );
END;
$$;

ALTER FUNCTION public.sync_linked_google_email() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.revert_user_to_local_email()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_username TEXT;
    v_clean_slug TEXT;
    v_local_email TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = v_user_id
          AND LOWER(role::text) = 'superadmin'
    ) OR public.is_superadmin() THEN
        RAISE EXCEPTION 'Access Denied: SuperAdmin accounts cannot unlink Google or revert to a local handle.';
    END IF;

    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;

    IF v_username IS NULL OR trim(v_username) = '' THEN
        SELECT lower(regexp_replace(COALESCE(raw_user_meta_data->>'full_name', 'user'), '[^a-z0-9]', '', 'g'))
        INTO v_clean_slug
        FROM auth.users
        WHERE id = v_user_id;
    ELSE
        v_clean_slug := lower(regexp_replace(v_username, '[^a-z0-9]', '', 'g'));
    END IF;

    IF v_clean_slug IS NULL OR v_clean_slug = '' THEN
        v_clean_slug := 'user' || substr(replace(v_user_id::text, '-', ''), 1, 6);
    END IF;

    v_local_email := v_clean_slug || '@palomargym.noemail';

    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_local_email AND id <> v_user_id) THEN
        v_local_email := v_clean_slug || substr(replace(v_user_id::text, '-', ''), 1, 4) || '@palomargym.noemail';
    END IF;

    UPDATE auth.users
    SET email = v_local_email,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"email_verification_enabled": false}'::jsonb,
        updated_at = now()
    WHERE id = v_user_id;

    UPDATE auth.identities
    SET identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object(
            'email', v_local_email,
            'email_verified', true
        ),
        updated_at = now()
    WHERE user_id = v_user_id
      AND provider = 'email';

    -- Authorize profile email update inside trigger for this transaction
    PERFORM set_config('app.via_identity_rpc', 'on', true);

    UPDATE public.profiles
    SET email = v_local_email,
        email_verification_enabled = false,
        updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'local_email', v_local_email
    );
END;
$$;

ALTER FUNCTION public.revert_user_to_local_email() OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_linked_google_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_user_to_local_email() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Hardened Self-Activation / Profile Hydration RPC (Prevents RLS INSERT errors)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_own_profile()
RETURNS VOID
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

    PERFORM set_config('app.via_identity_rpc', 'on', true);

    UPDATE public.profiles
    SET status = 'active'::public.user_status,
        updated_at = NOW()
    WHERE id = v_uid
      AND (status = 'pending'::public.user_status OR status IS NULL);

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
        SELECT email,
               NULLIF(TRIM(COALESCE(
                   raw_user_meta_data->>'full_name',
                   raw_user_meta_data->>'name',
                   raw_user_meta_data->>'username',
                   split_part(email, '@', 1)
               )), '')
        INTO v_email, v_name
        FROM auth.users
        WHERE id = v_uid;

        IF public.is_superadmin() OR LOWER(COALESCE(v_email, '')) = ANY(public.get_superadmin_allowlist()) THEN
            v_role := 'admin'::public.user_role;
        ELSE
            v_role := 'staff'::public.user_role;
        END IF;

        INSERT INTO public.profiles (id, username, email, role, status, created_at, updated_at)
        VALUES (
            v_uid,
            COALESCE(v_name, 'User_' || substr(replace(v_uid::text, '-', ''), 1, 6)),
            v_email,
            v_role,
            'active'::public.user_status,
            NOW(),
            NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET status = 'active'::public.user_status,
            email = COALESCE(public.profiles.email, EXCLUDED.email),
            updated_at = NOW();
    END IF;
END;
$$;

ALTER FUNCTION public.activate_own_profile() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.activate_own_profile() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Auto-Turn ON Online Registration Switch Whenever a Cash Session Opens
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.f_tr_sync_online_reg_on_session_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'open' AND NEW.closed_at IS NULL THEN
        INSERT INTO public.system_config (key, value, updated_at)
        VALUES ('online_registration_enabled', 'true', now())
        ON CONFLICT (key) DO UPDATE
            SET value = 'true',
                updated_at = now()
            WHERE public.system_config.value IS DISTINCT FROM 'true';
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.status = 'open'
       AND NEW.closed_at IS NULL
       AND (OLD.status IS DISTINCT FROM 'open' OR OLD.closed_at IS NOT NULL) THEN
        INSERT INTO public.system_config (key, value, updated_at)
        VALUES ('online_registration_enabled', 'true', now())
        ON CONFLICT (key) DO UPDATE
            SET value = 'true',
                updated_at = now()
            WHERE public.system_config.value IS DISTINCT FROM 'true';
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.cash_sessions
        WHERE status = 'open'
          AND closed_at IS NULL
    ) THEN
        INSERT INTO public.system_config (key, value, updated_at)
        VALUES ('online_registration_enabled', 'false', now())
        ON CONFLICT (key) DO UPDATE
            SET value = 'false',
                updated_at = now()
            WHERE public.system_config.value IS DISTINCT FROM 'false';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.f_tr_sync_online_reg_on_session_change() OWNER TO postgres;

DROP TRIGGER IF EXISTS tr_sync_online_reg_on_session_change ON public.cash_sessions;
CREATE TRIGGER tr_sync_online_reg_on_session_change
    AFTER INSERT OR UPDATE OF status, closed_at OR DELETE ON public.cash_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_sync_online_reg_on_session_change();

CREATE OR REPLACE FUNCTION public.open_cash_session_safe(
    p_opening_float NUMERIC,
    p_notes TEXT DEFAULT NULL,
    p_opened_by UUID DEFAULT NULL,
    p_opened_by_name TEXT DEFAULT 'Admin'
)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.cash_sessions;
    v_session_num TEXT;
    v_caller_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    v_is_admin := public.is_cash_admin();

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can open cash sessions.';
    END IF;

    -- Close any existing open session first to prevent collision
    UPDATE public.cash_sessions
    SET status = 'closed',
        closed_at = timezone('utc', now()),
        closed_by = COALESCE(p_opened_by, v_caller_id),
        closed_by_name = COALESCE(p_opened_by_name, 'Admin')
    WHERE status = 'open';

    v_session_num := public.generate_cash_session_number();

    INSERT INTO public.cash_sessions (
        session_number,
        opened_at,
        opened_by,
        opened_by_name,
        status,
        opening_float,
        notes
    ) VALUES (
        v_session_num,
        timezone('utc', now()),
        COALESCE(p_opened_by, v_caller_id),
        COALESCE(p_opened_by_name, 'Admin'),
        'open',
        p_opening_float,
        p_notes
    )
    RETURNING * INTO v_session;

    -- Automatically enable Online Registration when a fresh cash session opens
    INSERT INTO public.system_config (key, value, updated_at)
    VALUES ('online_registration_enabled', 'true', now())
    ON CONFLICT (key) DO UPDATE
        SET value = 'true',
            updated_at = now();

    RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_cash_session_safe(NUMERIC, TEXT, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
