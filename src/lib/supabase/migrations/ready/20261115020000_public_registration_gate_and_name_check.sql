-- ============================================================================
-- Migration: v1.0.9 RBAC Security Strengthen Update + Registration Gates
-- File: 20261115020000_public_registration_gate_and_name_check.sql
--
-- Description:
--   Consolidated security hardening across all 22 public tables, storage
--   bucket 'backups', BEFORE/AFTER integrity triggers, and SECURITY DEFINER
--   RPCs so DevTools/REST/SQL calls cannot bypass frontend RBAC rules.
--   Also preserves is_gym_open() and check_member_name_exists(TEXT) for
--   anonymous public registration flows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ENUM EXTENSIONS (Must execute outside transaction block)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_type_enum') THEN
        ALTER TYPE public.customer_type_enum ADD VALUE IF NOT EXISTS 'Card';
        ALTER TYPE public.customer_type_enum ADD VALUE IF NOT EXISTS 'Physical Card';
        ALTER TYPE public.customer_type_enum ADD VALUE IF NOT EXISTS 'New Membership';
        ALTER TYPE public.customer_type_enum ADD VALUE IF NOT EXISTS 'Existing Member';
        ALTER TYPE public.customer_type_enum ADD VALUE IF NOT EXISTS 'Membership Renewal';
    END IF;
END $$;

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA PATCHES FOR TRIGGER & RPC COMPATIBILITY
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.member_cards
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE IF EXISTS public.receipts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO public.system_config (key, value, updated_at)
VALUES ('online_registration_enabled', 'false', now())
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. PUBLIC REGISTRATION RPCs (Preserved for anon & authenticated)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_registration_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_session_open BOOLEAN;
    v_enabled_raw BOOLEAN;
    v_effective_open BOOLEAN;
BEGIN
    v_session_open := EXISTS (
        SELECT 1
        FROM public.cash_sessions
        WHERE status = 'open'
          AND closed_at IS NULL
    );

    v_enabled_raw := COALESCE(
        (
            SELECT lower(trim(value)) = 'true'
            FROM public.system_config
            WHERE key = 'online_registration_enabled'
            LIMIT 1
        ),
        false
    );

    v_effective_open := (v_session_open AND v_enabled_raw);

    RETURN jsonb_build_object(
        'session_open', v_session_open,
        'enabled', v_effective_open,
        'is_open', v_effective_open
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_online_registration_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_online_registration_status() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_gym_open()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.cash_sessions
        WHERE status = 'open'
          AND closed_at IS NULL
    )
    AND COALESCE(
        (
            SELECT lower(trim(value)) = 'true'
            FROM public.system_config
            WHERE key = 'online_registration_enabled'
            LIMIT 1
        ),
        false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_gym_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_gym_open() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_member_name_exists(p_full_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_normalized TEXT;
BEGIN
    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RETURN FALSE;
    END IF;

    v_normalized := regexp_replace(lower(trim(p_full_name)), '\s+', ' ', 'g');

    RETURN EXISTS (
        SELECT 1
        FROM public.members
        WHERE deleted_at IS NULL
          AND regexp_replace(lower(trim(full_name)), '\s+', ' ', 'g') = v_normalized
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_member_name_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_member_name_exists(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. CANONICAL IDENTITY & ROLE HIERARCHY HELPERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_superadmin_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        NULLIF(TRIM((SELECT value FROM public.system_config WHERE key = 'superadmin_email' LIMIT 1)), ''),
        'wolf.palomar@gmail.com'
    );
$$;

REVOKE ALL ON FUNCTION public.get_superadmin_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_superadmin_email() TO service_role;

CREATE OR REPLACE FUNCTION public.get_superadmin_allowlist()
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT ARRAY[
        LOWER(public.get_superadmin_email()),
        'wolf.palomar@gmail.com'
    ];
$$;

REVOKE ALL ON FUNCTION public.get_superadmin_allowlist() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_superadmin_allowlist() TO service_role;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
    v_email TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    v_email := LOWER(COALESCE(NULLIF(auth.jwt() ->> 'email', ''), ''));
    IF v_email = '' THEN
        SELECT LOWER(COALESCE(email, '')) INTO v_email FROM auth.users WHERE id = auth.uid();
    END IF;

    IF v_email = '' THEN
        RETURN FALSE;
    END IF;

    RETURN v_email = ANY(public.get_superadmin_allowlist())
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND LOWER(role::text) = 'superadmin'
              AND (status IS NULL OR LOWER(status::text) = 'active')
        );
END;
$$;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN 'anon';
    END IF;

    IF public.is_superadmin() THEN
        RETURN 'superadmin';
    END IF;

    SELECT role::text INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_role IS NULL OR v_role = '' THEN
        v_role := COALESCE(
            NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', ''),
            'staff'
        );
    END IF;

    RETURN LOWER(COALESCE(v_role, 'staff'));
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    IF public.is_superadmin() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND LOWER(role::text) IN ('admin', 'superadmin')
          AND (status IS NULL OR LOWER(status::text) = 'active')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_superadmin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_cash_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.is_cash_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cash_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.member_has_running_subscription(p_member_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.member_id = p_member_id
          AND LOWER(COALESCE(s.status::text, '')) IN ('active', 'inactive')
          AND LOWER(COALESCE(s.payment_status, 'Paid')) NOT IN ('cancelled', 'voided')
          AND s.end_date > now()
          AND (
              LOWER(s.status::text) = 'active'
              OR s.start_date <= now()
          )
    );
$$;

REVOKE ALL ON FUNCTION public.member_has_running_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_has_running_subscription(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. DROP ALL PRE-EXISTING POLICIES ACROSS ALL 22 PUBLIC TABLES + BACKUPS BUCKET
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
    target_tables TEXT[] := ARRAY[
        'app_releases',
        'attendance',
        'audit_logs',
        'cards',
        'cash_sessions',
        'cash_transactions',
        'database_backups',
        'gym_profile',
        'incident_reports',
        'member_cards',
        'members',
        'migration_audit_logs',
        'online_registrations',
        'products',
        'profiles',
        'rates_config',
        'receipts',
        'revenue_goals',
        'sales',
        'stock_movements',
        'subscriptions',
        'sync_conflicts',
        'system_config'
    ];
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY(target_tables)
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;

    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND (
              policyname ILIKE '%backup%'
              OR policyname ILIKE '%backups%'
              OR policyname ILIKE '%superadmin%'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- Ensure RLS is enabled on all 22+ tables
ALTER TABLE IF EXISTS public.app_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.database_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gym_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.migration_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.online_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rates_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.revenue_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_config ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. STRICT LEAST-PRIVILEGE RLS POLICIES FOR ALL 22+ TABLES
-- ----------------------------------------------------------------------------

-- 5.1 app_releases: No access for authenticated Staff. Public /download uses anon; Admins manage releases.
CREATE POLICY "Anon can read app releases for download page"
    ON public.app_releases FOR SELECT TO anon
    USING (true);

CREATE POLICY "Admins can manage app releases"
    ON public.app_releases FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.2 attendance: Staff can view open-session/today Manila logs, INSERT, and soft-delete/restore (UPDATE guarded by trigger). No Staff hard-DELETE.
CREATE POLICY "Admins and scoped staff can read attendance"
    ON public.attendance FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = attendance.cash_session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
        OR (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
    );

CREATE POLICY "Authenticated users can insert attendance"
    ON public.attendance FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Admins and scoped staff can update attendance"
    ON public.attendance FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = attendance.cash_session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
        OR (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
    )
    WITH CHECK (
        public.is_admin()
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = attendance.cash_session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
        OR (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
    );

CREATE POLICY "Only admins can hard delete attendance"
    ON public.attendance FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5.3 audit_logs: No direct access for Staff. Writes go through SECURITY DEFINER public.log_audit_entry().
CREATE POLICY "Only admins can read audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Block direct client inserts on audit logs"
    ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (false);

CREATE POLICY "Block direct client updates on audit logs"
    ON public.audit_logs FOR UPDATE TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Only admins can delete audit logs"
    ON public.audit_logs FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5.4 cards: Read-only for Staff. Writes strictly Admins or SECURITY DEFINER RPCs/triggers.
CREATE POLICY "Authenticated users can read cards"
    ON public.cards FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Only admins can write cards directly"
    ON public.cards FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.5 member_cards: Read-only for Staff. Writes strictly Admins or SECURITY DEFINER RPCs/triggers.
CREATE POLICY "Authenticated users can read member_cards"
    ON public.member_cards FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Only admins can write member_cards directly"
    ON public.member_cards FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.6 cash_sessions: Staff can ONLY see currently open sessions OR sessions opened/closed today (Asia/Manila). No Staff writes.
CREATE POLICY "Admins and scoped staff can read cash_sessions"
    ON public.cash_sessions FOR SELECT TO authenticated
    USING (
        public.is_cash_admin()
        OR status = 'open'
        OR (opened_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        OR (closed_at IS NOT NULL AND (closed_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date)
    );

CREATE POLICY "Only cash admins can insert cash_sessions"
    ON public.cash_sessions FOR INSERT TO authenticated
    WITH CHECK (public.is_cash_admin());

CREATE POLICY "Only cash admins can update cash_sessions"
    ON public.cash_sessions FOR UPDATE TO authenticated
    USING (public.is_cash_admin())
    WITH CHECK (public.is_cash_admin());

CREATE POLICY "Only cash admins can delete cash_sessions"
    ON public.cash_sessions FOR DELETE TO authenticated
    USING (public.is_cash_admin());

-- 5.7 cash_transactions: Staff can read visible session txs & INSERT pending requests into open session. No Staff UPDATE/DELETE.
CREATE POLICY "Admins and scoped staff can read cash_transactions"
    ON public.cash_transactions FOR SELECT TO authenticated
    USING (
        public.is_cash_admin()
        OR session_id IN (
            SELECT cs.id FROM public.cash_sessions cs
            WHERE cs.status = 'open'
               OR (cs.opened_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
               OR (cs.closed_at IS NOT NULL AND (cs.closed_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date)
        )
    );

CREATE POLICY "Admins and staff can insert cash_transactions"
    ON public.cash_transactions FOR INSERT TO authenticated
    WITH CHECK (
        public.is_cash_admin()
        OR (
            type IN ('cash_in', 'cash_out', 'digital_in')
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = cash_transactions.session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
    );

CREATE POLICY "Only cash admins can update cash_transactions"
    ON public.cash_transactions FOR UPDATE TO authenticated
    USING (public.is_cash_admin())
    WITH CHECK (public.is_cash_admin());

CREATE POLICY "Only cash admins can delete cash_transactions"
    ON public.cash_transactions FOR DELETE TO authenticated
    USING (public.is_cash_admin());

-- 5.8 database_backups & storage.objects('backups'): SuperAdmin only!
CREATE POLICY "Only SuperAdmin can access database_backups"
    ON public.database_backups FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

CREATE POLICY "Only SuperAdmin can read backup objects"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'backups' AND public.is_superadmin());

CREATE POLICY "Only SuperAdmin can insert backup objects"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'backups' AND public.is_superadmin());

CREATE POLICY "Only SuperAdmin can update backup objects"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'backups' AND public.is_superadmin())
    WITH CHECK (bucket_id = 'backups' AND public.is_superadmin());

CREATE POLICY "Only SuperAdmin can delete backup objects"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'backups' AND public.is_superadmin());

-- 5.9 gym_profile: Read-only for anon & Staff; Admin/SuperAdmin write.
CREATE POLICY "Public and authenticated read access to gym_profile"
    ON public.gym_profile FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Only admins can write gym_profile"
    ON public.gym_profile FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.10 incident_reports: Admins/SuperAdmin CANNOT insert; Staff can insert own & edit/delete ONLY while Unread & unarchived.
-- Notice: Intentionally NOT given a broad SuperAdmin FOR ALL policy.
CREATE POLICY "Admins read all and Staff read own incident_reports"
    ON public.incident_reports FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR created_by = auth.uid()
    );

CREATE POLICY "Only Staff can insert incident_reports"
    ON public.incident_reports FOR INSERT TO authenticated
    WITH CHECK (
        NOT public.is_admin()
        AND COALESCE(created_by, auth.uid()) = auth.uid()
    );

CREATE POLICY "Admins update all and Staff update own unread incident_reports"
    ON public.incident_reports FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            created_by = auth.uid()
            AND status = 'Unread'
            AND is_archived = false
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            created_by = auth.uid()
            AND status = 'Unread'
            AND is_archived = false
        )
    );

CREATE POLICY "Admins delete all and Staff delete own unread incident_reports"
    ON public.incident_reports FOR DELETE TO authenticated
    USING (
        public.is_admin()
        OR (
            created_by = auth.uid()
            AND status = 'Unread'
            AND is_archived = false
        )
    );

-- 5.11 members: Staff can read (including Emergency Hub). Staff INSERT requires pending online reg or enrollment RPC. Staff UPDATE blocked when subscription running or deleting.
CREATE POLICY "Authenticated users can read members"
    ON public.members FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Admins and gated enrollment can insert members"
    ON public.members FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR current_setting('app.via_enrollment_rpc', true) = 'on'
        OR EXISTS (
            SELECT 1 FROM public.online_registrations r
            WHERE LOWER(r.status::text) = 'pending'
              AND r.is_archived = false
              AND r.deleted_at IS NULL
              AND regexp_replace(lower(trim(r.full_name)), '\s+', ' ', 'g') = regexp_replace(lower(trim(members.full_name)), '\s+', ' ', 'g')
        )
    );

CREATE POLICY "Admins and non-running non-delete staff update on members"
    ON public.members FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            deleted_at IS NULL
            AND NOT public.member_has_running_subscription(members.member_id)
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            deleted_at IS NULL
            AND NOT public.member_has_running_subscription(members.member_id)
        )
    );

