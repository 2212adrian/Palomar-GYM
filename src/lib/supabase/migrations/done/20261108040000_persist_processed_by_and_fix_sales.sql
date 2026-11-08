-- Migration: Add processed_by column to sales and update get_sanitized_sales RPC
-- File: 20261108040000_persist_processed_by_and_fix_sales.sql

BEGIN;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;

-- Backfill existing sales transactions from audit logs
UPDATE public.sales s
SET processed_by = (
    SELECT al.actor_username 
    FROM public.audit_logs al 
    WHERE al.target_id = s.id::text 
       OR al.target_id = s.receipt_no 
       OR al.details ILIKE '%' || s.id::text || '%'
    ORDER BY al.created_at DESC 
    LIMIT 1
)
WHERE s.processed_by IS NULL;

DROP FUNCTION IF EXISTS public.get_sanitized_sales(date);

CREATE OR REPLACE FUNCTION public.get_sanitized_sales(target_date date default null)
RETURNS TABLE (
    id text,
    created_at timestamptz,
    receipt_no text,
    items jsonb,
    product_name text,
    payment_method text,
    amount_received numeric,
    change_calculated numeric,
    total_amount numeric,
    gcash_fee_applied numeric,
    reference_number text,
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
    SELECT
        s.id::text,
        s.created_at,
        COALESCE(s.receipt_no, s.id::text)::text AS receipt_no,
        s.items,
        s.product_name,
        s.payment_method,
        s.amount_received,
        s.change_calculated,
        s.total_amount,
        COALESCE(s.gcash_fee_applied, 0.00)::numeric AS gcash_fee_applied,
        s.reference_number,
        s.cash_session_id::text,
        s.processed_by::text
    FROM public.sales s, ref_date rd
    WHERE s.deleted_at IS NULL
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::date = rd.d
    ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_sanitized_sales(date) TO authenticated, anon;

COMMIT;