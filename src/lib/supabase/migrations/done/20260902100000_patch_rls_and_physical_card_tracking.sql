-- Migration: Fix Attendance & Cards RLS Policies and Implement Physical Membership Card Tracking
-- File: 20260902100000_patch_rls_and_physical_card_tracking.sql

BEGIN;

-- ============================================================================
-- 1. ROW LEVEL SECURITY (RLS) FIX FOR ATTENDANCE TABLE
-- ============================================================================
-- Enables Staff, Admin, Superadmin, and Kiosk sessions to smoothly record, view, and manage logbook check-ins
-- without date restrictions, timezone mismatches, or role lookup failures causing insertion/retrieval blocking.

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated users to insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated users to update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authorized users to delete attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated users full access to attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow public to view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow public to insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow public to update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow public to delete attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow public full access to attendance" ON public.attendance;

-- Select: View all active and recycle-bin attendance records
CREATE POLICY "Allow public to view attendance"
ON public.attendance FOR SELECT
TO public
USING (true);

-- Insert: Insert new check-in records
CREATE POLICY "Allow public to insert attendance"
ON public.attendance FOR INSERT
TO public
WITH CHECK (true);

-- Update: Update attendance records (e.g. edit check-in or update fee)
CREATE POLICY "Allow public to update attendance"
ON public.attendance FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Delete: Initiate deletion (soft-delete trigger handles retention)
CREATE POLICY "Allow public to delete attendance"
ON public.attendance FOR DELETE
TO public
USING (true);


-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS) FIX FOR CARDS TABLE
-- ============================================================================
-- Enables reception Staff and front desk to issue, re-issue, and update member security cards seamlessly.

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated staff and admin to read cards" ON public.cards;
DROP POLICY IF EXISTS "Allow admin and superadmin to insert cards" ON public.cards;
DROP POLICY IF EXISTS "Allow admin and superadmin to update cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authenticated users to insert cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authenticated users to update cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authenticated users full access to cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authenticated users to read cards" ON public.cards;
DROP POLICY IF EXISTS "Allow authenticated users to delete cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public to read cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public to insert cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public to update cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public to delete cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public full access to cards" ON public.cards;

CREATE POLICY "Allow public to read cards"
ON public.cards FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public to insert cards"
ON public.cards FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public to update cards"
ON public.cards FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public to delete cards"
ON public.cards FOR DELETE
TO public
USING (true);


-- ============================================================================
-- 3. SCHEMA EXTENSION FOR PHYSICAL MEMBERSHIP CARD TRACKING
-- ============================================================================

-- A. Add Payment and Claim Tracking Columns to public.cards
ALTER TABLE public.cards
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS claim_status VARCHAR(30) NOT NULL DEFAULT 'NOT_APPLICABLE',
    ADD COLUMN IF NOT EXISTS card_fee_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS claimed_by TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS claim_notes TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(30) DEFAULT NULL;

