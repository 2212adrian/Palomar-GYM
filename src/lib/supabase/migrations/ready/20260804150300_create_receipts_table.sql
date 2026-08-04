-- Migration: Create Receipts / Invoices Table
-- File: 20260804150300_create_receipts_table.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.receipts (
    id VARCHAR(30) PRIMARY KEY DEFAULT public.generate_rec_receipt_no(),
    member_id VARCHAR(20) DEFAULT NULL REFERENCES public.members(member_id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_type public.customer_type_enum NOT NULL DEFAULT 'Walk-In'::public.customer_type_enum,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    base_price DECIMAL(10,2) DEFAULT 0.00,
    gcash_fee DECIMAL(10,2) DEFAULT 0.00,
    card_fee DECIMAL(10,2) DEFAULT 0.00,
    gcash_ref_no VARCHAR(50) DEFAULT NULL,
    payment_method public.payment_method_enum NOT NULL DEFAULT 'Cash'::public.payment_method_enum,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'Paid',
    item_description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security (RLS)
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view receipts" ON public.receipts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert receipts" ON public.receipts
    FOR INSERT TO authenticated WITH CHECK (true);

COMMIT;