CREATE POLICY "Only admins can delete members"
    ON public.members FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5.12 migration_audit_logs: SuperAdmin only!
CREATE POLICY "Only SuperAdmin can access migration_audit_logs"
    ON public.migration_audit_logs FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- 5.13 online_registrations: Anon gated INSERT; Staff read-only SELECT; Admins full write.
REVOKE SELECT ON TABLE public.online_registrations FROM anon;
GRANT INSERT ON TABLE public.online_registrations TO anon;

CREATE POLICY "Anon can submit gated online registrations"
    ON public.online_registrations FOR INSERT TO anon
    WITH CHECK (
        public.is_gym_open()
        AND status = 'Pending'::public.online_reg_status_enum
        AND is_archived = false
        AND deleted_at IS NULL
        AND deleted_by IS NULL
        AND delete_reason IS NULL
        AND length(trim(full_name)) BETWEEN 2 AND 150
        AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 7 AND 15
    );

CREATE POLICY "Authenticated users can read online_registrations"
    ON public.online_registrations FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Only admins can insert online_registrations directly"
    ON public.online_registrations FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update online_registrations"
    ON public.online_registrations FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can delete online_registrations"
    ON public.online_registrations FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5.14 products: Read-only for Staff (stock managed via SECURITY DEFINER sales triggers).
CREATE POLICY "Authenticated users can read products"
    ON public.products FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Only admins can modify products"
    ON public.products FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.15 profiles: Staff can ONLY view and edit own profile (role/status locked by trigger). Admins manage Staff only.
CREATE POLICY "Users read own profile and admins read all"
    ON public.profiles FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY "Self or admin insert on profiles"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (
        id = auth.uid()
        OR public.is_admin()
    );

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

-- 5.16 rates_config: Read-only for anon & Staff; Admin/SuperAdmin write.
CREATE POLICY "Anon and authenticated can read rates_config"
    ON public.rates_config FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Only admins can write rates_config"
    ON public.rates_config FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.17 receipts: Staff read-only ONLY for receipts in an active OPEN cash session. All writes via Admins or SECURITY DEFINER RPCs.
CREATE POLICY "Admins read all and Staff read open-session receipts"
    ON public.receipts FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = receipts.cash_session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
    );

CREATE POLICY "Only admins can insert receipts directly"
    ON public.receipts FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update receipts directly"
    ON public.receipts FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can delete receipts directly"
    ON public.receipts FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5.18 revenue_goals: No access for Staff. Admin/SuperAdmin only.
CREATE POLICY "Only admins can access revenue_goals"
    ON public.revenue_goals FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.19 sales: Staff can view open/today Manila sales, INSERT, and soft-delete/restore (UPDATE restricted by trigger). No Staff hard-DELETE.
CREATE POLICY "Admins and scoped staff can read sales"
    ON public.sales FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = sales.cash_session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
        OR (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
    );

CREATE POLICY "Authenticated users can insert sales"
    ON public.sales FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Admins and scoped staff can soft-delete or restore sales"
    ON public.sales FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = sales.cash_session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
        OR (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
    )
    WITH CHECK (
        public.is_admin()
        OR (
            cash_session_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs
                WHERE cs.id = sales.cash_session_id
                  AND cs.status = 'open'
                  AND cs.closed_at IS NULL
            )
        )
        OR (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
    );

CREATE POLICY "Only admins can hard delete sales"
    ON public.sales FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5.20 stock_movements: No access for Staff. Admin/SuperAdmin only.
CREATE POLICY "Only admins can access stock_movements"
    ON public.stock_movements FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.21 subscriptions: Staff read-only SELECT; INSERT via process_member_enrollment RPC or Admin; UPDATE/DELETE Admin only.
CREATE POLICY "Authenticated users can read subscriptions"
    ON public.subscriptions FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Admins and enrollment RPC can insert subscriptions"
    ON public.subscriptions FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR current_setting('app.via_enrollment_rpc', true) = 'on'
    );

CREATE POLICY "Only admins can update subscriptions"
    ON public.subscriptions FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can delete subscriptions"
    ON public.subscriptions FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5.22 sync_conflicts: SuperAdmin only!
CREATE POLICY "Only SuperAdmin can access sync_conflicts"
    ON public.sync_conflicts FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- 5.23 system_config: Staff read public keys only; Admins manage non-superadmin keys; SuperAdmin full access.
CREATE POLICY "Authenticated users read non-sensitive system_config"
    ON public.system_config FOR SELECT TO authenticated
    USING (
        key <> 'superadmin_email'
        OR public.is_superadmin()
    );

CREATE POLICY "Only admins write non-superadmin system_config"
    ON public.system_config FOR ALL TO authenticated
    USING (
        public.is_superadmin()
        OR (public.is_admin() AND key <> 'superadmin_email')
    )
    WITH CHECK (
        public.is_superadmin()
        OR (public.is_admin() AND key <> 'superadmin_email')
    );

-- ----------------------------------------------------------------------------
-- 6. ANTI-BYPASS BEFORE/AFTER INTEGRITY TRIGGERS
-- ----------------------------------------------------------------------------

-- 6.1 incident_reports: Block Admin/SuperAdmin INSERT; lock Staff UPDATE/DELETE once Read or Archived.
CREATE OR REPLACE FUNCTION public.f_tr_guard_incident_reports_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Administrators and SuperAdmin cannot submit incident reports.';
    END IF;

    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.status := 'Unread';
    NEW.is_archived := false;
    NEW.read_at := NULL;
    NEW.read_by := NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_incident_reports_insert ON public.incident_reports;
CREATE TRIGGER tr_guard_incident_reports_insert
    BEFORE INSERT ON public.incident_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_incident_reports_insert();

CREATE OR REPLACE FUNCTION public.f_tr_guard_incident_reports_update_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF OLD.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: You can only manage your own incident reports.';
    END IF;

    IF OLD.status <> 'Unread' OR OLD.is_archived = true THEN
        RAISE EXCEPTION 'Access Denied: Marked-as-read or archived incident reports cannot be modified or deleted by Staff.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.is_archived IS DISTINCT FROM OLD.is_archived
       OR NEW.read_at IS DISTINCT FROM OLD.read_at
       OR NEW.read_by IS DISTINCT FROM OLD.read_by
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot modify report read/archive status or ownership.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_incident_reports_update_delete ON public.incident_reports;
CREATE TRIGGER tr_guard_incident_reports_update_delete
    BEFORE UPDATE OR DELETE ON public.incident_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_incident_reports_update_delete();

-- 6.2 cash_transactions: Force Staff inserts to 'pending' (including digital_in!) and block Staff UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.f_tr_guard_cash_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_cash_admin() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.status := 'pending';
        NEW.performed_by := auth.uid();
        NEW.approved_by := NULL;
        NEW.approved_by_name := NULL;
        NEW.approved_at := NULL;
        NEW.rejection_reason := NULL;
        NEW.is_voided := false;
        NEW.voided_by := NULL;
        NEW.voided_by_name := NULL;
        NEW.voided_at := NULL;
        NEW.void_reason := NULL;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Access Denied: Only Administrators can modify, approve, reject, void, or delete cash transactions.';
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_cash_transactions ON public.cash_transactions;
CREATE TRIGGER tr_guard_cash_transactions
    BEFORE INSERT OR UPDATE OR DELETE ON public.cash_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_cash_transactions();

-- 6.3 attendance: Staff UPDATE allowed ONLY for soft-delete/restore columns (deleted_at, deleted_by, updated_at).
CREATE OR REPLACE FUNCTION public.f_tr_guard_attendance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.customer_type IS DISTINCT FROM OLD.customer_type
       OR NEW.check_in_time IS DISTINCT FROM OLD.check_in_time
       OR NEW.plan_name IS DISTINCT FROM OLD.plan_name
       OR NEW.entry_fee IS DISTINCT FROM OLD.entry_fee
       OR NEW.base_price IS DISTINCT FROM OLD.base_price
       OR NEW.gcash_fee IS DISTINCT FROM OLD.gcash_fee
       OR NEW.card_fee IS DISTINCT FROM OLD.card_fee
       OR NEW.gcash_ref_no IS DISTINCT FROM OLD.gcash_ref_no
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
       OR NEW.staff_name IS DISTINCT FROM OLD.staff_name
       OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
       OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id
       OR NEW.member_ids IS DISTINCT FROM OLD.member_ids
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot edit attendance amounts, payment status, or customer fields.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_attendance_update ON public.attendance;
CREATE TRIGGER tr_guard_attendance_update
    BEFORE UPDATE ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_attendance_update();

