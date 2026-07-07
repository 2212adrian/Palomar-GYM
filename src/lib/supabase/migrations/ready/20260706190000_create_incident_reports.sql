-- Migration: Create Incident Reports table with RLS Policies & Performance Indexes
-- 20260706190000_create_incident_reports.sql

CREATE TABLE IF NOT EXISTS public.incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

-- Setup Row Level Security (RLS) Policies
-- Drop existing policies first to prevent "policy already exists" errors during re-runs
DROP POLICY IF EXISTS "Admins have full access to incident reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can insert incident reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can view their own reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can update own reports if unread" ON public.incident_reports;
DROP POLICY IF EXISTS "Staff can delete own reports if unread" ON public.incident_reports;

-- 1. Full Access Policy for Admins or email 'wolf.palomar@gmail.com'
CREATE POLICY "Admins have full access to incident reports" ON public.incident_reports
    FOR ALL
    TO authenticated
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    )
    WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- 2. Staff Create Policy
CREATE POLICY "Staff can insert incident reports" ON public.incident_reports
    FOR INSERT
    TO authenticated
    WITH CHECK (
        coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), 'Staff') = 'Staff' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- 3. Staff Read Own Policy
CREATE POLICY "Staff can view their own reports" ON public.incident_reports
    FOR SELECT
    TO authenticated
    USING (
        created_by = auth.uid() OR 
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- 4. Staff Update Own Policy (restricted to Unread reports only)
CREATE POLICY "Staff can update own reports if unread" ON public.incident_reports
    FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid() AND status = 'Unread' AND is_archived = false
    )
    WITH CHECK (
        created_by = auth.uid() AND status = 'Unread' AND is_archived = false
    );

-- 5. Staff Delete Own Policy (restricted to Unread reports only)
CREATE POLICY "Staff can delete own reports if unread" ON public.incident_reports
    FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid() AND status = 'Unread' AND is_archived = false
    );

-- 6. Enable Realtime Postgres Changes safely
-- Checking table membership in the publication first avoids "relation already exists" errors
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
-- We ensure the extension is active and schedule the required background maintenance tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Automatically mark unread reports as 'Read' if they are older than 30 days (Daily at 1:00 AM) [1]
SELECT cron.schedule(
    'auto-mark-old-incidents-as-read',
    '0 1 * * *',
    $$ 
      UPDATE public.incident_reports 
      SET status = 'Read', read_at = now() 
      WHERE status = 'Unread' AND created_at < now() - interval '30 days' 
    $$
);

-- Automatically purge read incidents older than 90 days (Daily at 2:00 AM) [1]
SELECT cron.schedule(
    'auto-delete-read-incidents-after-90-days',
    '0 2 * * *',
    $$ 
      DELETE FROM public.incident_reports 
      WHERE status = 'Read' AND updated_at < now() - interval '90 days' 
    $$
);