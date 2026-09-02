-- Migration: Create Member Cards Registry Table with 3-Year Expiry & 12:00 AM Auto-Purge
-- File: 20260804150600_create_cards_table.sql

BEGIN;

-- Ensure pg_cron extension exists for automated background scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- ============================================================================
-- 1. TABLE CREATION & SCHEMA EXTENSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.member_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id VARCHAR(50) NOT NULL REFERENCES public.members(member_id) ON DELETE CASCADE,
    card_number TEXT UNIQUE NOT NULL, -- Credential token e.g. "MEM-000013:NO_PLAN:1786081512049"
    card_type VARCHAR(20) NOT NULL DEFAULT 'QR', -- 'QR' | 'Manual' | 'None'
    status VARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Deactivated'
    version INT NOT NULL DEFAULT 1,
    
    -- Physical Card Payment & Handover Lifecycle Tracking
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID', -- 'PAID' | 'UNPAID'
    card_fee_paid NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    claim_status VARCHAR(20) NOT NULL DEFAULT 'UNCLAIMED', -- 'UNCLAIMED' | 'CLAIMED'
    claimed_at TIMESTAMPTZ DEFAULT NULL,
    claimed_by TEXT DEFAULT NULL,
    claim_notes TEXT DEFAULT NULL,
    receipt_number TEXT DEFAULT NULL,

    -- Expiration & Lifecycle Timestamps
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 years'),
    replaced_at TIMESTAMPTZ DEFAULT NULL,
    replacement_reason TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for high-speed QR scans, claim lookups, and expiration queries
CREATE INDEX IF NOT EXISTS idx_member_cards_card_number ON public.member_cards(card_number);
CREATE INDEX IF NOT EXISTS idx_member_cards_member_id ON public.member_cards(member_id);
CREATE INDEX IF NOT EXISTS idx_member_cards_claim_status ON public.member_cards(claim_status);
CREATE INDEX IF NOT EXISTS idx_member_cards_expires_at ON public.member_cards(expires_at);

-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.member_cards ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies
DROP POLICY IF EXISTS "Allow authenticated staff and admin to read cards" ON public.member_cards;
DROP POLICY IF EXISTS "Allow authenticated staff and admin to insert cards" ON public.member_cards;
DROP POLICY IF EXISTS "Allow authenticated staff and admin to update cards" ON public.member_cards;

-- A. SELECT: All authenticated staff and administrators can read cards
CREATE POLICY "Allow authenticated staff and admin to read cards"
ON public.member_cards FOR SELECT
TO authenticated
USING (true);

-- B. INSERT: Authenticated staff and administrators can issue cards
CREATE POLICY "Allow authenticated staff and admin to insert cards"
ON public.member_cards FOR INSERT
TO authenticated
WITH CHECK (true);

-- C. UPDATE: Authenticated staff and administrators can update cards (claim, pay, reissue, unbind)
CREATE POLICY "Allow authenticated staff and admin to update cards"
ON public.member_cards FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

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
      WHERE n.nspname = 'public' AND c.relname = 'member_cards'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.member_cards;
    END IF;
  END IF;
END$$;

-- ============================================================================
-- 4. 12:00 AM AUTO-PURGE FUNCTION & PG_CRON SCHEDULE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_expired_cards_daily()
RETURNS void AS $$
BEGIN
    -- Permanently deletes all card rows that have passed their expiration timestamp.
    -- SECURITY DEFINER executes with owner privileges to safely bypass client RLS deletions.
    DELETE FROM public.member_cards
    WHERE expires_at <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cron job to run every night at 12:00 AM Manila Time (16:00 UTC)
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) 
        FROM cron.job 
        WHERE jobname = 'purge_expired_cards_daily';

        PERFORM cron.schedule(
            'purge_expired_cards_daily',
            '0 16 * * *', -- 16:00 UTC = 00:00 (12:00 AM) Philippine Standard Time
            'SELECT public.purge_expired_cards_daily();'
        );
    END IF;
END $do$;

COMMIT;