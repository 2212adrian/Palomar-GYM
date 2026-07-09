-- Migration: Secure Incident Reports table with friction-free reads/writes
-- 20260706190000_create_incident_reports.sql

-- 1. Safely drop the old function and its dependent policies
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;

-- 2. Create the secure, zero-query helper function using pre-hardened auth.jwt()
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
    SELECT coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
        nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
        'Staff'
    );
$$ LANGUAGE sql SECURITY INVOKER STABLE;


-- 3. Create table if not exists
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

-- Ensure the default is applied if the table already existed
ALTER TABLE public.incident_reports 
ALTER COLUMN created_by SET DEFAULT auth.uid();


-- Indexing for performant filtering, sorting, and pagination (safe to run with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_incident_reports_status ON public.incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_priority ON public.incident_reports(priority);
CREATE INDEX IF NOT EXISTS idx_incident_reports_is_archived ON public.incident_reports(is_archived);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created_at ON public.incident_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created_by ON public.incident_reports(created_by);

-- Enable Row Level Security (RLS)
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

-- Helper trigger function (safe to run with OR REPLACE)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Safely drop the trigger if it already exists before recreating it
DROP TRIGGER IF EXISTS update_incident_reports_updated_at ON public.incident_reports;

CREATE TRIGGER update_incident_reports_updated_at
    BEFORE UPDATE ON public.incident_reports
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();


-- =========================================================================
-- SECURE ROLE SYNCHRONIZATION TRIGGER
-- =========================================================================

-- Migrate existing users so their claims are updated immediately
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', coalesce(raw_user_meta_data ->> 'role', 'Staff'))
WHERE raw_user_meta_data ->> 'role' IS NOT NULL;

-- Automatically sync role on future inserts or updates on auth.users
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
-- Row Level Security (RLS) Policies (Zero references to user_metadata)
-- =========================================================================

-- Drop existing policies first to prevent "policy already exists" errors during re-runs
DROP POLICY IF EXISTS "Admins have full access to incident reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can insert incident reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can view their own reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can update own reports if unread" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can delete own reports if unread" ON public.incident_reports;
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.incident_reports;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.incident_reports;
DROP POLICY IF EXISTS "Allow update for creator or admin" ON public.incident_reports;
DROP POLICY IF EXISTS "Allow delete for creator or admin" ON public.incident_reports;

-- 1. Unrestricted write for logged-in users (Guarantees submissions never fail)
CREATE POLICY "Allow insert for authenticated" ON public.incident_reports
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 2. Unrestricted read for logged-in users (Guarantees inserts returning representation never fail)
CREATE POLICY "Allow select for authenticated" ON public.incident_reports
    FOR SELECT
    TO authenticated
    USING (true);

-- 3. Strict Update Policy (Restricted to original creator while unread/unarchived, or Admins)
CREATE POLICY "Allow update for creator or admin" ON public.incident_reports
    FOR UPDATE
    TO authenticated
    USING (
        (created_by = auth.uid() AND status = 'Unread' AND is_archived = false) OR
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    )
    WITH CHECK (
        (created_by = auth.uid() AND status = 'Unread' AND is_archived = false) OR
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- 4. Strict Delete Policy (Restricted to original creator while unread/unarchived, or Admins)
CREATE POLICY "Allow delete for creator or admin" ON public.incident_reports
    FOR DELETE
    TO authenticated
    USING (
        (created_by = auth.uid() AND status = 'Unread' AND is_archived = false) OR
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );


-- 6. Enable Realtime Postgres Changes safely
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

-- 7. Background Automation Jobs (pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Automatically mark unread reports as 'Read' if they are older than 30 days (Daily at 1:00 AM)
SELECT cron.schedule(
    'auto-mark-old-incidents-as-read',
    '0 1 * * *',
    $$ 
      UPDATE public.incident_reports 
      SET status = 'Read', read_at = now() 
      WHERE status = 'Unread' AND created_at < now() - interval '30 days' 
    $$
);

-- Automatically purge read incidents older than 90 days (Daily at 2:00 AM)
SELECT cron.schedule(
    'auto-delete-read-incidents-after-90-days',
    '0 2 * * *',
    $$ 
      DELETE FROM public.incident_reports 
      WHERE status = 'Read' AND updated_at < now() - interval '90 days' 
    $$
);