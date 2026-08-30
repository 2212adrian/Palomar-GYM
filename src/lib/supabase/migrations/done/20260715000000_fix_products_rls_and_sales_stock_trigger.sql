BEGIN;

-- ==============================================================================
-- 1. HELPER: ROBUST USER ROLE EVALUATION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- 1. Check app_metadata
    user_role := auth.jwt() -> 'app_metadata' ->> 'role';
    IF user_role IS NOT NULL AND user_role <> '' THEN
        RETURN user_role;
    END IF;

    -- 2. Check user_metadata
    user_role := auth.jwt() -> 'user_metadata' ->> 'role';
    IF user_role IS NOT NULL AND user_role <> '' THEN
        RETURN user_role;
    END IF;

    -- 3. Fallback: check profiles table if present
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'profiles'
    ) THEN
        BEGIN
            EXECUTE 'SELECT role FROM public.profiles WHERE id = $1 LIMIT 1'
            INTO user_role
            USING auth.uid();
            
            IF user_role IS NOT NULL AND user_role <> '' THEN
                RETURN user_role;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Ignore and proceed to default
        END;
    END IF;

    RETURN 'Staff';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper to check if current user is admin or super admin
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN AS $$
    SELECT (
        lower(public.get_user_role()) = 'admin' OR 
        lower(coalesce(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==============================================================================
-- 2. PRODUCTS TABLE & COLUMNS
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
        CREATE TYPE public.product_status AS ENUM ('Active', 'Inactive');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode_id VARCHAR(10) NOT NULL UNIQUE DEFAULT ('PR-' || lpad(floor(random() * 10000)::text, 4, '0')),
    product_name VARCHAR(100) NOT NULL,
    image_url TEXT DEFAULT NULL,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    has_stock_limit BOOLEAN NOT NULL DEFAULT false,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_alert INTEGER DEFAULT NULL,
    status public.product_status NOT NULL DEFAULT 'Active'::public.product_status,
    manufacturer_barcode TEXT DEFAULT NULL,
    manufacturer_source TEXT DEFAULT 'manual',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all required columns exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_barcode TEXT DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_source TEXT DEFAULT 'manual';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- Timestamp Trigger for Products
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Soft Delete Trigger for Products
CREATE OR REPLACE FUNCTION public.handle_products_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

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

-- ==============================================================================
-- 3. PRODUCTS RLS POLICIES (CASE-INSENSITIVE)
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to insert products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to update products" ON public.products;
DROP POLICY IF EXISTS "Allow authorized users to delete products" ON public.products;

CREATE POLICY "Allow authenticated users to view products" ON public.products
    FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL OR
        public.is_admin_or_superadmin()
    );

CREATE POLICY "Allow authorized users to insert products" ON public.products
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin_or_superadmin() AND deleted_at IS NULL
    );

CREATE POLICY "Allow authorized users to update products" ON public.products
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin_or_superadmin()
    )
    WITH CHECK (
        public.is_admin_or_superadmin()
    );

CREATE POLICY "Allow authorized users to delete products" ON public.products
    FOR DELETE
    TO authenticated
    USING (
        public.is_admin_or_superadmin()
    );

-- ==============================================================================
-- 4. SALES TABLE & AUTOMATIC STOCK DEDUCTION TRIGGERS
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE public.payment_method AS ENUM ('Cash', 'GCash');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no VARCHAR(20) NOT NULL UNIQUE DEFAULT ('TS-' || lpad(floor(random() * 1000000000000)::numeric::text, 12, '0')),
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

-- FUNCTION: Automatically deduct product inventory upon SALE creation
CREATE OR REPLACE FUNCTION public.f_tr_sales_deduct_stock_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    item_record JSONB;
    product_id_val UUID;
    quantity_val INT;
BEGIN
    IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
        FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
            product_id_val := NULLIF(COALESCE(item_record ->> 'productId', item_record ->> 'id'), '')::UUID;
            quantity_val := COALESCE((item_record ->> 'quantity')::INT, 1);

            IF product_id_val IS NOT NULL AND quantity_val IS NOT NULL THEN
                UPDATE public.products
                SET 
                    stock_quantity = GREATEST(0, stock_quantity - quantity_val),
                    updated_at = now()
                WHERE id = product_id_val
                  AND has_stock_limit = true;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sales_deduct_stock_on_insert ON public.sales;
CREATE TRIGGER tr_sales_deduct_stock_on_insert
    AFTER INSERT ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_sales_deduct_stock_on_insert();

-- FUNCTION: Restore inventory stock on SALE deletion / soft delete
CREATE OR REPLACE FUNCTION public.f_tr_sales_restore_stock_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    item_record JSONB;
    product_id_val UUID;
    quantity_val INT;
BEGIN
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    IF OLD.items IS NOT NULL AND jsonb_typeof(OLD.items) = 'array' THEN
        FOR item_record IN SELECT * FROM jsonb_array_elements(OLD.items) LOOP
            product_id_val := NULLIF(COALESCE(item_record ->> 'productId', item_record ->> 'id'), '')::UUID;
            quantity_val := COALESCE((item_record ->> 'quantity')::INT, 1);

            IF product_id_val IS NOT NULL AND quantity_val IS NOT NULL THEN
                UPDATE public.products
                SET 
                    stock_quantity = stock_quantity + quantity_val,
                    updated_at = now()
                WHERE id = product_id_val
                  AND has_stock_limit = true;
            END IF;
        END LOOP;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNCTION: Soft delete interceptor for sales
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
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sales_restore_stock_on_delete ON public.sales;
CREATE TRIGGER tr_sales_restore_stock_on_delete
    BEFORE DELETE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_sales_restore_stock_on_delete();

DROP TRIGGER IF EXISTS tr_sales_soft_delete ON public.sales;
CREATE TRIGGER tr_sales_soft_delete
    BEFORE DELETE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_sales_soft_delete();

-- ==============================================================================
-- 5. SALES RLS POLICIES
-- ==============================================================================
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated users to insert sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authorized users to update sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authorized users to delete sales" ON public.sales;

CREATE POLICY "Allow authenticated users to view sales" ON public.sales
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin_or_superadmin()
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
        public.is_admin_or_superadmin()
    )
    WITH CHECK (
        public.is_admin_or_superadmin()
    );

CREATE POLICY "Allow authorized users to delete sales" ON public.sales
    FOR DELETE
    TO authenticated
    USING (
        public.is_admin_or_superadmin()
        OR (
            (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );

-- Enable Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'products'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sales'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
        END IF;
    END IF;
END $$;

COMMIT;