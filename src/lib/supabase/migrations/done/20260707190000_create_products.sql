-- Migration: Create Products (Inventory) Table with Barcode Generator & RLS Policies
-- 20260707190000_create_products.sql

-- 1. Safely create custom ENUM type for product status if it does not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
        CREATE TYPE public.product_status AS ENUM ('Active', 'Inactive');
    END IF;
END $$;

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
    RETURN new_barcode;
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


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


-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;


-- 7. Configure RLS Policies
-- Drop existing policies first to prevent "policy already exists" errors during re-runs
DROP POLICY IF EXISTS "Allow authenticated users to view products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to insert products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to update products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to delete products" ON public.products;

-- View Permission (Admin, wolf.palomar@gmail.com, and Staff can all view)
CREATE POLICY "Allow authenticated users to view products" ON public.products
    FOR SELECT
    TO authenticated
    USING (true);

-- Add Permission (Only Admin or wolf.palomar@gmail.com can create)
CREATE POLICY "Allow authorized users to insert products" ON public.products
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
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

-- Delete Permission (Only Admin or wolf.palomar@gmail.com can delete)
CREATE POLICY "Allow authorized users to delete products" ON public.products
    FOR DELETE
    TO authenticated
    USING (
        public.get_user_role() = 'Admin' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );