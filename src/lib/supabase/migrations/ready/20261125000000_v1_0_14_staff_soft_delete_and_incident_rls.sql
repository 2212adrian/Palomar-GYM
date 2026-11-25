-- ============================================================================
-- Migration: v1.0.14 Staff Soft-Delete RPCs/RLS & Incident Report Deletion
-- File: 20261125000000_v1_0_14_staff_soft_delete_and_incident_rls.sql
--
-- Description:
--   1. Fixes "new row violates row-level security policy for table attendance"
--      and "sales" when Staff soft-delete active records by:
--      - Cleaning up any conflicting FOR UPDATE RLS policies and simplifying
--        WITH CHECK so setting deleted_at/deleted_by never fails row checks.
--      - Adding SECURITY DEFINER RPCs public.soft_delete_attendance() and
--        public.soft_delete_sales() that enforce active operator status and
--        current-shift / today scope server-side.
--   2. Locks Incident Reports for Staff once Management has marked them as
--      'Read' (reviewed) or 'Archived' — Staff can only edit or delete their
--      own 'Unread', non-archived incident reports.
-- ============================================================================

BEGIN;

-- Ensure active operator helper exists
CREATE OR REPLACE FUNCTION public.is_active_operator()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
    IF public.is_superadmin() OR public.is_admin() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND LOWER(COALESCE(p.status::text, '')) = 'active'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. CLEAN FOR UPDATE RLS POLICIES ON ATTENDANCE & SALES
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('attendance', 'sales')
          AND cmd = 'UPDATE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

CREATE POLICY "Admins and scoped staff can update attendance"
    ON public.attendance FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            public.is_active_operator()
            AND deleted_at IS NULL
            AND customer_type::text <> 'New Membership'
            AND COALESCE(plan_name, '') NOT ILIKE '%Subscription Contract%'
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = attendance.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
                OR check_in_time >= (now() - interval '12 hours')
            )
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            public.is_active_operator()
            AND deleted_at IS NOT NULL
        )
    );

CREATE POLICY "Admins and scoped staff can soft-delete or restore sales"
    ON public.sales FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            public.is_active_operator()
            AND deleted_at IS NULL
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = sales.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
                OR created_at >= (now() - interval '12 hours')
            )
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            public.is_active_operator()
            AND deleted_at IS NOT NULL
        )
    );

-- ----------------------------------------------------------------------------
-- 2. SECURITY DEFINER SOFT-DELETE RPCs FOR ATTENDANCE & SALES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_attendance(
    p_ids TEXT[],
    p_deleted_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_is_admin BOOLEAN;
    v_count INTEGER := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_active_operator() THEN
        RAISE EXCEPTION 'Access Denied: Your account is not active.';
    END IF;

    IF COALESCE(array_length(p_ids, 1), 0) = 0 THEN
        RETURN 0;
    END IF;

    v_is_admin := public.is_admin();

    IF v_is_admin THEN
        UPDATE public.attendance
        SET deleted_at = now(),
            deleted_by = COALESCE(v_uid, p_deleted_by)
        WHERE id = ANY(p_ids)
          AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.attendance a
        WHERE a.id = ANY(p_ids)
          AND a.deleted_at IS NULL
          AND (
              a.customer_type::text = 'New Membership'
              OR COALESCE(a.plan_name, '') ILIKE '%Subscription Contract%'
              OR NOT (
                  (
                      a.cash_session_id IS NOT NULL
                      AND EXISTS (
                          SELECT 1 FROM public.cash_sessions cs
                          WHERE cs.id = a.cash_session_id
                            AND cs.status = 'open'
                            AND cs.closed_at IS NULL
                      )
                  )
                  OR (a.check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
                  OR a.check_in_time >= (now() - interval '12 hours')
              )
          )
    ) THEN
        RAISE EXCEPTION 'Access Denied: Staff can only remove active attendance entries from the current shift or today.';
    END IF;

    UPDATE public.attendance
    SET deleted_at = now(),
        deleted_by = COALESCE(v_uid, p_deleted_by)
    WHERE id = ANY(p_ids)
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_attendance(TEXT[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_attendance(TEXT[], UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_sales(
    p_ids UUID[],
    p_deleted_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_is_admin BOOLEAN;
    v_count INTEGER := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_active_operator() THEN
        RAISE EXCEPTION 'Access Denied: Your account is not active.';
    END IF;

    IF COALESCE(array_length(p_ids, 1), 0) = 0 THEN
        RETURN 0;
    END IF;

    v_is_admin := public.is_admin();

    IF v_is_admin THEN
        UPDATE public.sales
        SET deleted_at = now(),
            deleted_by = COALESCE(v_uid, p_deleted_by)
        WHERE id = ANY(p_ids)
          AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sales s
        WHERE s.id = ANY(p_ids)
          AND s.deleted_at IS NULL
          AND NOT (
              (
                  s.cash_session_id IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM public.cash_sessions cs
                      WHERE cs.id = s.cash_session_id
                        AND cs.status = 'open'
                        AND cs.closed_at IS NULL
                  )
              )
              OR (s.created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
              OR s.created_at >= (now() - interval '12 hours')
          )
    ) THEN
        RAISE EXCEPTION 'Access Denied: Staff can only remove active sales from the current shift or today.';
    END IF;

    UPDATE public.sales
    SET deleted_at = now(),
        deleted_by = COALESCE(v_uid, p_deleted_by)
    WHERE id = ANY(p_ids)
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_sales(UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_sales(UUID[], UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. LOCK STAFF INCIDENT REPORTS ONCE READ/REVIEWED OR ARCHIVED
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins delete all and Staff delete own non-archived incident_reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Admins delete all and Staff delete own unread incident_reports" ON public.incident_reports;

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

    IF OLD.is_archived = true THEN
        RAISE EXCEPTION 'Access Denied: Archived incident reports cannot be modified or deleted by Staff.';
    END IF;

    IF OLD.status <> 'Unread' THEN
        RAISE EXCEPTION 'Access Denied: Reviewed incident reports cannot be modified or deleted by Staff.';
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

COMMIT;