-- Ensure attendance card revert trigger runs cleanly under SECURITY DEFINER with safe search_path
CREATE OR REPLACE FUNCTION public.handle_card_revert_on_attendance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
       OR (TG_OP = 'DELETE') THEN

        IF (COALESCE(OLD.customer_type::text, '') IN ('Card', 'Physical Card')
            OR COALESCE(OLD.plan_name, '') ILIKE '%Physical Membership Card%'
            OR COALESCE(OLD.plan_name, '') ILIKE '%Batch Physical Cards%'
            OR COALESCE(OLD.plan_name, '') ILIKE '%Card Printing Fee%'
            OR COALESCE(OLD.plan_name, '') ILIKE '%Card Fee%') THEN

            IF (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
                UPDATE public.cards
                SET payment_status = 'NONE',
                    claim_status = 'NOT_APPLICABLE',
                    card_fee_paid = 0.00,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    claim_notes = NULL,
                    updated_at = now()
                WHERE (OLD.receipt_number IS NOT NULL AND receipt_number = OLD.receipt_number)
                   OR (OLD.member_ids IS NOT NULL AND cardinality(OLD.member_ids) > 0 AND member_id = ANY(OLD.member_ids))
                   OR (OLD.member_id IS NOT NULL AND member_id = OLD.member_id);

                UPDATE public.member_cards
                SET payment_status = 'NONE',
                    claim_status = 'NOT_APPLICABLE',
                    card_fee_paid = 0.00,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    claim_notes = NULL,
                    deleted_at = now(),
                    updated_at = now()
                WHERE (OLD.receipt_number IS NOT NULL AND receipt_number = OLD.receipt_number)
                   OR (OLD.member_ids IS NOT NULL AND cardinality(OLD.member_ids) > 0 AND member_id = ANY(OLD.member_ids))
                   OR (OLD.member_id IS NOT NULL AND member_id = OLD.member_id);
            ELSE
                UPDATE public.cards
                SET payment_status = 'NONE',
                    claim_status = 'NOT_APPLICABLE',
                    card_fee_paid = 0.00,
                    receipt_number = NULL,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    claim_notes = NULL,
                    updated_at = now()
                WHERE (OLD.receipt_number IS NOT NULL AND receipt_number = OLD.receipt_number)
                   OR (OLD.member_ids IS NOT NULL AND cardinality(OLD.member_ids) > 0 AND member_id = ANY(OLD.member_ids))
                   OR (OLD.member_id IS NOT NULL AND member_id = OLD.member_id);

                UPDATE public.member_cards
                SET payment_status = 'NONE',
                    claim_status = 'NOT_APPLICABLE',
                    card_fee_paid = 0.00,
                    receipt_number = NULL,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    claim_notes = NULL,
                    deleted_at = now(),
                    updated_at = now()
                WHERE (OLD.receipt_number IS NOT NULL AND receipt_number = OLD.receipt_number)
                   OR (OLD.member_ids IS NOT NULL AND cardinality(OLD.member_ids) > 0 AND member_id = ANY(OLD.member_ids))
                   OR (OLD.member_id IS NOT NULL AND member_id = OLD.member_id);

                IF OLD.receipt_number IS NOT NULL THEN
                    DELETE FROM public.receipts WHERE id = OLD.receipt_number;
                END IF;
            END IF;
        END IF;

    ELSIF (TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL) THEN
        IF (COALESCE(NEW.customer_type::text, '') IN ('Card', 'Physical Card')
            OR COALESCE(NEW.plan_name, '') ILIKE '%Physical Membership Card%'
            OR COALESCE(NEW.plan_name, '') ILIKE '%Batch Physical Cards%'
            OR COALESCE(NEW.plan_name, '') ILIKE '%Card Printing Fee%'
            OR COALESCE(NEW.plan_name, '') ILIKE '%Card Fee%') THEN

            UPDATE public.cards
            SET payment_status = 'PAID',
                claim_status = 'UNCLAIMED',
                card_fee_paid = CASE
                    WHEN NEW.member_ids IS NOT NULL AND cardinality(NEW.member_ids) > 0
                    THEN ROUND(COALESCE(NEW.card_fee, NEW.entry_fee, 50.00) / cardinality(NEW.member_ids), 2)
                    ELSE COALESCE(NEW.card_fee, NEW.entry_fee, 50.00)
                END,
                receipt_number = COALESCE(NEW.receipt_number, cards.receipt_number),
                updated_at = now()
            WHERE (NEW.receipt_number IS NOT NULL AND receipt_number = NEW.receipt_number)
               OR (NEW.member_ids IS NOT NULL AND cardinality(NEW.member_ids) > 0 AND member_id = ANY(NEW.member_ids))
               OR (NEW.member_id IS NOT NULL AND member_id = NEW.member_id);

            UPDATE public.member_cards
            SET payment_status = 'PAID',
                claim_status = 'UNCLAIMED',
                deleted_at = NULL,
                card_fee_paid = CASE
                    WHEN NEW.member_ids IS NOT NULL AND cardinality(NEW.member_ids) > 0
                    THEN ROUND(COALESCE(NEW.card_fee, NEW.entry_fee, 50.00) / cardinality(NEW.member_ids), 2)
                    ELSE COALESCE(NEW.card_fee, NEW.entry_fee, 50.00)
                END,
                receipt_number = COALESCE(NEW.receipt_number, member_cards.receipt_number),
                updated_at = now()
            WHERE (NEW.receipt_number IS NOT NULL AND receipt_number = NEW.receipt_number)
               OR (NEW.member_ids IS NOT NULL AND cardinality(NEW.member_ids) > 0 AND member_id = ANY(NEW.member_ids))
               OR (NEW.member_id IS NOT NULL AND member_id = NEW.member_id);
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_card_revert_on_attendance_change ON public.attendance;
CREATE TRIGGER tr_card_revert_on_attendance_change
    AFTER UPDATE OR DELETE ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_card_revert_on_attendance_change();

-- 6.4 sales: Staff UPDATE allowed ONLY for soft-delete/restore columns (deleted_at, deleted_by, updated_at).
CREATE OR REPLACE FUNCTION public.f_tr_guard_sales_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.receipt_no IS DISTINCT FROM OLD.receipt_no
       OR NEW.items IS DISTINCT FROM OLD.items
       OR NEW.product_name IS DISTINCT FROM OLD.product_name
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.amount_received IS DISTINCT FROM OLD.amount_received
       OR NEW.change_calculated IS DISTINCT FROM OLD.change_calculated
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.gcash_fee_applied IS DISTINCT FROM OLD.gcash_fee_applied
       OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
       OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id
       OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
       OR NEW.is_quarantined IS DISTINCT FROM OLD.is_quarantined
       OR NEW.quarantine_reason IS DISTINCT FROM OLD.quarantine_reason THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot modify sales items, totals, or payment details.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_sales_update ON public.sales;
CREATE TRIGGER tr_guard_sales_update
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_sales_update();

-- Ensure sales stock triggers set search_path securely
ALTER FUNCTION public.f_tr_sales_deduct_stock_on_insert() SET search_path = public;
ALTER FUNCTION public.f_tr_sales_handle_soft_delete_and_restore() SET search_path = public;

-- 6.5 members: Prevent Staff DELETE/soft-delete, prevent edits when subscription running, require online_registrations ticket or enrollment RPC on INSERT.
CREATE OR REPLACE FUNCTION public.f_tr_guard_members_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot delete member records.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Access Denied: Staff cannot create pre-deleted member records.';
        END IF;

        IF current_setting('app.via_enrollment_rpc', true) = 'on' THEN
            RETURN NEW;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.online_registrations r
            WHERE LOWER(r.status::text) = 'pending'
              AND r.is_archived = false
              AND r.deleted_at IS NULL
              AND regexp_replace(lower(trim(r.full_name)), '\s+', ' ', 'g') = regexp_replace(lower(trim(NEW.full_name)), '\s+', ' ', 'g')
        ) THEN
            RAISE EXCEPTION 'Access Denied: Staff must import a valid Pending Online Registration code or QR code to add a new member.';
        END IF;

        RETURN NEW;
    END IF;

    -- UPDATE branch for Staff
    IF NEW.deleted_at IS NOT NULL OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot archive or soft-delete member profiles.';
    END IF;

    IF current_setting('app.via_enrollment_rpc', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF public.member_has_running_subscription(OLD.member_id) THEN
        RAISE EXCEPTION 'Access Denied: Member profile "%" cannot be edited by Staff while a subscription is running.', OLD.member_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_members_write ON public.members;
CREATE TRIGGER tr_guard_members_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.members
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_members_write();

-- 6.6 profiles: Strict SuperAdmin > Admin > Staff hierarchy on UPDATE and DELETE.
CREATE OR REPLACE FUNCTION public.check_profile_update_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_superadmin BOOLEAN;
    v_is_admin BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_is_superadmin := public.is_superadmin();
    v_is_admin := public.is_admin();

    -- Non-admin (Staff) updating own profile cannot elevate role or alter status/email
    IF NOT v_is_admin THEN
        IF NEW.id <> auth.uid() THEN
            RAISE EXCEPTION 'Access Denied: Staff can only edit their own profile.';
        END IF;
        IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Access Denied: Only Administrators can modify account role, status, or email.';
        END IF;
        RETURN NEW;
    END IF;

    -- Admin vs Admin protection: non-SuperAdmin cannot modify ANY other admin/superadmin row (regardless of active/pending/disabled status)
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

CREATE OR REPLACE FUNCTION public.f_tr_guard_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN OLD;
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Administrators can delete user profiles.';
    END IF;

    IF OLD.id = auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: You cannot delete your own account.';
    END IF;

    IF NOT public.is_superadmin() AND LOWER(OLD.role::text) IN ('admin', 'superadmin') THEN
        RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can delete Administrator accounts.';
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_profile_delete ON public.profiles;
CREATE TRIGGER tr_guard_profile_delete
    BEFORE DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_profile_delete();

-- 6.7 cash_sessions & system_config: Auto-reset online_registration_enabled to false when session closes and block turning ON while closed.
CREATE OR REPLACE FUNCTION public.f_tr_sync_online_reg_on_session_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.cash_sessions
        WHERE status = 'open'
          AND closed_at IS NULL
    ) THEN
        UPDATE public.system_config
        SET value = 'false',
            updated_at = now()
        WHERE key = 'online_registration_enabled'
          AND value IS DISTINCT FROM 'false';
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_online_reg_on_session_change ON public.cash_sessions;
CREATE TRIGGER tr_sync_online_reg_on_session_change
    AFTER INSERT OR UPDATE OF status, closed_at OR DELETE ON public.cash_sessions
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.f_tr_sync_online_reg_on_session_change();

CREATE OR REPLACE FUNCTION public.f_tr_guard_online_reg_system_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.key = 'online_registration_enabled' AND lower(trim(COALESCE(NEW.value, 'false'))) = 'true' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.cash_sessions
            WHERE status = 'open'
              AND closed_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Cannot enable online registration while cash drawer session is closed.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_online_reg_system_config ON public.system_config;
CREATE TRIGGER tr_guard_online_reg_system_config
    BEFORE INSERT OR UPDATE ON public.system_config
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_guard_online_reg_system_config();

