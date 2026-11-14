-- Migration: Add 24-Hour Undo/Rollback & Duplicate Metrics to migration_audit_logs
-- Description: Safely upgrades existing public.migration_audit_logs tables to support
-- Overwrite/Ignore duplicate counts, rollback_manifest storage, 24-hour rollback expiry,
-- and SuperAdmin RLS UPDATE for marking reverted batches.

BEGIN;

ALTER TABLE public.migration_audit_logs
    ADD COLUMN IF NOT EXISTS overwritten_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ignored_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rollback_manifest JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rollback_expires_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reverted_by_email TEXT DEFAULT NULL;

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.migration_audit_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.migration_audit_logs DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE public.migration_audit_logs
    ADD CONSTRAINT migration_audit_logs_status_check
    CHECK (status IN ('success', 'failure', 'blocked', 'reverted'));

DROP POLICY IF EXISTS "SuperAdmin can update migration audit logs for rollback" ON public.migration_audit_logs;
CREATE POLICY "SuperAdmin can update migration audit logs for rollback"
    ON public.migration_audit_logs
    FOR UPDATE
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

NOTIFY pgrst, 'reload schema';

COMMIT;
