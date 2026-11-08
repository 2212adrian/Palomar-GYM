-- Migration: Add processed_by column backfills and update get_sanitized_logbook RPC
-- File: 20261108050000_add_processed_by_to_logbook_rpc.sql

BEGIN;

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;

-- Backfill existing receipts and attendance from audit logs
UPDATE public.receipts r
SET processed_by = (
    SELECT al.actor_username 
    FROM public.audit_logs al 
    WHERE al.target_id = r.id::text 
       OR al.target_id = 'rcpt-' || r.id::text 
       OR al.details ILIKE '%' || r.id::text || '%'
    ORDER BY al.created_at DESC 
    LIMIT 1
)
WHERE r.processed_by IS NULL;

UPDATE public.attendance a
SET processed_by = (
    SELECT al.actor_username 
    FROM public.audit_logs al 
    WHERE al.target_id = a.id::text 
       OR al.target_id = a.receipt_number 
       OR al.details ILIKE '%' || a.id::text || '%'
    ORDER BY al.created_at DESC 
    LIMIT 1
)
WHERE a.processed_by IS NULL;

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
    cash_session_id text,
    processed_by text
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
        CASE WHEN COALESCE(a.entry_fee, 0.00) > 0 THEN 'Paid' ELSE 'Promo' END::text AS payment_status,
        false AS is_subscription,
        true AS deletable,
        a.cash_session_id::text AS cash_session_id,
        a.processed_by::text AS processed_by
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
        r.cash_session_id::text AS cash_session_id,
        r.processed_by::text AS processed_by
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

GRANT EXECUTE ON FUNCTION public.get_sanitized_logbook(date) TO authenticated, anon;

COMMIT;