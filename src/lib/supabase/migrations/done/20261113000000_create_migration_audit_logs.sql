-- Migration: Create Dedicated migration_audit_logs Table for SuperAdmin CSV Data Migration
-- Description: SuperAdmin audit ledger recording every CSV migration attempt (success, failure, blocked, reverted)
-- including timestamp, SuperAdmin auth user ID, SHA-256 file hash, payload hash, counts, duplicate metrics,
-- validation details, and 24-hour rollback manifest for safe Undo/Revert.

BEGIN;

CREATE TABLE IF NOT EXISTS public.migration_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    superadmin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    superadmin_email TEXT NOT NULL,
    file_name TEXT DEFAULT NULL,
    file_size_bytes BIGINT DEFAULT NULL,
    file_hash TEXT NOT NULL,
    payload_hash TEXT DEFAULT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'blocked', 'reverted')),
    products_count INTEGER NOT NULL DEFAULT 0,
    members_count INTEGER NOT NULL DEFAULT 0,
    subscriptions_count INTEGER NOT NULL DEFAULT 0,
    cards_count INTEGER NOT NULL DEFAULT 0,
    overwritten_count INTEGER NOT NULL DEFAULT 0,
    ignored_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT DEFAULT NULL,
    non_empty_override BOOLEAN NOT NULL DEFAULT false,
    notes TEXT DEFAULT NULL,
    rollback_manifest JSONB DEFAULT NULL,
    rollback_expires_at TIMESTAMPTZ DEFAULT NULL,
    reverted_at TIMESTAMPTZ DEFAULT NULL,
    reverted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reverted_by_email TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_migration_audit_logs_created_at
    ON public.migration_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_audit_logs_superadmin_id
    ON public.migration_audit_logs (superadmin_id);

CREATE INDEX IF NOT EXISTS idx_migration_audit_logs_status
    ON public.migration_audit_logs (status);

CREATE INDEX IF NOT EXISTS idx_migration_audit_logs_file_hash
    ON public.migration_audit_logs (file_hash);

-- Strictly restrict access to assigned SuperAdmin via public.is_superadmin()
ALTER TABLE public.migration_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin can view migration audit logs" ON public.migration_audit_logs;
CREATE POLICY "SuperAdmin can view migration audit logs"
    ON public.migration_audit_logs
    FOR SELECT
    TO authenticated
    USING (public.is_superadmin());

DROP POLICY IF EXISTS "SuperAdmin can insert migration audit logs" ON public.migration_audit_logs;
CREATE POLICY "SuperAdmin can insert migration audit logs"
    ON public.migration_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "SuperAdmin can update migration audit logs for rollback" ON public.migration_audit_logs;
CREATE POLICY "SuperAdmin can update migration audit logs for rollback"
    ON public.migration_audit_logs
    FOR UPDATE
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

NOTIFY pgrst, 'reload schema';

COMMIT;
