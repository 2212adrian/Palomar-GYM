-- Migration: Secure Incident Reports table with robust Admin & Staff RLS access
-- Timestamp: 20260706190000

-- =========================================================================
-- 1. SECURE & CASE-INSENSITIVE ROLE / ADMIN HELPER FUNCTIONS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
        nullif(auth.jwt() -> 'user_metadata' ->> 'role', '')
    );
    
    IF v_role IS NULL AND auth.uid() IS NOT NULL THEN
        SELECT coalesce(
            raw_app_meta_data ->> 'role',
            raw_user_meta_data ->> 'role',
            'Staff'
        ) INTO v_role
        FROM auth.users
        WHERE id = auth.uid();
    END IF;

    RETURN coalesce(v_role, 'Staff');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        lower(public.get_user_role()) = 'admin' OR
        (auth.jwt() -> 'app_metadata' ->> 'role') ILIKE 'admin' OR
        (auth.jwt() -> 'user_metadata' ->> 'role') ILIKE 'admin' OR
        lower(coalesce(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- =========================================================================
-- 2. CREATE TABLE & CONSTRAINTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    staff_name TEXT NOT NULL,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(3000) NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Unread',
    priority TEXT NOT NULL DEFAULT 'Medium',
    is_archived BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT check_status CHECK (status IN ('Unread', 'Read')),
    CONSTRAINT check_priority CHECK (priority IN ('Low', 'Medium', 'High'))
);

ALTER TABLE public.incident_reports 
ALTER COLUMN created_by SET DEFAULT auth.uid();

-- =========================================================================
-- 3. PERFORMANCE INDEXES
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_incident_reports_status ON public.incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_priority ON public.incident_reports(priority);
CREATE INDEX IF NOT EXISTS idx_incident_reports_is_archived ON public.incident_reports(is_archived);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created_at ON public.incident_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created_by ON public.incident_reports(created_by);

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 4. UPDATED_AT TRIGGER
-- =========================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_incident_reports_updated_at ON public.incident_reports;

CREATE TRIGGER update_incident_reports_updated_at
    BEFORE UPDATE ON public.incident_reports
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- =========================================================================
-- 5. SECURE ROLE SYNCHRONIZATION TRIGGER (AUTH.USERS)
-- =========================================================================
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', coalesce(raw_user_meta_data ->> 'role', 'Staff'))
WHERE raw_user_meta_data ->> 'role' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_user_role_to_app_metadata()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.raw_user_meta_data ->> 'role' IS NOT NULL THEN
        NEW.raw_app_meta_data = coalesce(NEW.raw_app_meta_data, '{}'::jsonb) || 
            jsonb_build_object('role', NEW.raw_user_meta_data ->> 'role');
    ELSIF NOT (NEW.raw_app_meta_data ? 'role') THEN
        NEW.raw_app_meta_data = coalesce(NEW.raw_app_meta_data, '{}'::jsonb) || 
            jsonb_build_object('role', 'Staff');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sync_user_role_to_app_metadata ON auth.users;

CREATE TRIGGER tr_sync_user_role_to_app_metadata
    BEFORE INSERT OR UPDATE OF raw_user_meta_data, raw_app_meta_data ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_user_role_to_app_metadata();

-- =========================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.incident_reports;
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.incident_reports;
DROP POLICY IF EXISTS "Allow update for creator or admin" ON public.incident_reports;
DROP POLICY IF EXISTS "Allow delete for creator or admin" ON public.incident_reports;

CREATE POLICY "Allow insert for authenticated" ON public.incident_reports
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow select for authenticated" ON public.incident_reports
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin() OR
        created_by = auth.uid()
    );

CREATE POLICY "Allow update for creator or admin" ON public.incident_reports
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin() OR
        (created_by = auth.uid() AND status = 'Unread' AND is_archived = false)
    )
    WITH CHECK (
        public.is_admin() OR
        (created_by = auth.uid() AND status = 'Unread' AND is_archived = false)
    );

CREATE POLICY "Allow delete for creator or admin" ON public.incident_reports
    FOR DELETE
    TO authenticated
    USING (
        public.is_admin() OR
        (created_by = auth.uid() AND status = 'Unread' AND is_archived = false)
    );

-- =========================================================================
-- 7. REALTIME SUBSCRIPTIONS
-- =========================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = 'incident_reports'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_reports;
        END IF;
    END IF;
END $$;

-- =========================================================================
-- 8. AUTOMATION CRON JOBS (pg_cron)
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Safely unschedule existing jobs so we can overwrite cleanly
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE jobname IN ('auto-mark-old-incidents-as-read', 'auto-delete-read-incidents-after-90-days');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Automatically mark unread reports as 'Read' if older than 30 days
SELECT cron.schedule(
    'auto-mark-old-incidents-as-read',
    '0 16 * * *',
    $$ 
      UPDATE public.incident_reports 
      SET status = 'Read', read_at = now() 
      WHERE status = 'Unread' AND created_at < now() - interval '30 days' 
    $$
);

-- Automatically purge read incidents older than 30 days
SELECT cron.schedule(
    'auto-delete-read-incidents-after-30-days',
    '0 16 * * *',
    $$ 
      DELETE FROM public.incident_reports 
      WHERE status = 'Read' AND updated_at < now() - interval '30 days' 
    $$
);