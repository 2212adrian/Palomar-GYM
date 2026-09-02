-- ============================================================================
-- Migration: Upgrade Card Tokens to UUID & Implement Yearly Member ID Format (MEM-YYYY-XXXX)
-- File: 20260902110000_uuid_cards_and_yearly_member_id.sql
-- Description:
--   1. Updates card_number in public.cards table to use cryptographically secure UUIDs
--      instead of predictable human-readable strings (e.g. "MEM-000009:2029-08-18").
--   2. Replaces public.generate_member_id() to produce yearly sequential IDs:
--      Format: "MEM-YYYY-XXXX" (e.g. MEM-2026-0002).
--   3. Safely adds full_name column to public.profiles table and keeps it synced with
--      username and auth metadata to prevent "column profiles.full_name does not exist" errors.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. PROFILES TABLE FIX: FULL_NAME COLUMN COMPATIBILITY
-- ============================================================================
-- Safely add full_name column to public.profiles if not present, and populate with existing username/email

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

UPDATE public.profiles 
SET full_name = COALESCE(username, SPLIT_PART(email, '@', 1), 'User') 
WHERE full_name IS NULL;

-- Trigger/Function to keep full_name synchronized on profiles inserts/updates
CREATE OR REPLACE FUNCTION public.sync_profile_full_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.full_name IS NULL OR NEW.full_name = '' THEN
        NEW.full_name := COALESCE(NEW.username, SPLIT_PART(NEW.email, '@', 1), 'User');
    END IF;
    IF NEW.username IS NULL OR NEW.username = '' THEN
        NEW.username := NEW.full_name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_full_name ON public.profiles;
CREATE TRIGGER trg_sync_profile_full_name
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_full_name();


-- ============================================================================
-- 2. MEMBER ID GENERATOR: MEM-YYYY-XXXX (e.g. MEM-2026-0002)
-- ============================================================================
-- Format: "MEM-" || [Current Year 4-digits] || "-" || [Sequential 4-digit zero-padded number]

CREATE SEQUENCE IF NOT EXISTS public.member_id_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_member_id()
RETURNS TEXT AS $$
DECLARE
    current_year TEXT;
    next_val BIGINT;
BEGIN
    current_year := to_char(CURRENT_DATE, 'YYYY');
    next_val := nextval('public.member_id_seq');
    RETURN 'MEM-' || current_year || '-' || lpad(next_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Ensure default on public.members table is using the generator
ALTER TABLE public.members 
ALTER COLUMN member_id SET DEFAULT public.generate_member_id();


-- ============================================================================
-- 3. CARDS TABLE: CRYPTOGRAPHICALLY SECURE UUID TOKEN
-- ============================================================================
-- Set default card_number to gen_random_uuid()::text for maximum security and anti-forgery.

ALTER TABLE public.cards 
ALTER COLUMN card_number SET DEFAULT gen_random_uuid()::text;

-- Update any legacy cards where card_number contained predictable colon or 'MEM-' strings
UPDATE public.cards
SET card_number = gen_random_uuid()::text,
    updated_at = now()
WHERE card_number LIKE '%:%' 
   OR card_number LIKE 'MEM-%'
   OR LENGTH(card_number) < 30;

-- Ensure index exists on card_number for instant QR scanner lookup
CREATE INDEX IF NOT EXISTS idx_cards_card_number_lookup 
ON public.cards (card_number);

COMMIT;
