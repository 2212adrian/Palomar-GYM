-- Migration: Schedule Automated 24-Hour Purge for sync_conflicts via pg_cron
-- Description:
--   1. Adds SuperAdmin DELETE / full-access RLS policies on `public.sync_conflicts` so
--      the Database Manager & automated maintenance can cleanly remove stale conflicts.
--   2. Creates `public.purge_expired_sync_conflicts()` to delete rows created more than
--      24 hours ago (`created_at < now() - interval '24 hours'`).
--   3. Schedules an hourly pg_cron job ('hourly-purge-sync-conflicts-24h') to execute it.

BEGIN;

-- 1. SuperAdmin DELETE / Full Access RLS Policy on public.sync_conflicts
DROP POLICY IF EXISTS "Superadmin full access" ON public.sync_conflicts;
CREATE POLICY "Superadmin full access"
    ON public.sync_conflicts
    AS PERMISSIVE FOR ALL
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- 2. Purge Function (deletes all sync_conflicts older than 24 hours)
CREATE OR REPLACE FUNCTION public.purge_expired_sync_conflicts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
BEGIN
    DELETE FROM public.sync_conflicts
    WHERE created_at < (now() - interval '24 hours');

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        INSERT INTO public.audit_logs (
            actor_id,
            actor_username,
            action,
            target_id,
            details
        ) VALUES (
            NULL,
            'System Automated Cron',
            'SYNC_CONFLICTS_24H_PURGED',
            NULL,
            format('Automated 24-hour purge deleted %s expired sync_conflicts record(s).', v_deleted_count)
        );
    END IF;

    RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_sync_conflicts() TO authenticated, service_role;

-- 3. Enable pg_cron and schedule hourly 24-hour purge job
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'cron' AND tablename = 'job') THEN
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname IN (
            'hourly-purge-sync-conflicts-24h',
            'daily-purge-sync-conflicts-24h',
            'purge-expired-sync-conflicts'
        );
    END IF;
END $$;

SELECT cron.schedule(
    'hourly-purge-sync-conflicts-24h',
    '0 * * * *',
    'SELECT public.purge_expired_sync_conflicts();'
);

NOTIFY pgrst, 'reload schema';

COMMIT;
