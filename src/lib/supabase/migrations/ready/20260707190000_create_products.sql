-- Migration: Create Products (Inventory) Table with Barcode Generator, RLS Policies, Soft Delete, and Realtime Support
-- Timestamp: 20260707190000

-- 1. Safely create custom ENUM type for product status if it does not exist
DO $type_creation$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
        CREATE TYPE public.product_status AS ENUM ('Active', 'Inactive');
    END IF;
END $type_creation$;

-- 2. Create the unique random barcode ID generator function
CREATE OR REPLACE FUNCTION public.generate_unique_barcode_id()
RETURNS TEXT AS $$
DECLARE
    new_barcode TEXT;
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_barcode := 'PR-' || lpad(floor(random() * 10000)::text, 4, '0');
        
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'products'
        ) THEN
            done := TRUE;
        ELSE
            EXECUTE 'SELECT NOT EXISTS (SELECT 1 FROM public.products WHERE barcode_id = $1)'
            INTO done
            USING new_barcode;
        END IF;
    END LOOP;
    return new_barcode;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 3. Create the products table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode_id VARCHAR(7) NOT NULL UNIQUE DEFAULT public.generate_unique_barcode_id(),
    product_name VARCHAR(100) NOT NULL,
    image_url TEXT DEFAULT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    has_stock_limit BOOLEAN NOT NULL DEFAULT false,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_alert INTEGER DEFAULT NULL,
    status public.product_status NOT NULL DEFAULT 'Active'::public.product_status,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive columns addition
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- 4. Set up updated_at modification trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 5. Soft Delete interception trigger
CREATE OR REPLACE FUNCTION public.handle_products_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.products
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_products_soft_delete ON public.products;

CREATE TRIGGER tr_products_soft_delete
    BEFORE DELETE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_products_soft_delete();

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 7. Configure RLS Policies
DROP POLICY IF EXISTS "Allow authenticated users to view products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to insert products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to update products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to delete products" ON public.products;

CREATE POLICY "Allow authenticated users to view products" ON public.products
    FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL OR
        lower(public.get_user_role()) = 'admin' OR
        lower(auth.jwt() ->> 'email') = 'wolf.palomar@gmail.com'
    );

CREATE POLICY "Allow authorized users to insert products" ON public.products
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (lower(public.get_user_role()) = 'admin' OR lower(auth.jwt() ->> 'email') = 'wolf.palomar@gmail.com')
        AND deleted_at IS NULL
    );

CREATE POLICY "Allow authorized users to update products" ON public.products
    FOR UPDATE
    TO authenticated
    USING (
        lower(public.get_user_role()) = 'admin' OR
        lower(auth.jwt() ->> 'email') = 'wolf.palomar@gmail.com'
    )
    WITH CHECK (
        lower(public.get_user_role()) = 'admin' OR
        lower(auth.jwt() ->> 'email') = 'wolf.palomar@gmail.com'
    );

CREATE POLICY "Allow authorized users to delete products" ON public.products
    FOR DELETE
    TO authenticated
    USING (
        lower(public.get_user_role()) = 'admin' OR
        lower(auth.jwt() ->> 'email') = 'wolf.palomar@gmail.com'
    );

-- 8. Enable Realtime Postgres Changes safely
DO $realtime_setup$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = 'products'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
        END IF;
    END IF;
END $realtime_setup$;

-- 9. Auto-Deletion Schedule (30 Days Retention)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE jobname = 'purge-old-soft-deleted-products';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'purge-old-soft-deleted-products',
    '0 16 * * *',
    'DELETE FROM public.products WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ''30 days'''
);