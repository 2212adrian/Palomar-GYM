-- Migration: Create get_sanitized_sales RPC function
-- Purpose: Sanitizes sales transactions into a display-safe DTO.
-- Prevents DevTools from inspecting sensitive columns (cost prices, supplier notes, internal audit fields)
-- and avoids adding any new database tables.

create or replace function public.get_sanitized_sales(target_date date default null)
returns table (
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
    reference_number text
)
language sql
security definer
set search_path = public
as $$
    with ref_date as (
        select coalesce(target_date, (now() at time zone 'Asia/Manila')::date) as d
    )
    select
        s.id::text as id,
        s.created_at,
        coalesce(s.receipt_no, s.id::text) as receipt_no,
        coalesce(s.items, '[]'::jsonb) as items,
        coalesce(s.product_name, 'Multiple Items') as product_name,
        s.payment_method,
        s.amount_received,
        s.change_calculated,
        s.total_amount,
        coalesce(s.gcash_fee_applied, 0) as gcash_fee_applied,
        s.reference_number
    from sales s, ref_date rd
    where s.deleted_at is null
      and (s.created_at at time zone 'Asia/Manila')::date = rd.d
    order by s.created_at desc;
$$;

-- Grant execution privileges
grant execute on function public.get_sanitized_sales(date) to authenticated, anon;