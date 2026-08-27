-- Migration: Create Subscriptions Table
-- File: 20260804150200_create_subscriptions_table.sql

BEGIN;

-- Type Guard Enforcers (Ensures standalone execution without dependency errors)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_type_enum') THEN
        CREATE TYPE public.subscription_type_enum AS ENUM ('monthly', 'yearly', 'incentive');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
        CREATE TYPE public.subscription_status_enum AS ENUM ('Active', 'Expired', 'Inactive', 'Voided');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN
        CREATE TYPE public.payment_method_enum AS ENUM ('Cash', 'GCash', 'Promo');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id VARCHAR(30) PRIMARY KEY DEFAULT public.generate_sub_id(),
    member_id VARCHAR(20) NOT NULL REFERENCES public.members(member_id) ON DELETE CASCADE,
    plan_type public.subscription_type_enum NOT NULL DEFAULT 'monthly'::public.subscription_type_enum,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    gcash_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    card_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    gcash_ref_no VARCHAR(50) DEFAULT NULL,
    start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_date TIMESTAMPTZ NOT NULL,
    status public.subscription_status_enum NOT NULL DEFAULT 'Active'::public.subscription_status_enum,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'Paid',
    payment_method public.payment_method_enum NOT NULL DEFAULT 'Cash'::public.payment_method_enum,
    receipt_number VARCHAR(30) UNIQUE NOT NULL DEFAULT public.generate_rec_receipt_no(),

    -- Void Metadata
    voided_at TIMESTAMPTZ DEFAULT NULL,
    voided_by TEXT DEFAULT NULL,
    void_reason TEXT DEFAULT NULL,
    void_notes TEXT DEFAULT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security (RLS)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view subscriptions" ON public.subscriptions;
CREATE POLICY "Allow authenticated users to view subscriptions" ON public.subscriptions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert subscriptions" ON public.subscriptions;
CREATE POLICY "Allow authenticated users to insert subscriptions" ON public.subscriptions
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authorized users to update subscriptions" ON public.subscriptions;
CREATE POLICY "Allow authorized users to update subscriptions" ON public.subscriptions
    FOR UPDATE TO authenticated USING (true);

-- Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'subscriptions') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
        END IF;
    END IF;
END $$;

COMMIT;