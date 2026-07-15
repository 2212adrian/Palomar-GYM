-- Migration: Create Sales Table with Receipt Generator, RLS Policies, Soft Delete, and Realtime Support
-- Timestamp: 20260714170000_create_sales.sql

-- 1. Create custom ENUM type for transaction payment methods
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE public.payment_method AS ENUM ('Cash', 'GCash');
    END IF;
END $$;

-- 2. Create the unique random receipt generator function
-- Generates values in 'TS-XXXXXXXXXXXX' format, where XXXXXXXXXXXX is a 12-digit random string
CREATE OR REPLACE FUNCTION public.generate_unique_receipt_no()
RETURNS TEXT AS $$
DECLARE
    new_receipt TEXT;
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        -- Generates random 12-digit numeric sequence
        new_receipt := 'TS-' || lpad(floor(random() * 1000000000000)::numeric::text, 12, '0');
        
        -- Safe check using dynamic query to prevent compile issues if table does not exist yet
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
    return new_receipt;
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 3. Create the sales transaction ledger table
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no VARCHAR(15) NOT NULL UNIQUE DEFAULT public.generate_unique_receipt_no(),
    items JSONB NOT NULL, -- List of products purchased on a single transaction
    product_name TEXT NOT NULL, -- Compact display text (e.g., "2x Whey Protein, 1x Water")
    payment_method public.payment_method NOT NULL DEFAULT 'Cash'::public.payment_method,
    amount_received DECIMAL(10,2) DEFAULT 0.00,
    change_calculated DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    gcash_fee_applied DECIMAL(10,2) DEFAULT 0.00,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive columns addition: safe fallback if the table already existed previously
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;


-- 4. Set up updated_at modification trigger
DROP TRIGGER IF EXISTS update_sales_updated_at ON public.sales;

CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();


-- 5. Set up transparent Soft Delete interception trigger
-- Intercepts actual physical deletes and redirects them into logical updates
-- Upgraded: Checks if row is already soft-deleted to allow physical deletion to proceed
CREATE OR REPLACE FUNCTION public.handle_sales_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- If the row is already soft-deleted, allow physical deletion
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    -- Otherwise, intercept and perform logical soft-delete
    UPDATE public.sales
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;
    
    return NULL; -- Suppress physical deletion for active rows
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sales_soft_delete ON public.sales;

CREATE TRIGGER tr_sales_soft_delete
    BEFORE DELETE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_sales_soft_delete();


-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;


-- 7. Configure RLS Policies
DROP POLICY IF EXISTS "Allow authenticated users to view sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated users to insert sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authorized users to update sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authorized users to delete sales" ON public.sales;

-- View Permission (Staff can only view today's transactions for privacy. Admins can view everything)
-- Corrected: changed "auth.jwt() -> biographies ->> 'email'" to "auth.jwt() ->> 'email'"
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

-- Add Permission (Any staff or admin can register a transaction)
CREATE POLICY "Allow authenticated users to insert sales" ON public.sales
    FOR INSERT
    TO authenticated
    WITH CHECK (
        deleted_at IS NULL
    );

-- Edit Permission (Only Admin can modify existing sales data)
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

-- Delete Permission (Staff and Admin can delete today's transactions; past transactions can only be soft-deleted by Admin)
CREATE POLICY "Allow authorized users to delete sales" ON public.sales
    FOR DELETE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );


-- 8. Enable Realtime Postgres Changes safely
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


-- 9. Auto-Deletion Schedule (Runs every 24 hours of Manila time)
-- 12:00 AM Manila Time corresponds to 4:00 PM UTC (16:00)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'daily-purge-old-soft-deleted-sales',
    '0 16 * * *', -- Everyday at 16:00 UTC (12:00 AM Manila local time)
    $$ DELETE FROM public.sales WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '24 hours'; $$
);