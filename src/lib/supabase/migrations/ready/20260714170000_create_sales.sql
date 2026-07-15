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
    return new_receipt;
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 3. Create the sales transaction ledger table
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
    reference_number VARCHAR(50) DEFAULT NULL, -- Added GCash Reference Number Column
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive columns addition: safe fallback if the table already existed previously
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS reference_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;


-- 4. Set up updated_at modification trigger
DROP TRIGGER IF EXISTS update_sales_updated_at ON public.sales;

CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();


-- 5. Set up transparent Soft Delete interception trigger
CREATE OR REPLACE FUNCTION public.handle_sales_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    UPDATE public.sales
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;
    
    return NULL; 
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

CREATE POLICY "Allow authenticated users to insert sales" ON public.sales
    FOR INSERT
    TO authenticated
    WITH CHECK (
        deleted_at IS NULL
    );

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
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'daily-purge-old-soft-deleted-sales',
    '0 16 * * *', 
    $$ DELETE FROM public.sales WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '24 hours'; $$
);