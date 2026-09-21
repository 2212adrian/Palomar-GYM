-- Migration: Create System Audit Logging Table and Maintenance Scheduler
-- Description: Sets up public.audit_logs with automatic 1-year retention policies
-- Timestamp: 20260704160000

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_username TEXT NOT NULL DEFAULT 'System',
    action TEXT NOT NULL,
    target_id TEXT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Policy: Allow only administrators / superadmins to read and view audit log rows
-- Cast enum to text (::text) to prevent 22P02 invalid input value errors
DROP POLICY IF EXISTS "Allow admins to read audit logs" ON public.audit_logs;
CREATE POLICY "Allow admins to read audit logs" 
ON public.audit_logs 
FOR SELECT 
TO authenticated
USING (
  lower((public.get_user_role())::text) IN ('admin', 'superadmin')
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND lower((profiles.role)::text) IN ('admin', 'superadmin')
  )
);

-- Policy: Allow authenticated sessions to write logs
DROP POLICY IF EXISTS "Allow authenticated users to insert audit logs" ON public.audit_logs;
CREATE POLICY "Allow authenticated users to insert audit logs" 
ON public.audit_logs 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Policy: Lock down manual updates
DROP POLICY IF EXISTS "Prevent manual updates on audit logs" ON public.audit_logs;
CREATE POLICY "Prevent manual updates on audit logs"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false);

-- Policy: Allow administrators / superadmins to purge or delete historical logs
DROP POLICY IF EXISTS "Prevent manual deletes on audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow admins to delete audit logs" ON public.audit_logs;
CREATE POLICY "Allow admins to delete audit logs"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (
  lower((public.get_user_role())::text) IN ('admin', 'superadmin')
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND lower((profiles.role)::text) IN ('admin', 'superadmin')
  )
);

-- ==============================================================================
-- FUNCTIONS & RPC HELPERS
-- ==============================================================================

-- Clear previously overloaded signatures to prevent ambiguity
DROP FUNCTION IF EXISTS public.log_audit_entry(uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.log_audit_entry(uuid, text, text, text, text);

-- Helper function to write system/auth events easily
CREATE OR REPLACE FUNCTION public.log_audit_entry(
    p_user_id UUID,
    p_actor_username TEXT,
    p_action TEXT,
    p_target_id TEXT,
    p_details TEXT
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        actor_username,
        action,
        target_id,
        details
    )
    VALUES (
        p_user_id,
        COALESCE(p_actor_username, 'System'),
        p_action,
        p_target_id,
        p_details
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- DEFAULT SEED DATA
-- ==============================================================================

INSERT INTO public.audit_logs (actor_username, action, details, created_at)
VALUES 
  ('System', 'CRON_JOB_EXECUTED', 'Automated Daily database backup snapshot generated successfully.', now() - INTERVAL '4 hours'),
  ('SuperAdmin', 'SYSTEM_TIMEZONE_CONFIGURED', 'Database default connection timezone aligned to Asia/Manila (PHT).', now() - INTERVAL '6 hours'),
  ('SuperAdmin', 'SYSTEM_RATES_UPDATED', 'Membership rates table adjusted: Monthly Sub rate set to ₱800.00.', now() - INTERVAL '1 day'),
  ('System', 'CRON_JOB_CLEANUP', 'Pruned 3 backup files older than 7 days from storage.', now() - INTERVAL '1 day 4 hours'),
  ('Staff', 'MEMBER_CHECK_IN', 'Member ATASHALY OCAP (ME-7602) checked in at Gate 1.', now() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- MAINTENANCE & ROTATION
-- ==============================================================================

-- Enable pg_cron extension if not already active
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Safely unschedule existing job to allow clean overwrite
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE jobname = 'daily-audit-logs-cleanup';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Schedule the 1-year rotation cleanup job
SELECT cron.schedule(
    'daily-audit-logs-cleanup',
    '0 16 * * *',
    'DELETE FROM public.audit_logs WHERE created_at < (now() - INTERVAL ''1 year'');'
);

-- ==============================================================================
-- REALTIME SUBSCRIPTION
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = 'audit_logs'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
        END IF;
    END IF;
END $$;