-- B. Apply Validation Constraints Safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_cards_payment_status'
    ) THEN
        ALTER TABLE public.cards
            ADD CONSTRAINT chk_cards_payment_status 
            CHECK (payment_status IN ('NONE', 'PAID', 'REFUNDED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_cards_claim_status'
    ) THEN
        ALTER TABLE public.cards
            ADD CONSTRAINT chk_cards_claim_status 
            CHECK (claim_status IN ('NOT_APPLICABLE', 'UNCLAIMED', 'CLAIMED'));
    END IF;
END $$;

-- C. Indexes for fast status filtering
CREATE INDEX IF NOT EXISTS idx_cards_claim_status ON public.cards(claim_status);
CREATE INDEX IF NOT EXISTS idx_cards_payment_status ON public.cards(payment_status);

-- D. Data Backfill: Mark existing active physical/QR cards as Paid & Claimed
UPDATE public.cards
SET 
    payment_status = 'PAID',
    claim_status = 'CLAIMED',
    claimed_at = COALESCE(claimed_at, issued_at, created_at, now()),
    claimed_by = COALESCE(claimed_by, 'System Migration')
WHERE payment_status = 'NONE' AND status = 'Active';


-- ============================================================================
-- 4. RPC HELPER FUNCTIONS FOR CARD RELEASE & PAYMENT
-- ============================================================================

-- Function: Mark physical card as claimed/released to customer
CREATE OR REPLACE FUNCTION public.mark_card_claimed(
    p_member_id VARCHAR,
    p_claimed_by TEXT DEFAULT 'Counter Staff',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_card RECORD;
    v_member RECORD;
BEGIN
    SELECT * INTO v_card FROM public.cards WHERE member_id = p_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card record not found for member %', p_member_id;
    END IF;

    SELECT * INTO v_member FROM public.members WHERE member_id = p_member_id;

    UPDATE public.cards
    SET 
        claim_status = 'CLAIMED',
        claimed_at = now(),
        claimed_by = COALESCE(p_claimed_by, auth.jwt() ->> 'email', 'Counter Staff'),
        claim_notes = p_notes,
        updated_at = now()
    WHERE member_id = p_member_id
    RETURNING * INTO v_card;

    -- Audit Logging
    INSERT INTO public.audit_logs (
        action,
        category,
        performed_by,
        target_id,
        details
    ) VALUES (
        'CARD_CLAIMED',
        'Cards',
        COALESCE(p_claimed_by, auth.jwt() ->> 'email', 'Counter Staff'),
        p_member_id,
        format('Physical card claimed and released to member %s (%s). Notes: %s', 
            COALESCE(v_member.full_name, p_member_id), 
            p_member_id, 
            COALESCE(p_notes, 'None')
        )
    );

    RETURN to_jsonb(v_card);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function: Record standalone physical card fee payment
CREATE OR REPLACE FUNCTION public.pay_physical_card(
    p_member_id VARCHAR,
    p_amount DECIMAL DEFAULT 50.00,
    p_payment_method TEXT DEFAULT 'Cash',
    p_receipt_no VARCHAR DEFAULT NULL,
    p_staff_name TEXT DEFAULT 'Counter Staff'
)
RETURNS JSONB AS $$
DECLARE
    v_card RECORD;
    v_member RECORD;
    v_receipt_id VARCHAR;
    v_card_num TEXT;
    v_exp TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_member FROM public.members WHERE member_id = p_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member profile not found for %', p_member_id;
    END IF;

    v_receipt_id := COALESCE(p_receipt_no, format('REC-CARD-%s', floor(extract(epoch from now()))::bigint));
    v_exp := now() + INTERVAL '3 years';
    v_card_num := format('%s:%s', p_member_id, to_char(v_exp, 'YYYY-MM-DD'));

    -- Create / Update Receipt
    INSERT INTO public.receipts (
        id,
        member_id,
        customer_name,
        customer_type,
        amount,
        base_price,
        gcash_fee,
        card_fee,
        payment_method,
        payment_status,
        item_description
    ) VALUES (
        v_receipt_id,
        p_member_id,
        v_member.full_name,
        'Existing Member',
        p_amount,
        0.00,
        0.00,
        p_amount,
        p_payment_method::public.payment_method_enum,
        'Paid',
        'Physical Membership Card Fee'
    )
    ON CONFLICT (id) DO NOTHING;

    -- Upsert Card Record as Paid & Unclaimed
    INSERT INTO public.cards (
        member_id,
        card_number,
        card_type,
        status,
        version,
        payment_status,
        claim_status,
        card_fee_paid,
        receipt_number,
        issued_at,
        expires_at,
        updated_at
    ) VALUES (
        p_member_id,
        v_card_num,
        'QR'::public.card_type_enum,
        'Active',
        1,
        'PAID',
        'UNCLAIMED',
        p_amount,
        v_receipt_id,
        now(),
        v_exp,
        now()
    )
    ON CONFLICT (member_id) DO UPDATE SET
        payment_status = 'PAID',
        claim_status = 'UNCLAIMED',
        card_fee_paid = EXCLUDED.card_fee_paid,
        receipt_number = EXCLUDED.receipt_number,
        claimed_at = NULL,
        claimed_by = NULL,
        updated_at = now()
    RETURNING * INTO v_card;

    -- Audit Logging
    INSERT INTO public.audit_logs (
        action,
        category,
        performed_by,
        target_id,
        details
    ) VALUES (
        'CARD_PAID',
        'Cards',
        COALESCE(p_staff_name, auth.jwt() ->> 'email', 'Counter Staff'),
        p_member_id,
        format('Recorded physical card fee payment of ₱%s for %s (%s). Receipt: %s', 
            p_amount, 
            v_member.full_name, 
            p_member_id, 
            v_receipt_id
        )
    );

    RETURN to_jsonb(v_card);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. REALTIME PUBLICATION SYNCHRONIZATION
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'cards'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'attendance'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
    END IF;
  END IF;
END $$;

COMMIT;