-- ----------------------------------------------------------------------------
-- 7. HARDENED SECURITY DEFINER RPCs
-- ----------------------------------------------------------------------------

-- 7.1 User Management RPCs enforcing SuperAdmin > Admin > Staff
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_target_role TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
    END IF;

    IF auth.uid() = target_user_id THEN
        RAISE EXCEPTION 'Access Denied: You cannot delete your own account.';
    END IF;

    SELECT LOWER(COALESCE(role::text, 'staff')) INTO v_target_role
    FROM public.profiles WHERE id = target_user_id;

    IF NOT public.is_superadmin() AND v_target_role IN ('admin', 'superadmin') THEN
        RAISE EXCEPTION 'Access Denied: Administrator accounts can only be deleted by the SuperAdmin.';
    END IF;

    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sign_out_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_target_role TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only administrators can sign out user sessions.';
    END IF;

    SELECT LOWER(COALESCE(role::text, 'staff')) INTO v_target_role
    FROM public.profiles WHERE id = target_user_id;

    IF NOT public.is_superadmin() AND v_target_role IN ('admin', 'superadmin') AND target_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can sign out other Administrator accounts.';
    END IF;

    DELETE FROM auth.sessions WHERE user_id = target_user_id;
    DELETE FROM auth.refresh_tokens
    WHERE user_id = target_user_id::text
       OR session_id IN (SELECT id FROM auth.sessions WHERE user_id = target_user_id);

    UPDATE auth.users
    SET reauthentication_token = gen_random_uuid()::text,
        updated_at = now()
    WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sign_out_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sign_out_user(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_username(target_user_id UUID, new_username TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_target_role TEXT;
    cleaned_username TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only administrators can modify user usernames.';
    END IF;

    SELECT LOWER(COALESCE(role::text, 'staff')) INTO v_target_role
    FROM public.profiles WHERE id = target_user_id;

    IF NOT public.is_superadmin() AND v_target_role IN ('admin', 'superadmin') AND target_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can modify other Administrator accounts.';
    END IF;

    cleaned_username := trim(new_username);
    IF length(cleaned_username) < 2 THEN
        RAISE EXCEPTION 'Username must be at least 2 characters.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(cleaned_username) AND id <> target_user_id) THEN
        RAISE EXCEPTION 'Username "%" is already in use.', cleaned_username;
    END IF;

    UPDATE public.profiles
    SET username = cleaned_username,
        full_name = cleaned_username,
        updated_at = now()
    WHERE id = target_user_id;

    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
        COALESCE(raw_user_meta_data, '{}'::jsonb),
        '{full_name}',
        to_jsonb(cleaned_username)
    )
    WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_username(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_username(UUID, TEXT) TO authenticated;

-- 7.2 Audit Logging RPC (Staff-safe gateway to audit_logs)
DROP FUNCTION IF EXISTS public.log_audit_entry(uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.log_audit_entry(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.log_audit_entry(
    p_user_id UUID,
    p_actor_username TEXT,
    p_action TEXT,
    p_target_id TEXT,
    p_details TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_log_id UUID;
    v_effective_user UUID;
BEGIN
    v_effective_user := COALESCE(auth.uid(), p_user_id);

    INSERT INTO public.audit_logs (
        user_id,
        actor_username,
        action,
        target_id,
        details
    )
    VALUES (
        v_effective_user,
        COALESCE(NULLIF(TRIM(p_actor_username), ''), auth.jwt() ->> 'email', 'System'),
        p_action,
        p_target_id,
        p_details
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_entry(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_entry(uuid, text, text, text, text) TO authenticated, service_role;

-- 7.3 SuperAdmin-Only Backup & Sync Conflict Purge RPCs
CREATE OR REPLACE FUNCTION public.export_database_dump()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    r RECORD;
    table_json JSONB;
    backup_payload JSONB := '{}'::jsonb;
BEGIN
    IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
        IF NOT public.is_superadmin() THEN
            RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can export full database dumps.';
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
$$;

REVOKE ALL ON FUNCTION public.export_database_dump() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_database_dump() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restore_database_from_payload(backup_payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    table_rows JSONB;
    table_to_restore TEXT;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can restore database payloads.';
    END IF;

    IF backup_payload IS NULL OR backup_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'Invalid or empty backup payload provided.';
    END IF;

    EXECUTE 'SET LOCAL session_replication_role = ''replica''';

    FOR table_to_restore IN SELECT jsonb_object_keys(backup_payload) LOOP
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
$$;

REVOKE ALL ON FUNCTION public.restore_database_from_payload(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_database_from_payload(JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trigger_scheduled_storage_backup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth
AS $$
DECLARE
    v_dump JSONB;
    v_filename TEXT;
    v_size BIGINT;
    v_now_epoch BIGINT;
    v_manila_today DATE;
    v_inserted_id UUID;
    v_old_ids UUID[];
    v_old_filenames TEXT[];
BEGIN
    IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
        IF NOT public.is_superadmin() THEN
            RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can trigger database backups.';
        END IF;
    END IF;

    v_manila_today := (now() AT TIME ZONE 'Asia/Manila')::date;

    IF EXISTS (
        SELECT 1 FROM public.database_backups
        WHERE type = 'auto'
          AND (created_at AT TIME ZONE 'Asia/Manila')::date = v_manila_today
    ) THEN
        RETURN jsonb_build_object('status', 'skipped', 'message', 'Daily backup for Manila date already exists.');
    END IF;

    SELECT array_agg(id), array_agg(filename)
    INTO v_old_ids, v_old_filenames
    FROM (
        SELECT id, filename
        FROM public.database_backups
        WHERE type = 'auto'
        ORDER BY created_at DESC
        OFFSET 2
    ) old_backups;

    IF v_old_ids IS NOT NULL AND array_length(v_old_ids, 1) > 0 THEN
        DELETE FROM public.database_backups WHERE id = ANY(v_old_ids);
        BEGIN
            DELETE FROM storage.objects WHERE bucket_id = 'backups' AND name = ANY(v_old_filenames);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    v_dump := public.export_database_dump();
    IF v_dump IS NULL OR v_dump = '{}'::jsonb THEN
        RAISE EXCEPTION 'Automated backup failed: Generated empty database dump.';
    END IF;

    v_now_epoch := floor(extract(epoch from now()) * 1000)::bigint;
    v_filename := 'auto_' || v_now_epoch || '.json';
    v_size := octet_length(v_dump::text);

    INSERT INTO public.database_backups (
        filename, notes, type, size_bytes, payload, created_at, updated_at
    ) VALUES (
        v_filename,
        'Daily Automated Backup (12:00 AM Manila / 16:00 UTC)',
        'auto',
        v_size,
        v_dump,
        now(),
        now()
    ) RETURNING id INTO v_inserted_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'id', v_inserted_id,
        'filename', v_filename,
        'size_bytes', v_size,
        'manila_date', v_manila_today
    );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_scheduled_storage_backup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_scheduled_storage_backup() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_sync_conflicts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
BEGIN
    IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
        IF NOT public.is_superadmin() THEN
            RAISE EXCEPTION 'Access Denied: Only the SuperAdmin can purge sync conflicts.';
        END IF;
    END IF;

    DELETE FROM public.sync_conflicts
    WHERE created_at < (now() - interval '24 hours');

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        INSERT INTO public.audit_logs (
            user_id,
            actor_username,
            action,
            target_id,
            details
        ) VALUES (
            auth.uid(),
            COALESCE(auth.jwt() ->> 'email', 'System Automated Cron'),
            'SYNC_CONFLICTS_24H_PURGED',
            NULL,
            format('Automated 24-hour purge deleted %s expired sync_conflicts record(s).', v_deleted_count)
        );
    END IF;

    RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_sync_conflicts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_sync_conflicts() TO authenticated, service_role;

-- 7.4 Cash Transaction Approval / Rejection / Void RPCs (Enforce is_cash_admin())
CREATE OR REPLACE FUNCTION public.approve_cash_transaction(
    p_transaction_id UUID,
    p_admin_id UUID DEFAULT NULL,
    p_admin_name TEXT DEFAULT 'Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_tx RECORD;
    v_admin_id UUID;
BEGIN
    IF NOT public.is_cash_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Administrators can approve cash transactions.';
    END IF;

    v_admin_id := COALESCE(auth.uid(), p_admin_id);

    SELECT * INTO v_tx
    FROM public.cash_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id;
    END IF;

    IF v_tx.is_voided THEN
        RAISE EXCEPTION 'Cannot approve a transaction that has been voided.';
    END IF;

    IF v_tx.status <> 'pending' THEN
        RAISE EXCEPTION 'Transaction is not in pending status (current status: %).', v_tx.status;
    END IF;

    UPDATE public.cash_transactions
    SET status = 'approved',
        approved_by = v_admin_id,
        approved_by_name = COALESCE(p_admin_name, 'Admin'),
        approved_at = timezone('utc', now())
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', p_transaction_id,
        'status', 'approved',
        'approved_by_name', COALESCE(p_admin_name, 'Admin')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_cash_transaction(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_cash_transaction(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_cash_transaction(
    p_transaction_id UUID,
    p_admin_id UUID DEFAULT NULL,
    p_admin_name TEXT DEFAULT 'Admin',
    p_reason TEXT DEFAULT 'Declined by Administrator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_tx RECORD;
    v_admin_id UUID;
BEGIN
    IF NOT public.is_cash_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Administrators can reject cash transactions.';
    END IF;

    v_admin_id := COALESCE(auth.uid(), p_admin_id);

    SELECT * INTO v_tx
    FROM public.cash_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id;
    END IF;

    IF v_tx.status <> 'pending' THEN
        RAISE EXCEPTION 'Transaction is not in pending status (current status: %).', v_tx.status;
    END IF;

    UPDATE public.cash_transactions
    SET status = 'rejected',
        approved_by = v_admin_id,
        approved_by_name = COALESCE(p_admin_name, 'Admin'),
        approved_at = timezone('utc', now()),
        rejection_reason = TRIM(COALESCE(p_reason, 'Declined by Administrator'))
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', p_transaction_id,
        'status', 'rejected',
        'reason', TRIM(COALESCE(p_reason, 'Declined by Administrator'))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_cash_transaction(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_cash_transaction(UUID, UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_cash_transaction(
    p_transaction_id UUID,
    p_admin_id UUID DEFAULT NULL,
    p_admin_name TEXT DEFAULT 'Admin',
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_tx RECORD;
    v_admin_id UUID;
BEGIN
    IF NOT public.is_cash_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Administrators can void cash transactions.';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'A specific reason of at least 5 characters is required to void a cash transaction.';
    END IF;

    v_admin_id := COALESCE(auth.uid(), p_admin_id);

    SELECT * INTO v_tx
    FROM public.cash_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id;
    END IF;

    IF v_tx.is_voided THEN
        RAISE EXCEPTION 'This transaction has already been voided.';
    END IF;

    UPDATE public.cash_transactions
    SET is_voided = true,
        voided_by = v_admin_id,
        voided_by_name = COALESCE(p_admin_name, 'Admin'),
        voided_at = timezone('utc', now()),
        void_reason = TRIM(p_reason)
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', p_transaction_id,
        'is_voided', true,
        'void_reason', TRIM(p_reason),
        'voided_by_name', COALESCE(p_admin_name, 'Admin')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.void_cash_transaction(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_cash_transaction(UUID, UUID, TEXT, TEXT) TO authenticated;

-- 7.5 Card Lifecycle RPCs (Used cleanly by Staff & Admin via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.mark_card_claimed(
    p_member_id VARCHAR,
    p_claimed_by TEXT DEFAULT 'Counter Staff',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_card RECORD;
    v_member RECORD;
    v_actor TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_card FROM public.cards WHERE member_id = p_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card record not found for member %', p_member_id;
    END IF;

    SELECT * INTO v_member FROM public.members WHERE member_id = p_member_id;
    v_actor := COALESCE(NULLIF(TRIM(p_claimed_by), ''), auth.jwt() ->> 'email', 'Counter Staff');

    UPDATE public.cards
    SET claim_status = 'CLAIMED',
        claimed_at = now(),
        claimed_by = v_actor,
        claim_notes = p_notes,
        updated_at = now()
    WHERE member_id = p_member_id
    RETURNING * INTO v_card;

    UPDATE public.member_cards
    SET claim_status = 'CLAIMED',
        claimed_at = now(),
        claimed_by = v_actor,
        claim_notes = p_notes,
        updated_at = now()
    WHERE member_id = p_member_id AND status = 'Active';

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        'CARD_CLAIMED',
        p_member_id,
        format('Physical card claimed and released to member %s (%s). Notes: %s',
            COALESCE(v_member.full_name, p_member_id),
            p_member_id,
            COALESCE(p_notes, 'None')
        )
    );

    RETURN to_jsonb(v_card);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_card_claimed(VARCHAR, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_card_claimed(VARCHAR, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_claim_member_card(
    p_member_id VARCHAR,
    p_staff_name TEXT DEFAULT 'Counter Staff',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_card RECORD;
    v_member RECORD;
    v_actor TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_card FROM public.cards WHERE member_id = p_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card record not found for member %', p_member_id;
    END IF;

    SELECT * INTO v_member FROM public.members WHERE member_id = p_member_id;
    v_actor := COALESCE(NULLIF(TRIM(p_staff_name), ''), auth.jwt() ->> 'email', 'Counter Staff');

    UPDATE public.cards
    SET claim_status = 'UNCLAIMED',
        claimed_at = NULL,
        claimed_by = NULL,
        claim_notes = COALESCE(p_notes, 'Claim status reverted to Unclaimed'),
        updated_at = now()
    WHERE member_id = p_member_id
    RETURNING * INTO v_card;

    UPDATE public.member_cards
    SET claim_status = 'UNCLAIMED',
        claimed_at = NULL,
        claimed_by = NULL,
        claim_notes = COALESCE(p_notes, 'Claim status reverted to Unclaimed'),
        updated_at = now()
    WHERE member_id = p_member_id AND status = 'Active';

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        'CARD_CLAIM_UNDONE',
        p_member_id,
        format('Reverted physical card claim status to UNCLAIMED for %s (%s).',
            COALESCE(v_member.full_name, p_member_id),
            p_member_id
        )
    );

    RETURN to_jsonb(v_card);
END;
$$;

REVOKE ALL ON FUNCTION public.undo_claim_member_card(VARCHAR, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_claim_member_card(VARCHAR, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unbind_member_card(
    p_member_id VARCHAR,
    p_staff_name TEXT DEFAULT 'Counter Staff'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_actor TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_actor := COALESCE(NULLIF(TRIM(p_staff_name), ''), auth.jwt() ->> 'email', 'Counter Staff');

    UPDATE public.cards
    SET status = 'Inactive',
        updated_at = now()
    WHERE member_id = p_member_id;

    UPDATE public.member_cards
    SET status = 'Deactivated',
        updated_at = now()
    WHERE member_id = p_member_id;

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        'CARD_UNBOUND',
        p_member_id,
        format('Deactivated and unbound card credential for %s.', p_member_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.unbind_member_card(VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unbind_member_card(VARCHAR, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.pay_physical_card(VARCHAR, DECIMAL, TEXT, VARCHAR, TEXT);
CREATE OR REPLACE FUNCTION public.pay_physical_card(
    p_member_id VARCHAR,
    p_amount DECIMAL DEFAULT 50.00,
    p_payment_method TEXT DEFAULT 'Cash',
    p_receipt_no VARCHAR DEFAULT NULL,
    p_staff_name TEXT DEFAULT 'Counter Staff',
    p_gcash_ref_no TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_card RECORD;
    v_member RECORD;
    v_receipt_id VARCHAR;
    v_card_num TEXT;
    v_exp TIMESTAMPTZ;
    v_payment_method public.payment_method_enum;
    v_actor TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cash_sessions WHERE status = 'open' AND closed_at IS NULL) THEN
        RAISE EXCEPTION 'Cash drawer session is closed. Open a cash session before recording card payments.';
    END IF;

    SELECT * INTO v_member FROM public.members WHERE member_id = p_member_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member profile not found for %', p_member_id;
    END IF;

    IF lower(COALESCE(p_payment_method, 'Cash')) LIKE '%gcash%' THEN
        v_payment_method := 'GCash'::public.payment_method_enum;
    ELSE
        v_payment_method := 'Cash'::public.payment_method_enum;
    END IF;

    v_actor := COALESCE(NULLIF(TRIM(p_staff_name), ''), auth.jwt() ->> 'email', 'Counter Staff');
    v_receipt_id := COALESCE(NULLIF(TRIM(p_receipt_no), ''), format('REC-CARD-%s', floor(extract(epoch from now()))::bigint));
    v_exp := now() + INTERVAL '3 years';
    v_card_num := gen_random_uuid()::text;

    INSERT INTO public.receipts (
        id, member_id, customer_name, customer_type, amount, base_price,
        gcash_fee, card_fee, gcash_ref_no, payment_method, payment_status,
        item_description, processed_by
    ) VALUES (
        v_receipt_id,
        p_member_id,
        v_member.full_name,
        'Physical Card'::public.customer_type_enum,
        p_amount,
        0.00,
        0.00,
        p_amount,
        NULLIF(TRIM(p_gcash_ref_no), ''),
        v_payment_method,
        'Paid',
        'Physical Membership Card Fee',
        v_actor
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.cards (
        member_id, card_number, card_type, status, version,
        payment_status, claim_status, card_fee_paid, receipt_number,
        issued_at, expires_at, updated_at
    ) VALUES (
        p_member_id, v_card_num, 'QR'::public.card_type_enum, 'Active', 1,
        'PAID', 'UNCLAIMED', p_amount, v_receipt_id,
        now(), v_exp, now()
    )
    ON CONFLICT (member_id) DO UPDATE SET
        status = 'Active',
        payment_status = 'PAID',
        claim_status = 'UNCLAIMED',
        card_fee_paid = EXCLUDED.card_fee_paid,
        receipt_number = EXCLUDED.receipt_number,
        claimed_at = NULL,
        claimed_by = NULL,
        updated_at = now()
    RETURNING * INTO v_card;

    INSERT INTO public.member_cards (
        member_id, card_number, card_type, status, version,
        payment_status, claim_status, card_fee_paid, receipt_number,
        issued_at, expires_at, updated_at
    ) VALUES (
        p_member_id, v_card.card_number, 'QR', 'Active', COALESCE(v_card.version, 1),
        'PAID', 'UNCLAIMED', p_amount, v_receipt_id,
        now(), v_exp, now()
    )
    ON CONFLICT (card_number) DO UPDATE SET
        payment_status = 'PAID',
        claim_status = 'UNCLAIMED',
        card_fee_paid = EXCLUDED.card_fee_paid,
        receipt_number = EXCLUDED.receipt_number,
        deleted_at = NULL,
        updated_at = now();

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        'CARD_PAID',
        p_member_id,
        format('Recorded physical card fee payment of ₱%s for %s (%s). Receipt: %s',
            p_amount, v_member.full_name, p_member_id, v_receipt_id
        )
    );

    RETURN to_jsonb(v_card);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_physical_card(VARCHAR, DECIMAL, TEXT, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_physical_card(VARCHAR, DECIMAL, TEXT, VARCHAR, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.batch_purchase_member_cards(
    p_member_ids text[],
    p_payment_method text,
    p_card_fee numeric DEFAULT 50.00,
    p_gcash_ref_no text DEFAULT NULL,
    p_staff_name text DEFAULT 'Admin Staff'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_member_id text;
    v_member record;
    v_batch_receipt_id text;
    v_batch_checkin_id text;
    v_count integer := 0;
    v_total_amount numeric := 0.00;
    v_first_name text := NULL;
    v_first_member_id text := NULL;
    v_summary_names text := '';
    v_now timestamptz := now();
    v_expires timestamptz := now() + interval '3 years';
    v_payment_method public.payment_method_enum;
    v_actor text;
    v_card_num text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cash_sessions WHERE status = 'open' AND closed_at IS NULL) THEN
        RAISE EXCEPTION 'Cash drawer session is closed. Open a cash session before batch purchasing cards.';
    END IF;

    IF lower(COALESCE(p_payment_method, 'Cash')) LIKE '%gcash%' THEN
        v_payment_method := 'GCash'::public.payment_method_enum;
    ELSE
        v_payment_method := 'Cash'::public.payment_method_enum;
    END IF;

    v_actor := COALESCE(NULLIF(TRIM(p_staff_name), ''), auth.jwt() ->> 'email', 'Admin Staff');
    v_batch_receipt_id := 'REC-CARD-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    v_batch_checkin_id := 'CHK-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    FOREACH v_member_id IN ARRAY p_member_ids LOOP
        SELECT * INTO v_member
        FROM public.members
        WHERE (member_id = v_member_id OR id::text = v_member_id)
          AND deleted_at IS NULL;

        IF FOUND THEN
            v_count := v_count + 1;
            IF v_first_name IS NULL THEN
                v_first_name := v_member.full_name;
                v_first_member_id := v_member.member_id;
            END IF;

            v_card_num := gen_random_uuid()::text;

            INSERT INTO public.cards (
                member_id, card_number, card_type, status, version,
                payment_status, claim_status, card_fee_paid, receipt_number,
                issued_at, expires_at, updated_at
            ) VALUES (
                v_member.member_id, v_card_num, 'QR'::public.card_type_enum, 'Active', 1,
                'PAID', 'UNCLAIMED', p_card_fee, v_batch_receipt_id,
                v_now, v_expires, v_now
            )
            ON CONFLICT (member_id) DO UPDATE SET
                status = 'Active',
                payment_status = 'PAID',
                claim_status = 'UNCLAIMED',
                card_fee_paid = p_card_fee,
                receipt_number = v_batch_receipt_id,
                updated_at = v_now;

            INSERT INTO public.member_cards (
                member_id, card_number, card_type, status, version,
                payment_status, claim_status, card_fee_paid, receipt_number,
                issued_at, expires_at, updated_at
            ) VALUES (
                v_member.member_id, v_card_num, 'QR', 'Active', 1,
                'PAID', 'UNCLAIMED', p_card_fee, v_batch_receipt_id,
                v_now, v_expires, v_now
            )
            ON CONFLICT (card_number) DO NOTHING;
        END IF;
    END LOOP;

    IF v_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'count', 0);
    END IF;

    v_total_amount := p_card_fee * v_count;
    v_summary_names := CASE
        WHEN v_count = 1 THEN v_first_name
        ELSE v_first_name || ' & ' || (v_count - 1)::text || ' others'
    END;

    INSERT INTO public.receipts (
        id, member_id, customer_name, customer_type, amount, base_price,
        gcash_fee, card_fee, gcash_ref_no, payment_method, payment_status,
        item_description, member_ids, processed_by, created_at
    ) VALUES (
        v_batch_receipt_id,
        v_first_member_id,
        v_summary_names,
        'Card'::public.customer_type_enum,
        v_total_amount,
        0.00,
        0.00,
        v_total_amount,
        NULLIF(TRIM(p_gcash_ref_no), ''),
        v_payment_method,
        'Paid',
        CASE WHEN v_count = 1 THEN 'Physical Membership Card Fee' ELSE 'Batch Physical Cards (' || v_count::text || ' pcs)' END,
        p_member_ids,
        v_actor,
        v_now
    );

    INSERT INTO public.attendance (
        id, member_id, customer_name, customer_type, check_in_time, plan_name,
        entry_fee, base_price, gcash_fee, card_fee, gcash_ref_no,
        payment_method, receipt_number, staff_name, processed_by, member_ids, created_at
    ) VALUES (
        v_batch_checkin_id,
        v_first_member_id,
        v_summary_names,
        'Card'::public.customer_type_enum,
        v_now,
        CASE WHEN v_count = 1 THEN 'Physical Membership Card' ELSE 'Batch Physical Cards (' || v_count::text || ' pcs)' END,
        v_total_amount,
        0.00,
        0.00,
        v_total_amount,
        NULLIF(TRIM(p_gcash_ref_no), ''),
        v_payment_method,
        v_batch_receipt_id,
        v_actor,
        v_actor,
        p_member_ids,
        v_now
    );

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        'CARDS_BATCH_PURCHASED',
        v_batch_receipt_id,
        format('Batch purchased physical cards for %s member(s) (₱%s via %s). Receipt: %s',
            v_count, v_total_amount, v_payment_method::text, v_batch_receipt_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'count', v_count,
        'total', v_total_amount,
        'receipt_number', v_batch_receipt_id,
        'receipt_id', v_batch_receipt_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.batch_purchase_member_cards(text[], text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_purchase_member_cards(text[], text, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_or_switch_member_card(
    p_member_id VARCHAR,
    p_card_type TEXT DEFAULT 'QR',
    p_staff_name TEXT DEFAULT 'Counter Staff',
    p_custom_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_payment_status TEXT DEFAULT 'NONE',
    p_claim_status TEXT DEFAULT 'NOT_APPLICABLE',
    p_card_fee_paid NUMERIC DEFAULT 0.00,
    p_receipt_no VARCHAR DEFAULT NULL,
    p_forced_card_number TEXT DEFAULT NULL,
    p_is_replacement BOOLEAN DEFAULT false,
    p_replacement_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_card RECORD;
    v_member RECORD;
    v_existing RECORD;
    v_exp TIMESTAMPTZ;
    v_card_num TEXT;
    v_version INT;
    v_receipt_id VARCHAR;
    v_actor TEXT;
    v_type_enum public.card_type_enum;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF COALESCE(p_card_fee_paid, 0) > 0 THEN
        IF NOT EXISTS (SELECT 1 FROM public.cash_sessions WHERE status = 'open' AND closed_at IS NULL) THEN
            RAISE EXCEPTION 'Cash drawer session is closed. Paid cards require an active cash session.';
        END IF;
    END IF;

    SELECT * INTO v_member FROM public.members WHERE member_id = p_member_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member not found for ID %', p_member_id;
    END IF;

    v_actor := COALESCE(NULLIF(TRIM(p_staff_name), ''), auth.jwt() ->> 'email', 'Counter Staff');

    IF p_card_type = 'None' THEN
        DELETE FROM public.cards WHERE member_id = p_member_id;
        UPDATE public.member_cards SET status = 'Deactivated', updated_at = now() WHERE member_id = p_member_id;
        RETURN NULL;
    END IF;

    v_type_enum := CASE WHEN p_card_type = 'Manual' THEN 'Manual'::public.card_type_enum ELSE 'QR'::public.card_type_enum END;
    SELECT * INTO v_existing FROM public.cards WHERE member_id = p_member_id;

    v_version := CASE
        WHEN p_is_replacement AND FOUND THEN COALESCE(v_existing.version, 1) + 1
        WHEN FOUND THEN COALESCE(v_existing.version, 1)
        ELSE 1
    END;

    v_exp := COALESCE(p_custom_expires_at, now() + INTERVAL '3 years');
    v_card_num := COALESCE(NULLIF(TRIM(p_forced_card_number), ''), gen_random_uuid()::text);
    v_receipt_id := COALESCE(NULLIF(TRIM(p_receipt_no), ''), CASE WHEN COALESCE(p_card_fee_paid, 0) > 0 THEN 'REC-CARD-' || floor(extract(epoch from now()))::bigint ELSE NULL END);

    IF p_is_replacement AND COALESCE(p_card_fee_paid, 0) > 0 AND v_receipt_id IS NOT NULL THEN
        INSERT INTO public.receipts (
            id, member_id, customer_name, customer_type, amount, base_price,
            gcash_fee, card_fee, payment_method, payment_status, item_description, processed_by
        ) VALUES (
            v_receipt_id,
            p_member_id,
            v_member.full_name,
            'Existing Member'::public.customer_type_enum,
            p_card_fee_paid,
            0.00,
            0.00,
            p_card_fee_paid,
            'Cash'::public.payment_method_enum,
            'Paid',
            format('Physical Card Replacement Fee (%s)', COALESCE(NULLIF(TRIM(p_replacement_reason), ''), 'Replacement')),
            v_actor
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO public.cards (
        member_id, card_number, card_type, status, version,
        payment_status, claim_status, card_fee_paid, receipt_number,
        claimed_at, claimed_by, issued_at, expires_at, replacement_reason, updated_at
    ) VALUES (
        p_member_id, v_card_num, v_type_enum, 'Active', v_version,
        COALESCE(NULLIF(p_payment_status, ''), 'NONE'),
        COALESCE(NULLIF(p_claim_status, ''), 'NOT_APPLICABLE'),
        COALESCE(p_card_fee_paid, 0),
        COALESCE(v_receipt_id, CASE WHEN FOUND THEN v_existing.receipt_number ELSE NULL END),
        CASE WHEN p_claim_status = 'CLAIMED' THEN now() ELSE NULL END,
        CASE WHEN p_claim_status = 'CLAIMED' THEN v_actor ELSE NULL END,
        now(), v_exp, p_replacement_reason, now()
    )
    ON CONFLICT (member_id) DO UPDATE SET
        card_number = EXCLUDED.card_number,
        card_type = EXCLUDED.card_type,
        status = 'Active',
        version = EXCLUDED.version,
        payment_status = EXCLUDED.payment_status,
        claim_status = EXCLUDED.claim_status,
        card_fee_paid = EXCLUDED.card_fee_paid,
        receipt_number = COALESCE(EXCLUDED.receipt_number, cards.receipt_number),
        claimed_at = EXCLUDED.claimed_at,
        claimed_by = EXCLUDED.claimed_by,
        issued_at = EXCLUDED.issued_at,
        expires_at = EXCLUDED.expires_at,
        replacement_reason = EXCLUDED.replacement_reason,
        updated_at = now()
    RETURNING * INTO v_card;

    INSERT INTO public.member_cards (
        member_id, card_number, card_type, status, version,
        payment_status, claim_status, card_fee_paid, receipt_number,
        issued_at, expires_at, replacement_reason, updated_at
    ) VALUES (
        p_member_id, v_card.card_number, p_card_type, 'Active', v_card.version,
        v_card.payment_status, v_card.claim_status, v_card.card_fee_paid, v_card.receipt_number,
        v_card.issued_at, v_card.expires_at, p_replacement_reason, now()
    )
    ON CONFLICT (card_number) DO UPDATE SET
        card_type = EXCLUDED.card_type,
        status = 'Active',
        version = EXCLUDED.version,
        payment_status = EXCLUDED.payment_status,
        claim_status = EXCLUDED.claim_status,
        card_fee_paid = EXCLUDED.card_fee_paid,
        receipt_number = EXCLUDED.receipt_number,
        deleted_at = NULL,
        updated_at = now();

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        CASE WHEN p_is_replacement THEN 'CARD_REPLACED' ELSE 'CARD_ISSUED' END,
        p_member_id,
        format('%s %s card v%s (%s). Payment: %s, Claim: %s.',
            CASE WHEN p_is_replacement THEN 'Reissued' ELSE 'Assigned' END,
            p_card_type, v_card.version, v_card.card_number, v_card.payment_status, v_card.claim_status
        )
    );

    RETURN to_jsonb(v_card);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_or_switch_member_card(VARCHAR, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, NUMERIC, VARCHAR, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_or_switch_member_card(VARCHAR, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, NUMERIC, VARCHAR, TEXT, BOOLEAN, TEXT) TO authenticated;

-- 7.6 Atomic Member & Subscription Enrollment RPC
CREATE OR REPLACE FUNCTION public.process_member_enrollment(
    p_member_id TEXT DEFAULT NULL,
    p_member_fields JSONB DEFAULT '{}'::jsonb,
    p_plan_name TEXT DEFAULT 'No Subscription',
    p_payment_method TEXT DEFAULT 'Cash',
    p_base_price NUMERIC DEFAULT 0.00,
    p_gcash_fee NUMERIC DEFAULT 0.00,
    p_card_fee NUMERIC DEFAULT 0.00,
    p_gcash_ref_no TEXT DEFAULT NULL,
    p_add_id_card BOOLEAN DEFAULT false,
    p_online_reg_id TEXT DEFAULT NULL,
    p_processor_name TEXT DEFAULT 'Staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_actor TEXT;
    v_now TIMESTAMPTZ := now();
    v_member public.members;
    v_sub public.subscriptions;
    v_card public.cards;
    v_online_reg RECORD;
    v_full_name TEXT;
    v_is_paid BOOLEAN;
    v_total_amount NUMERIC;
    v_payment_enum public.payment_method_enum;
    v_receipt_no VARCHAR(30);
    v_plan_type public.subscription_type_enum;
    v_duration_days INT;
    v_active_sub RECORD;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_sub_status public.subscription_status_enum;
    v_customer_type TEXT;
    v_item_desc TEXT;
    v_card_num TEXT;
    v_card_exp TIMESTAMPTZ;
    v_should_update_profile BOOLEAN := true;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();
    v_actor := COALESCE(NULLIF(TRIM(p_processor_name), ''), auth.jwt() ->> 'email', 'Staff');
    v_is_paid := (COALESCE(p_plan_name, 'No Subscription') <> 'No Subscription') OR (COALESCE(p_add_id_card, false) AND COALESCE(p_card_fee, 0) > 0);

    IF v_is_paid THEN
        IF NOT EXISTS (SELECT 1 FROM public.cash_sessions WHERE status = 'open' AND closed_at IS NULL) THEN
            RAISE EXCEPTION 'Cash drawer session is closed. Paid subscriptions and cards require an open session.';
        END IF;
    END IF;

    IF p_online_reg_id IS NOT NULL AND TRIM(p_online_reg_id) <> '' THEN
        SELECT * INTO v_online_reg
        FROM public.online_registrations
        WHERE id = TRIM(p_online_reg_id)
          AND is_archived = false
          AND deleted_at IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Online registration ticket "%" was not found.', p_online_reg_id;
        END IF;

        IF LOWER(v_online_reg.status::text) <> 'pending' THEN
            RAISE EXCEPTION 'Online registration ticket "%" has already been processed (status: %).', p_online_reg_id, v_online_reg.status;
        END IF;
    END IF;

    -- Mark transaction context so members/subscriptions triggers allow authorized execution
    PERFORM set_config('app.via_enrollment_rpc', 'on', true);

    v_full_name := regexp_replace(trim(COALESCE(p_member_fields ->> 'full_name', '')), '\s+', ' ', 'g');

    IF p_member_id IS NULL OR TRIM(p_member_id) = '' THEN
        -- Creating a brand new member profile
        IF NOT v_is_admin AND (p_online_reg_id IS NULL OR TRIM(p_online_reg_id) = '') THEN
            RAISE EXCEPTION 'Access Denied: Staff must import a valid Pending Online Registration code or QR code to add a new member.';
        END IF;

        IF v_full_name = '' THEN
            RAISE EXCEPTION 'Full name is required to register a member.';
        END IF;

        IF public.check_member_name_exists(v_full_name) THEN
            RAISE EXCEPTION 'Duplicate full name not allowed: "%" already exists.', v_full_name;
        END IF;

        INSERT INTO public.members (
            full_name,
            email,
            phone,
            gender,
            birthday,
            address,
            emergency_contact_name,
            relationship,
            emergency_contact_phone,
            parent_name,
            parent_relationship,
            parent_phone,
            parent_email,
            applicant_signature,
            parent_signature,
            consent_date,
            status
        ) VALUES (
            v_full_name,
            NULLIF(TRIM(p_member_fields ->> 'email'), ''),
            COALESCE(NULLIF(TRIM(p_member_fields ->> 'phone'), ''), ''),
            COALESCE(NULLIF(TRIM(p_member_fields ->> 'gender'), ''), 'Male'),
            NULLIF(TRIM(p_member_fields ->> 'birthday'), '')::date,
            NULLIF(TRIM(p_member_fields ->> 'address'), ''),
            NULLIF(TRIM(p_member_fields ->> 'emergency_contact_name'), ''),
            NULLIF(TRIM(p_member_fields ->> 'relationship'), ''),
            NULLIF(TRIM(p_member_fields ->> 'emergency_contact_phone'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_name'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_relationship'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_phone'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_email'), ''),
            NULLIF(p_member_fields ->> 'applicant_signature', ''),
            NULLIF(p_member_fields ->> 'parent_signature', ''),
            NULLIF(TRIM(p_member_fields ->> 'consent_date'), '')::timestamptz,
            'Active'::public.member_status_enum
        )
        RETURNING * INTO v_member;
    ELSE
        SELECT * INTO v_member
        FROM public.members
        WHERE (member_id = TRIM(p_member_id) OR id::text = TRIM(p_member_id))
          AND deleted_at IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Member record "%" not found.', p_member_id;
        END IF;

        IF NOT v_is_admin AND public.member_has_running_subscription(v_member.member_id) THEN
            -- Staff cannot edit profile details while a subscription is running; allow renewal/card only
            v_should_update_profile := false;
        END IF;

        IF v_should_update_profile AND v_full_name <> '' THEN
            IF LOWER(regexp_replace(trim(v_member.full_name), '\s+', ' ', 'g')) <> LOWER(v_full_name)
               AND public.check_member_name_exists(v_full_name) THEN
                RAISE EXCEPTION 'Duplicate full name not allowed: "%" already exists.', v_full_name;
            END IF;

            UPDATE public.members
            SET full_name = COALESCE(NULLIF(v_full_name, ''), full_name),
                email = COALESCE(NULLIF(TRIM(p_member_fields ->> 'email'), ''), email),
                phone = COALESCE(NULLIF(TRIM(p_member_fields ->> 'phone'), ''), phone),
                gender = COALESCE(NULLIF(TRIM(p_member_fields ->> 'gender'), ''), gender),
                birthday = COALESCE(NULLIF(TRIM(p_member_fields ->> 'birthday'), '')::date, birthday),
                address = COALESCE(NULLIF(TRIM(p_member_fields ->> 'address'), ''), address),
                emergency_contact_name = COALESCE(NULLIF(TRIM(p_member_fields ->> 'emergency_contact_name'), ''), emergency_contact_name),
                relationship = COALESCE(NULLIF(TRIM(p_member_fields ->> 'relationship'), ''), relationship),
                emergency_contact_phone = COALESCE(NULLIF(TRIM(p_member_fields ->> 'emergency_contact_phone'), ''), emergency_contact_phone),
                parent_name = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_name'), ''), parent_name),
                parent_relationship = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_relationship'), ''), parent_relationship),
                parent_phone = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_phone'), ''), parent_phone),
                parent_email = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_email'), ''), parent_email),
                applicant_signature = COALESCE(NULLIF(p_member_fields ->> 'applicant_signature', ''), applicant_signature),
                parent_signature = COALESCE(NULLIF(p_member_fields ->> 'parent_signature', ''), parent_signature),
                consent_date = COALESCE(NULLIF(TRIM(p_member_fields ->> 'consent_date'), '')::timestamptz, consent_date),
                status = 'Active'::public.member_status_enum,
                updated_at = v_now
            WHERE id = v_member.id
            RETURNING * INTO v_member;
        END IF;
    END IF;

    v_payment_enum := CASE
        WHEN lower(COALESCE(p_payment_method, 'Cash')) LIKE '%gcash%' THEN 'GCash'::public.payment_method_enum
        WHEN lower(COALESCE(p_payment_method, 'Cash')) LIKE '%promo%' THEN 'Promo'::public.payment_method_enum
        ELSE 'Cash'::public.payment_method_enum
    END;

    v_total_amount := COALESCE(p_base_price, 0) + COALESCE(p_gcash_fee, 0) + COALESCE(p_card_fee, 0);
    v_receipt_no := 'REC-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'YYMMDDHH24MISS') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

    IF COALESCE(p_plan_name, 'No Subscription') <> 'No Subscription' THEN
        IF UPPER(v_member.status::text) = 'SUSPENDED' THEN
            RAISE EXCEPTION 'Member % is currently suspended.', v_member.full_name;
        END IF;

        SELECT * INTO v_active_sub
        FROM public.subscriptions
        WHERE member_id = v_member.member_id
          AND status::text = 'Active'
          AND end_date > v_now
        ORDER BY end_date DESC
        LIMIT 1;

        v_plan_type := CASE WHEN p_plan_name = 'Yearly Membership' THEN 'yearly'::public.subscription_type_enum ELSE 'monthly'::public.subscription_type_enum END;
        v_duration_days := CASE WHEN p_plan_name = 'Yearly Membership' THEN 365 ELSE 30 END;

        IF FOUND THEN
            v_start := v_active_sub.end_date;
            v_sub_status := 'Inactive'::public.subscription_status_enum;
            v_customer_type := 'Existing Member';
            v_item_desc := format('Renewal %s (Starts %s)', p_plan_name, to_char(v_start AT TIME ZONE 'Asia/Manila', 'MM/DD/YYYY'));
        ELSE
            v_start := v_now;
            v_sub_status := 'Active'::public.subscription_status_enum;
            v_customer_type := 'New Membership';
            v_item_desc := format('Subscribed %s', p_plan_name);
        END IF;

        v_end := v_start + (v_duration_days || ' days')::interval;

        INSERT INTO public.subscriptions (
            member_id, plan_type, price, base_price, gcash_fee, card_fee,
            gcash_ref_no, start_date, end_date, status, payment_status,
            payment_method, receipt_number, processed_by
        ) VALUES (
            v_member.member_id, v_plan_type, v_total_amount, COALESCE(p_base_price, 0),
            COALESCE(p_gcash_fee, 0), COALESCE(p_card_fee, 0), NULLIF(TRIM(p_gcash_ref_no), ''),
            v_start, v_end, v_sub_status, 'Paid', v_payment_enum, v_receipt_no, v_actor
        )
        RETURNING * INTO v_sub;

        UPDATE public.members
        SET status = 'Active'::public.member_status_enum, updated_at = v_now
        WHERE id = v_member.id;

        INSERT INTO public.receipts (
            id, member_id, customer_name, customer_type, amount, base_price,
            gcash_fee, card_fee, gcash_ref_no, payment_method, payment_status,
            item_description, processed_by
        ) VALUES (
            v_receipt_no,
            v_member.member_id,
            v_member.full_name,
            v_customer_type::public.customer_type_enum,
            v_total_amount,
            COALESCE(p_base_price, 0),
            COALESCE(p_gcash_fee, 0),
            COALESCE(p_card_fee, 0),
            NULLIF(TRIM(p_gcash_ref_no), ''),
            v_payment_enum,
            'Paid',
            v_item_desc,
            v_actor
        ) ON CONFLICT (id) DO NOTHING;

    ELSIF COALESCE(p_add_id_card, false) AND COALESCE(p_card_fee, 0) > 0 THEN
        INSERT INTO public.receipts (
            id, member_id, customer_name, customer_type, amount, base_price,
            gcash_fee, card_fee, gcash_ref_no, payment_method, payment_status,
            item_description, processed_by
        ) VALUES (
            v_receipt_no,
            v_member.member_id,
            v_member.full_name,
            'Physical Card'::public.customer_type_enum,
            p_card_fee,
            0.00,
            0.00,
            p_card_fee,
            NULLIF(TRIM(p_gcash_ref_no), ''),
            v_payment_enum,
            'Paid',
            'Physical Membership Card Fee',
            v_actor
        ) ON CONFLICT (id) DO NOTHING;
    ELSE
        v_receipt_no := 'REG-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'HH24MISS');
    END IF;

    -- Issue / Update Card when requested OR when subscribing and no card exists yet
    IF COALESCE(p_add_id_card, false) OR COALESCE(p_plan_name, 'No Subscription') <> 'No Subscription' THEN
        SELECT * INTO v_card FROM public.cards WHERE member_id = v_member.member_id;
        IF COALESCE(p_add_id_card, false) OR NOT FOUND THEN
            v_card_num := gen_random_uuid()::text;
            v_card_exp := v_now + INTERVAL '3 years';

            INSERT INTO public.cards (
                member_id, card_number, card_type, status, version,
                payment_status, claim_status, card_fee_paid, receipt_number,
                issued_at, expires_at, updated_at
            ) VALUES (
                v_member.member_id,
                v_card_num,
                'QR'::public.card_type_enum,
                'Active',
                1,
                CASE WHEN COALESCE(p_add_id_card, false) THEN 'PAID' ELSE 'NONE' END,
                CASE WHEN COALESCE(p_add_id_card, false) THEN 'UNCLAIMED' ELSE 'NOT_APPLICABLE' END,
                CASE WHEN COALESCE(p_add_id_card, false) THEN COALESCE(p_card_fee, 0) ELSE 0 END,
                CASE WHEN COALESCE(p_add_id_card, false) THEN v_receipt_no ELSE NULL END,
                v_now, v_card_exp, v_now
            )
            ON CONFLICT (member_id) DO UPDATE SET
                status = 'Active',
                payment_status = CASE WHEN COALESCE(p_add_id_card, false) THEN 'PAID' ELSE cards.payment_status END,
                claim_status = CASE WHEN COALESCE(p_add_id_card, false) THEN 'UNCLAIMED' ELSE cards.claim_status END,
                card_fee_paid = CASE WHEN COALESCE(p_add_id_card, false) THEN COALESCE(p_card_fee, 0) ELSE cards.card_fee_paid END,
                receipt_number = CASE WHEN COALESCE(p_add_id_card, false) THEN v_receipt_no ELSE cards.receipt_number END,
                updated_at = v_now
            RETURNING * INTO v_card;

            INSERT INTO public.member_cards (
                member_id, card_number, card_type, status, version,
                payment_status, claim_status, card_fee_paid, receipt_number,
                issued_at, expires_at, updated_at
            ) VALUES (
                v_member.member_id, v_card.card_number, 'QR', 'Active', COALESCE(v_card.version, 1),
                v_card.payment_status, v_card.claim_status, v_card.card_fee_paid, v_card.receipt_number,
                v_card.issued_at, v_card.expires_at, v_now
            )
            ON CONFLICT (card_number) DO NOTHING;
        END IF;
    END IF;

    IF p_online_reg_id IS NOT NULL AND TRIM(p_online_reg_id) <> '' THEN
        UPDATE public.online_registrations
        SET status = 'Approved'::public.online_reg_status_enum,
            deleted_by = v_actor
        WHERE id = TRIM(p_online_reg_id);
    END IF;

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        CASE WHEN COALESCE(p_plan_name, 'No Subscription') = 'No Subscription' THEN 'MEMBER_ENROLLED' ELSE 'SUBSCRIPTION_CREATED' END,
        v_member.member_id,
        format('Processed %s for %s (%s). Plan: %s, Receipt: %s.',
            CASE WHEN p_online_reg_id IS NOT NULL THEN 'online ticket ' || TRIM(p_online_reg_id) ELSE 'enrollment' END,
            v_member.full_name,
            v_member.member_id,
            COALESCE(p_plan_name, 'No Subscription'),
            v_receipt_no
        )
    );

    RETURN jsonb_build_object(
        'member', to_jsonb(v_member),
        'subscription', CASE WHEN v_sub.id IS NOT NULL THEN to_jsonb(v_sub) ELSE NULL END,
        'receipt_no', v_receipt_no,
        'card', CASE WHEN v_card.id IS NOT NULL THEN to_jsonb(v_card) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_member_enrollment(TEXT, JSONB, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_member_enrollment(TEXT, JSONB, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- 7.7 Hardened Scoped Logbook & Sales Sanitized RPCs
DROP FUNCTION IF EXISTS public.get_sanitized_logbook(date);
DROP FUNCTION IF EXISTS public.get_sanitized_logbook();

CREATE OR REPLACE FUNCTION public.get_sanitized_logbook(target_date date default null)
RETURNS TABLE (
    id text,
    "timestamp" timestamptz,
    member_id text,
    customer_name text,
    customer_type text,
    category_or_plan text,
    payment_method text,
    amount_paid numeric,
    base_price numeric,
    gcash_fee numeric,
    card_fee numeric,
    gcash_ref_no text,
    payment_status text,
    is_subscription boolean,
    deletable boolean,
    receipt_number text,
    member_ids text[],
    cash_session_id text,
    processed_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
    v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
    v_target date := COALESCE(target_date, v_today);
    v_is_admin boolean := public.is_admin();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    RETURN QUERY
    SELECT
        a.id::text AS id,
        a.check_in_time AS "timestamp",
        a.member_id::text AS member_id,
        a.customer_name::text AS customer_name,
        a.customer_type::text AS customer_type,
        COALESCE(a.plan_name, 'Regular Pass')::text AS category_or_plan,
        a.payment_method::text AS payment_method,
        COALESCE(a.entry_fee, 0.00)::numeric AS amount_paid,
        COALESCE(a.base_price, a.entry_fee - COALESCE(a.gcash_fee, 0.00))::numeric AS base_price,
        COALESCE(a.gcash_fee, 0.00)::numeric AS gcash_fee,
        COALESCE(a.card_fee, 0.00)::numeric AS card_fee,
        a.gcash_ref_no::text AS gcash_ref_no,
        COALESCE(a.payment_status::text, CASE WHEN COALESCE(a.entry_fee, 0.00) > 0 THEN 'Paid' ELSE 'Promo' END)::text AS payment_status,
        false AS is_subscription,
        true AS deletable,
        a.receipt_number::text AS receipt_number,
        COALESCE(a.member_ids, ARRAY[]::text[])::text[] AS member_ids,
        a.cash_session_id::text AS cash_session_id,
        a.processed_by::text AS processed_by
    FROM public.attendance a
    WHERE a.deleted_at IS NULL
      AND (a.check_in_time AT TIME ZONE 'Asia/Manila')::date = v_target
      AND (
          v_is_admin
          OR v_target = v_today
          OR (
              a.cash_session_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public.cash_sessions cs
                  WHERE cs.id = a.cash_session_id AND cs.status = 'open' AND cs.closed_at IS NULL
              )
          )
      )

    UNION ALL

    -- Receipts scoped strictly to ACTIVE OPEN SESSION for non-admin Staff
    SELECT
        'rcpt-' || r.id::text AS id,
        r.created_at AS "timestamp",
        r.member_id::text AS member_id,
        r.customer_name::text AS customer_name,
        COALESCE(r.customer_type::text, 'New Membership')::text AS customer_type,
        COALESCE(r.item_description::text, 'Subscription')::text AS category_or_plan,
        r.payment_method::text AS payment_method,
        COALESCE(r.amount, 0.00)::numeric AS amount_paid,
        COALESCE(r.base_price, r.amount, 0.00)::numeric AS base_price,
        COALESCE(r.gcash_fee, 0.00)::numeric AS gcash_fee,
        COALESCE(r.card_fee, 0.00)::numeric AS card_fee,
        r.gcash_ref_no::text AS gcash_ref_no,
        COALESCE(r.payment_status::text, 'Paid')::text AS payment_status,
        true AS is_subscription,
        false AS deletable,
        r.id::text AS receipt_number,
        COALESCE(r.member_ids, ARRAY[]::text[])::text[] AS member_ids,
        r.cash_session_id::text AS cash_session_id,
        r.processed_by::text AS processed_by
    FROM public.receipts r
    WHERE (r.created_at AT TIME ZONE 'Asia/Manila')::date = v_target
      AND COALESCE(r.customer_type::text, '') <> 'Card'
      AND (r.payment_status::text IS NULL OR r.payment_status::text NOT IN ('Voided', 'Cancelled', 'voided', 'cancelled'))
      AND NOT EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE (s.receipt_number = r.id OR s.id::text = r.id::text)
            AND s.status::text IN ('Voided', 'voided', 'Cancelled', 'cancelled')
      )
      AND (
          v_is_admin
          OR (
              r.cash_session_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public.cash_sessions cs
                  WHERE cs.id = r.cash_session_id AND cs.status = 'open' AND cs.closed_at IS NULL
              )
          )
      )

    ORDER BY "timestamp" DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sanitized_logbook(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sanitized_logbook(date) TO authenticated;

DROP FUNCTION IF EXISTS public.get_sanitized_sales(text);
DROP FUNCTION IF EXISTS public.get_sanitized_sales(date);

CREATE OR REPLACE FUNCTION public.get_sanitized_sales(target_date TEXT)
RETURNS TABLE (
    id TEXT,
    cash_session_id TEXT,
    created_at TIMESTAMPTZ,
    receipt_no TEXT,
    items JSONB,
    product_name TEXT,
    payment_method TEXT,
    amount_received NUMERIC,
    change_calculated NUMERIC,
    total_amount NUMERIC,
    gcash_fee_applied NUMERIC,
    reference_number TEXT,
    processed_by TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
    v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
    v_target date := COALESCE(NULLIF(TRIM(target_date), '')::date, v_today);
    v_is_admin boolean := public.is_admin();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    RETURN QUERY
    SELECT
        s.id::TEXT,
        s.cash_session_id::TEXT,
        s.created_at,
        COALESCE(s.receipt_no, s.id::TEXT)::TEXT AS receipt_no,
        s.items,
        s.product_name,
        s.payment_method::TEXT,
        s.amount_received,
        s.change_calculated,
        s.total_amount,
        COALESCE(s.gcash_fee_applied, 0.00)::NUMERIC AS gcash_fee_applied,
        s.reference_number::TEXT,
        COALESCE(s.processed_by::TEXT, 'System') AS processed_by
    FROM public.sales s
    WHERE s.deleted_at IS NULL
      AND COALESCE(s.is_quarantined, false) = false
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::date = v_target
      AND (
          v_is_admin
          OR v_target = v_today
          OR (
              s.cash_session_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public.cash_sessions cs
                  WHERE cs.id = s.cash_session_id AND cs.status = 'open' AND cs.closed_at IS NULL
              )
          )
      )
    ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sanitized_sales(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sanitized_sales(TEXT) TO authenticated;

-- 7.8 Admin Online Registration Toggle RPC (Requires open cash session to enable)
CREATE OR REPLACE FUNCTION public.set_online_registration_enabled(p_enabled BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_session_open BOOLEAN;
    v_target_val TEXT;
    v_actor TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only Administrators can toggle Online Registration.';
    END IF;

    v_session_open := EXISTS (
        SELECT 1
        FROM public.cash_sessions
        WHERE status = 'open'
          AND closed_at IS NULL
    );

    IF COALESCE(p_enabled, false) = true AND NOT v_session_open THEN
        RAISE EXCEPTION 'Cash drawer session is closed. Open a cash session before turning ON Online Registration.';
    END IF;

    v_target_val := CASE WHEN COALESCE(p_enabled, false) THEN 'true' ELSE 'false' END;

    INSERT INTO public.system_config (key, value, updated_at)
    VALUES ('online_registration_enabled', v_target_val, now())
    ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = now();

    v_actor := COALESCE(
        NULLIF(TRIM((SELECT username FROM public.profiles WHERE id = auth.uid() LIMIT 1)), ''),
        NULLIF(TRIM(auth.jwt() ->> 'email'), ''),
        'Admin'
    );

    BEGIN
        PERFORM public.log_audit_entry(
            auth.uid(),
            v_actor,
            CASE WHEN v_target_val = 'true' THEN 'ONLINE_REGISTRATION_ENABLED' ELSE 'ONLINE_REGISTRATION_DISABLED' END,
            'system_config/online_registration_enabled',
            CASE WHEN v_target_val = 'true' THEN 'Turned ON public online pre-registration portal.' ELSE 'Turned OFF public online pre-registration portal.' END
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN public.get_online_registration_status();
END;
$$;

REVOKE ALL ON FUNCTION public.set_online_registration_enabled(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_online_registration_enabled(BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
