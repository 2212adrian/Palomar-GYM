-- Migration: Update Sales Table with Stock Restoration and RLS Fixes
-- Description: Adds BEFORE DELETE trigger to restore product stock. Consolidates triggers and standardizes RLS.
-- Timestamp: 20260714170000_update_sales_stock_rls.sql

BEGIN;

-- ==============================================================================
-- PART 1: ENUM & FUNCTIONS
-- ==============================================================================

-- Create custom ENUM type for transaction payment methods if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE public.payment_method AS ENUM ('Cash', 'GCash');
    END IF;
END $$;

-- Create the unique random receipt generator function
CREATE OR REPLACE FUNCTION public.generate_unique_receipt_no()
RETURNS TEXT AS $$
DECLARE
    new_receipt TEXT;
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_receipt := 'TS-' || lpad(floor(random() * 1000000000000)::numeric::text, 12, '0');
        
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'sales'
        ) THEN
            done := TRUE;
        ELSE
            EXECUTE 'SELECT NOT EXISTS (SELECT 1 FROM public.sales WHERE receipt_no = $1)'
            INTO done
            USING new_receipt;
        END IF;
    END LOOP;
    RETURN new_receipt;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ==============================================================================
-- PART 2: TABLE STRUCTURE
-- ==============================================================================

-- Create the sales transaction ledger table if not exists
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no VARCHAR(15) NOT NULL UNIQUE DEFAULT public.generate_unique_receipt_no(),
    items JSONB NOT NULL, 
    product_name TEXT NOT NULL, 
    payment_method public.payment_method NOT NULL DEFAULT 'Cash'::public.payment_method,
    amount_received DECIMAL(10,2) DEFAULT 0.00,
    change_calculated DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    gcash_fee_applied DECIMAL(10,2) DEFAULT 0.00,
    reference_number VARCHAR(50) DEFAULT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive columns addition (idempotent)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS reference_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- ==============================================================================
-- PART 3: TRIGGER FUNCTIONS
-- ==============================================================================

-- FUNCTION: f_tr_sales_restore_stock_on_delete (NEW)
-- Reads OLD.items JSONB and restores stock to public.products.
CREATE OR REPLACE FUNCTION public.f_tr_sales_restore_stock_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    item_record JSONB;
    product_id_val UUID;
    quantity_val INT;
BEGIN
    -- Loop through the items array in the deleted transaction
    FOR item_record IN SELECT * FROM jsonb_array_elements(OLD.items) LOOP
        -- Extract values, ensuring correct types
        product_id_val := (item_record ->> 'productId')::UUID;
        quantity_val := (item_record ->> 'quantity')::INT;

        -- Update product stock atomically
        IF product_id_val IS NOT NULL AND quantity_val IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock_quantity = stock_quantity + quantity_val,
                updated_at = now()
            WHERE id = product_id_val;
        END IF;
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNCTION: handle_sales_soft_delete (EXISTING)
-- Converts physical DELETE to logical UPDATE.
CREATE OR REPLACE FUNCTION public.handle_sales_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- If already marked deleted via cascade or previous trigger, do nothing
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    -- Perform soft delete
    UPDATE public.sales
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;
    
    -- Cancel physical deletion
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- PART 4: TRIGGERS
-- ==============================================================================

-- 1. Auto-Update Timestamp
DROP TRIGGER IF EXISTS update_sales_updated_at ON public.sales;
CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 2. Restore Stock on Delete (NEW: Must run BEFORE soft delete)
DROP TRIGGER IF EXISTS tr_sales_restore_stock_on_delete ON public.sales;
CREATE TRIGGER tr_sales_restore_stock_on_delete
    BEFORE DELETE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_sales_restore_stock_on_delete();

-- 3. Soft Delete Interceptor (EXISTING: Must run BEFORE DELETE, after stock restore)
DROP TRIGGER IF EXISTS tr_sales_soft_delete ON public.sales;
CREATE TRIGGER tr_sales_soft_delete
    BEFORE DELETE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_sales_soft_delete();

-- ==============================================================================
-- PART 5: ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Allow authenticated users to view sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated users to insert sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authorized users to update sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authorized users to delete sales" ON public.sales;

-- POLICY: View sales
-- Admins OR specific email can view all. Staff can view non-deleted sales from today.
CREATE POLICY "Allow authenticated users to view sales" ON public.sales
    FOR SELECT
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            deleted_at IS NULL 
            AND (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );

-- POLICY: Insert sales
-- Allowed if not logically deleted.
CREATE POLICY "Allow authenticated users to insert sales" ON public.sales
    FOR INSERT
    TO authenticated
    WITH CHECK (
        deleted_at IS NULL
    );

-- POLICY: Update sales
-- Admins OR specific email only.
CREATE POLICY "Allow authorized users to update sales" ON public.sales
    FOR UPDATE
    TO authenticated
    USING (
        lower(public.get_user_role()) = 'admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    )
    WITH CHECK (
        lower(public.get_user_role()) = 'admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- POLICY: Delete sales
-- Admins OR specific email can delete. Staff can delete today's sales (Trigger converts to soft delete).
CREATE POLICY "Allow authorized users to delete sales" ON public.sales
    FOR DELETE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );

-- ==============================================================================
-- PART 6: MAINTENANCE
-- ==============================================================================

-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily purge of sales older than 24 hours in the recycle bin (Manila time)
SELECT cron.schedule(
    'daily-purge-old-soft-deleted-sales',
    '0 16 * * *', 
    $$ DELETE FROM public.sales WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '24 hours'; $$
);

-- ==============================================================================
-- PART 7: REALTIME
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = 'sales'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
        END IF;
    END IF;
END $$;

COMMIT;