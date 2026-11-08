-- Migration: Create get_sanitized_logbook RPC function
-- Purpose: Sanitizes attendance check-ins and receipts into a display-safe DTO.
-- Prevents DevTools from inspecting sensitive database columns (emails, addresses, phones, internal auth ids)
-- and includes cash_session_id for session-based grouping and lifecycle locks.
-- 20260824190000_get_sanitized_logbook.sql

-- Ensure attendance table has payment_status and updated_at columns
ALTER TABLE public.attendance 
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Paid',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP FUNCTION IF EXISTS public.get_sanitized_logbook(date);

CREATE OR REPLACE FUNCTION public.get_sanitized_logbook(target_date date default null)
RETURNS TABLE (
    id text,
    "timestamp" timestamptz,
    member_id text,
    customer_name text,
    customer_type text,
    category_or_plan text,
    payment_method text,
    amount_paid numeric,
    base_price numeric,
    gcash_fee numeric,
    card_fee numeric,
    gcash_ref_no text,
    payment_status text,
    is_subscription boolean,
    deletable boolean,
    cash_session_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ref_date AS (
        SELECT COALESCE(target_date, (now() AT TIME ZONE 'Asia/Manila')::date) AS d
    )
    -- 1. Attendance Check-ins for target date (Active records only)
    SELECT
        a.id::text AS id,
        a.check_in_time AS "timestamp",
        a.member_id::text AS member_id,
        a.customer_name::text AS customer_name,
        a.customer_type::text AS customer_type,
        COALESCE(a.plan_name, 'Regular Pass')::text AS category_or_plan,
        a.payment_method::text AS payment_method,
        COALESCE(a.entry_fee, 0.00)::numeric AS amount_paid,
        COALESCE(a.base_price, a.entry_fee - COALESCE(a.gcash_fee, 0.00))::numeric AS base_price,
        COALESCE(a.gcash_fee, 0.00)::numeric AS gcash_fee,
        COALESCE(a.card_fee, 0.00)::numeric AS card_fee,
        a.gcash_ref_no::text AS gcash_ref_no,
        COALESCE(a.payment_status, CASE WHEN COALESCE(a.entry_fee, 0.00) > 0 THEN 'Paid' ELSE 'Promo' END)::text AS payment_status,
        false AS is_subscription,
        true AS deletable,
        a.cash_session_id::text AS cash_session_id
    FROM public.attendance a, ref_date rd
    WHERE a.deleted_at IS NULL
      AND (a.check_in_time AT TIME ZONE 'Asia/Manila')::date = rd.d

    UNION ALL

    -- 2. Receipts / Subscriptions for target date
    SELECT
        'rcpt-' || r.id::text AS id,
        r.created_at AS "timestamp",
        r.member_id::text AS member_id,
        r.customer_name::text AS customer_name,
        COALESCE(r.customer_type::text, 'New Membership')::text AS customer_type,
        COALESCE(r.item_description::text, 'Subscription')::text AS category_or_plan,
        r.payment_method::text AS payment_method,
        COALESCE(r.amount, 0.00)::numeric AS amount_paid,
        COALESCE(r.base_price, r.amount, 0.00)::numeric AS base_price,
        COALESCE(r.gcash_fee, 0.00)::numeric AS gcash_fee,
        COALESCE(r.card_fee, 0.00)::numeric AS card_fee,
        r.gcash_ref_no::text AS gcash_ref_no,
        COALESCE(r.payment_status::text, 'Paid')::text AS payment_status,
        true AS is_subscription,
        false AS deletable,
        r.cash_session_id::text AS cash_session_id
    FROM public.receipts r, ref_date rd
    WHERE (r.created_at AT TIME ZONE 'Asia/Manila')::date = rd.d
      AND (r.payment_status::text IS NULL OR r.payment_status::text NOT IN ('Voided', 'Cancelled', 'voided', 'cancelled'))
      AND NOT EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE (s.receipt_number = r.id OR s.id::text = r.id::text)
            AND s.status::text IN ('Voided', 'voided', 'Cancelled', 'cancelled')
      )

    ORDER BY "timestamp" DESC;
$$;

-- Grant execution privileges
GRANT EXECUTE ON FUNCTION public.get_sanitized_logbook(date) TO authenticated, anon;

-- Ensure authenticated users have RLS privileges to delete and update receipts during voiding
DROP POLICY IF EXISTS "Allow authorized users to delete receipts" ON public.receipts;
CREATE POLICY "Allow authorized users to delete receipts" ON public.receipts
    FOR DELETE
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow authorized users to update receipts" ON public.receipts;
CREATE POLICY "Allow authorized users to update receipts" ON public.receipts
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Add 'Membership Renewal' to customer_type_enum if not already present
ALTER TYPE customer_type_enum ADD VALUE IF NOT EXISTS 'Membership Renewal';