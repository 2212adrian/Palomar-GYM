-- Migration: Create Cards Registry Table with 3-Year Expiry & Daily pg_cron Auto-Purge
-- File: 20260804150600_create_cards_table.sql

BEGIN;

-- ============================================================================
-- 1. TABLE CREATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id VARCHAR(20) UNIQUE NOT NULL REFERENCES public.members(member_id) ON DELETE CASCADE,
    card_number TEXT UNIQUE NOT NULL, -- Full credential token payload, e.g., "MEM-000013:NO_PLAN:1786081512049"
    card_type public.card_type_enum NOT NULL DEFAULT 'QR'::public.card_type_enum,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    version INT NOT NULL DEFAULT 1,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 years'),
    replacement_reason TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Database indexes for instant QR scan lookups
CREATE INDEX IF NOT EXISTS idx_cards_card_number ON public.cards(card_number);
CREATE INDEX IF NOT EXISTS idx_cards_member_id ON public.cards(member_id);

-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Clean up any pre-existing policies
DROP POLICY IF EXISTS "Allow authenticated users full access to cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authenticated read access to cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authorized users to insert cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authorized users to update cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authorized users to delete cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authenticated staff and admin to read cards" ON public.cards;
DROP POLICY IF EXISTS "Allow admin and superadmin to insert cards" ON public.cards;
DROP POLICY IF EXISTS "Allow admin and superadmin to update cards" ON public.cards;

-- A. SELECT Policy: Staff and normal authenticated users (along with Admin/Superadmin) have Read-Only access
CREATE POLICY "Allow authenticated staff and admin to read cards"
ON public.cards FOR SELECT
TO authenticated
USING (true);

-- B. INSERT Policy: Restricted exclusively to Administrators and Superadmin (wolf.palomar@gmail.com)
CREATE POLICY "Allow admin and superadmin to insert cards"
ON public.cards FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'::public.user_role
    )
    OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
);

-- C. UPDATE Policy: Restricted exclusively to Administrators and Superadmin (wolf.palomar@gmail.com)
CREATE POLICY "Allow admin and superadmin to update cards"
ON public.cards FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'::public.user_role
    )
    OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'::public.user_role
    )
    OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
);

-- Note: NO DELETE POLICY IS CREATED. 
-- Deletion is completely blocked for all client users (Staff, Admin, Superadmin). 
-- Expired card deletion is handled exclusively by the background SECURITY DEFINER cron task.

-- ============================================================================
-- 3. REALTIME PUBLICATION
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr 
      JOIN pg_class c ON pr.prrelid = c.oid 
      JOIN pg_namespace n ON c.relnamespace = n.oid 
      WHERE n.nspname = 'public' AND c.relname = 'cards'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
    END IF;
  END IF;
END$$;

-- ============================================================================
-- 4. AUTO-PURGE CRON JOB FOR EXPIRED CARDS (Runs Daily at 16:00 UTC / 12:00 AM Manila Time)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_expired_cards_daily()
RETURNS void AS $$
BEGIN
    -- Permanently purges card records whose 3-year validity or card expiration timestamp has elapsed.
    -- SECURITY DEFINER executes with owner privileges to bypass client RLS deletion restrictions safely.
    DELETE FROM public.cards
    WHERE expires_at <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safely schedule the daily purge cron task
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) 
        FROM cron.job 
        WHERE jobname = 'purge_expired_cards_daily';

        PERFORM cron.schedule(
            'purge_expired_cards_daily',
            '0 16 * * *',
            'SELECT public.purge_expired_cards_daily();'
        );
    END IF;
END $do$;

COMMIT;