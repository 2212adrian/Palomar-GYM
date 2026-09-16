-- Migration: Create get_sanitized_sales RPC function
-- Purpose: Sanitizes sales transactions into a display-safe DTO.
-- Prevents DevTools from inspecting sensitive columns (cost prices, supplier notes, internal audit fields),
-- includes cash_session_id for session-based grouping and lifecycle locks, and avoids adding any new database tables.

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
    cash_session_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ref_date AS (
        SELECT COALESCE(target_date, (now() AT TIME ZONE 'Asia/Manila')::date) AS d
    )
    SELECT
        s.id::text AS id,
        s.created_at,
        COALESCE(s.receipt_no, s.id::text) AS receipt_no,
        COALESCE(s.items, '[]'::jsonb) AS items,
        COALESCE(s.product_name, 'Multiple Items') AS product_name,
        s.payment_method,
        s.amount_received,
        s.change_calculated,
        s.total_amount,
        COALESCE(s.gcash_fee_applied, 0) AS gcash_fee_applied,
        s.reference_number,
        s.cash_session_id::text AS cash_session_id
    FROM sales s, ref_date rd
    WHERE s.deleted_at IS NULL
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::date = rd.d
    ORDER BY s.created_at DESC;
$$;

-- Grant execution privileges
GRANT EXECUTE ON FUNCTION public.get_sanitized_sales(date) TO authenticated, anon;