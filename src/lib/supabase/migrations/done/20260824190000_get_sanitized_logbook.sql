-- Migration: Create get_sanitized_logbook RPC function
-- Purpose: Sanitizes attendance check-ins and receipts into a display-safe DTO.
-- Prevents DevTools from inspecting sensitive database columns (emails, addresses, phones, internal auth ids)
-- and avoids adding any new database tables.

create or replace function public.get_sanitized_logbook(target_date date default null)
returns table (
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
    deletable boolean
)
language sql
security definer
set search_path = public
as $$
    with ref_date as (
        select coalesce(target_date, (now() at time zone 'Asia/Manila')::date) as d
    )
    -- 1. Attendance Check-ins for target date (Active records only)
    select
        a.id::text as id,
        a.check_in_time as "timestamp",
        a.member_id::text as member_id,
        a.customer_name::text as customer_name,
        a.customer_type::text as customer_type,
        coalesce(a.plan_name, 'Regular Pass')::text as category_or_plan,
        a.payment_method::text as payment_method,
        coalesce(a.entry_fee, 0.00)::numeric as amount_paid,
        coalesce(a.base_price, a.entry_fee - coalesce(a.gcash_fee, 0.00))::numeric as base_price,
        coalesce(a.gcash_fee, 0.00)::numeric as gcash_fee,
        coalesce(a.card_fee, 0.00)::numeric as card_fee,
        a.gcash_ref_no::text as gcash_ref_no,
        case when coalesce(a.entry_fee, 0.00) > 0 then 'Paid' else 'Promo' end::text as payment_status,
        false as is_subscription,
        true as deletable
    from public.attendance a, ref_date rd
    where a.deleted_at is null
      and (a.check_in_time at time zone 'Asia/Manila')::date = rd.d

    union all

    -- 2. Receipts / Subscriptions for target date
    select
        'rcpt-' || r.id::text as id,
        r.created_at as "timestamp",
        r.member_id::text as member_id,
        r.customer_name::text as customer_name,
        coalesce(r.customer_type::text, 'New Membership')::text as customer_type,
        coalesce(r.item_description::text, 'Subscription')::text as category_or_plan,
        r.payment_method::text as payment_method,
        coalesce(r.amount, 0.00)::numeric as amount_paid,
        coalesce(r.base_price, r.amount, 0.00)::numeric as base_price,
        coalesce(r.gcash_fee, 0.00)::numeric as gcash_fee,
        coalesce(r.card_fee, 0.00)::numeric as card_fee,
        r.gcash_ref_no::text as gcash_ref_no,
        'Paid'::text as payment_status,
        true as is_subscription,
        false as deletable
    from public.receipts r, ref_date rd
    where (r.created_at at time zone 'Asia/Manila')::date = rd.d

    order by "timestamp" desc;
$$;

-- Grant execution privileges
grant execute on function public.get_sanitized_logbook(date) to authenticated, anon;