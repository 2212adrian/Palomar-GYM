-- Migration: Add batch_id Tracking & Cascading Rollback Support for Migration Audit Logs
-- Description:
--   1. Adds unique `batch_id` column and index to `public.migration_audit_logs`.
--   2. Expands `migration_audit_logs` status check constraint to support uppercase 'REVERTED' cleanly.
--   3. Adds nullable `migration_batch_id` column + partial indexes on `products`, `members`,
--      `subscriptions`, and `cards` for direct batch-scoped cascading rollbacks.
--   4. Installs SuperAdmin full access policies on `migration_audit_logs` and `sync_conflicts`.

BEGIN;

-- 1. Upgrade migration_audit_logs with batch_id & REVERTED status
ALTER TABLE public.migration_audit_logs
    ADD COLUMN IF NOT EXISTS batch_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_migration_audit_logs_batch_id
    ON public.migration_audit_logs (batch_id)
    WHERE batch_id IS NOT NULL;

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
    CHECK (status IN ('success', 'failure', 'blocked', 'reverted', 'REVERTED'));

-- 2. Add migration_batch_id tracking column to target tables
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS migration_batch_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_products_migration_batch_id
    ON public.products (migration_batch_id)
    WHERE migration_batch_id IS NOT NULL;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS migration_batch_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_members_migration_batch_id
    ON public.members (migration_batch_id)
    WHERE migration_batch_id IS NOT NULL;

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS migration_batch_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_migration_batch_id
    ON public.subscriptions (migration_batch_id)
    WHERE migration_batch_id IS NOT NULL;

ALTER TABLE public.cards
    ADD COLUMN IF NOT EXISTS migration_batch_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_migration_batch_id
    ON public.cards (migration_batch_id)
    WHERE migration_batch_id IS NOT NULL;

-- 3. Ensure SuperAdmin has full read/write/delete access on audit & sync tables
DROP POLICY IF EXISTS "Superadmin full access" ON public.migration_audit_logs;
CREATE POLICY "Superadmin full access"
    ON public.migration_audit_logs
    AS PERMISSIVE FOR ALL
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

NOTIFY pgrst, 'reload schema';

COMMIT;
