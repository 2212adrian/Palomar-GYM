-- Migration: Create Products (Inventory) Table with Barcode Generator, RLS Policies, Soft Delete, and Realtime Support
-- 20260707190000_create_products.sql

-- 1. Safely create custom ENUM type for product status if it does not exist
DO $type_creation$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
        CREATE TYPE public.product_status AS ENUM ('Active', 'Inactive');
    END IF;
END $type_creation$;

-- 2. Create the unique random barcode ID generator function
-- Generates values in 'PR-XXXX' format, where XXXX is a 4-digit random string (e.g., PR-4832)
CREATE OR REPLACE FUNCTION public.generate_unique_barcode_id()
RETURNS TEXT AS $$
DECLARE
    new_barcode TEXT;
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_barcode := 'PR-' || lpad(floor(random() * 10000)::text, 4, '0');
        
        -- Safe check using dynamic query to prevent compile issues if table does not exist yet
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


-- 3. Create helper function for role evaluation if it does not exist yet
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
    SELECT coalesce(
        nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
        nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
        'Staff'
    );
$$ LANGUAGE sql SECURITY INVOKER STABLE;


-- 4. Create the products table
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

-- Defensive columns addition: safe fallback if the table already existed previously
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;


-- 5. Set up updated_at modification trigger
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


-- 6. Set up the transparent Soft Delete interception trigger
-- Intercepts actual physical deletes and redirects them into logical updates
CREATE OR REPLACE FUNCTION public.handle_products_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.products
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;
    
    RETURN NULL; -- Return NULL to suppress physical table deletion
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_products_soft_delete ON public.products;

CREATE TRIGGER tr_products_soft_delete
    BEFORE DELETE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_products_soft_delete();


-- 7. Enable Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;


-- 8. Configure RLS Policies
-- Drop existing policies first to prevent "policy already exists" errors during re-runs
DROP POLICY IF EXISTS "Allow authenticated users to view products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to insert products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to update products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to delete products" ON public.products;

-- View Permission (Staff and general users can only view non-deleted products. Admins can view soft-deleted files for audit/restoration)
CREATE POLICY "Allow authenticated users to view products" ON public.products
    FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL OR
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- Add Permission (Only Admin or wolf.palomar@gmail.com can create)
CREATE POLICY "Allow authorized users to insert products" ON public.products
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (public.get_user_role() = 'Admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        AND deleted_at IS NULL
    );

-- Edit Permission (Only Admin or wolf.palomar@gmail.com can modify)
CREATE POLICY "Allow authorized users to update products" ON public.products
    FOR UPDATE
    TO authenticated
    USING (
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    )
    WITH CHECK (
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- Delete Permission (Required for the soft-delete interception trigger to run for authorized users)
CREATE POLICY "Allow authorized users to delete products" ON public.products
    FOR DELETE
    TO authenticated
    USING (
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );


-- 9. Enable Realtime Postgres Changes safely
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


-- 10. Auto-Deletion Schedule (30 Days Retention) - Everyday at 8:00 AM UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'purge-old-soft-deleted-products',
    '0 2 * * *',
    'DELETE FROM public.products WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ''30 days'''
);