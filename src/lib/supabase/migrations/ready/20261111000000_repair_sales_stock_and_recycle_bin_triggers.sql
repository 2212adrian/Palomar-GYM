-- Migration: Repair Sales Stock Triggers, Recycle Bin Restoration, Centralized Conflicts Table, and Open Session RLS
-- Timestamp: 20261111000000_repair_sales_stock_and_recycle_bin_triggers.sql

BEGIN;

-- 1. Add quarantine columns to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS quarantine_reason TEXT DEFAULT NULL;

-- 2. Helper function to extract products and quantities from sales items JSONB array
CREATE OR REPLACE FUNCTION public.f_get_sales_item_elements(items_payload JSONB)
RETURNS TABLE (product_id UUID, quantity INT) AS $$
BEGIN
    IF items_payload IS NULL OR jsonb_typeof(items_payload) <> 'array' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        NULLIF(COALESCE(elem ->> 'productId', elem ->> 'product_id', elem ->> 'id'), '')::UUID AS product_id,
        GREATEST(1, COALESCE((elem ->> 'quantity')::INT, 1)) AS quantity
    FROM jsonb_array_elements(items_payload) AS elem
    WHERE NULLIF(COALESCE(elem ->> 'productId', elem ->> 'product_id', elem ->> 'id'), '') IS NOT NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Trigger on INSERT: Atomic stock deduction with availability verification
CREATE OR REPLACE FUNCTION public.f_tr_sales_deduct_stock_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    prod_record RECORD;
BEGIN
    IF NEW.is_quarantined = true THEN
        RETURN NEW;
    END IF;

    FOR item_record IN SELECT * FROM public.f_get_sales_item_elements(NEW.items) LOOP
        SELECT id, product_name, has_stock_limit, stock_quantity
        INTO prod_record
        FROM public.products
        WHERE id = item_record.product_id
        FOR UPDATE;

        IF FOUND AND prod_record.has_stock_limit THEN
            IF prod_record.stock_quantity < item_record.quantity THEN
                RAISE EXCEPTION 'Insufficient stock for product "%" (Available: %, Requested: %)', 
                    prod_record.product_name, prod_record.stock_quantity, item_record.quantity
                    USING ERRCODE = 'P0001';
            END IF;

            UPDATE public.products
            SET 
                stock_quantity = prod_record.stock_quantity - item_record.quantity,
                updated_at = now()
            WHERE id = item_record.product_id;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sales_deduct_stock_on_insert ON public.sales;
CREATE TRIGGER tr_sales_deduct_stock_on_insert
    BEFORE INSERT ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_sales_deduct_stock_on_insert();

-- 4. Trigger on UPDATE: Manage stock on soft-delete, restore, quarantine, and un-quarantine
CREATE OR REPLACE FUNCTION public.f_tr_sales_handle_soft_delete_and_restore()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    prod_record RECORD;
BEGIN
    -- CASE A: Moved to Recycle Bin or Quarantined (return stock to products)
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) OR 
       (COALESCE(OLD.is_quarantined, false) = false AND NEW.is_quarantined = true) THEN
        FOR item_record IN SELECT * FROM public.f_get_sales_item_elements(OLD.items) LOOP
            SELECT id, has_stock_limit
            INTO prod_record
            FROM public.products
            WHERE id = item_record.product_id
            FOR UPDATE;

            IF FOUND AND prod_record.has_stock_limit THEN
                UPDATE public.products
                SET 
                    stock_quantity = stock_quantity + item_record.quantity,
                    updated_at = now()
                WHERE id = item_record.product_id;
            END IF;
        END LOOP;
        RETURN NEW;
    END IF;

    -- CASE B: Restored from Recycle Bin or Un-quarantined (deduct stock back)
    IF (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) OR 
       (OLD.is_quarantined = true AND COALESCE(NEW.is_quarantined, false) = false) THEN
        FOR item_record IN SELECT * FROM public.f_get_sales_item_elements(NEW.items) LOOP
            SELECT id, product_name, has_stock_limit, stock_quantity
            INTO prod_record
            FROM public.products
            WHERE id = item_record.product_id
            FOR UPDATE;

            IF FOUND AND prod_record.has_stock_limit THEN
                IF prod_record.stock_quantity < item_record.quantity THEN
                    RAISE EXCEPTION 'Cannot activate sale: Product "%" has insufficient stock (Available: %, Required: %)',
                        prod_record.product_name, prod_record.stock_quantity, item_record.quantity
                        USING ERRCODE = 'P0001';
                END IF;

                UPDATE public.products
                SET 
                    stock_quantity = prod_record.stock_quantity - item_record.quantity,
                    updated_at = now()
                WHERE id = item_record.product_id;
            END IF;
        END LOOP;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sales_soft_delete_and_restore ON public.sales;
CREATE TRIGGER tr_sales_soft_delete_and_restore
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.f_tr_sales_handle_soft_delete_and_restore();

-- 5. Clean up obsolete triggers
DROP TRIGGER IF EXISTS tr_sales_restoration_stock ON public.sales;
DROP TRIGGER IF EXISTS tr_sales_restore_stock_on_delete ON public.sales;

-- 6. Update sanitized sales RPC to exclude quarantined collision records
DROP FUNCTION IF EXISTS public.get_sanitized_sales(text);
DROP FUNCTION IF EXISTS public.get_sanitized_sales(date);

CREATE OR REPLACE FUNCTION public.get_sanitized_sales(target_date TEXT)
RETURNS TABLE (
    id TEXT,
    cash_session_id TEXT,
    created_at TIMESTAMPTZ,
    receipt_no TEXT,
    items JSONB,
    product_name TEXT,
    payment_method TEXT,
    amount_received NUMERIC,
    change_calculated NUMERIC,
    total_amount NUMERIC,
    gcash_fee_applied NUMERIC,
    reference_number TEXT,
    processed_by TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id::TEXT,
        s.cash_session_id::TEXT,
        s.created_at,
        s.receipt_no::TEXT,
        s.items,
        s.product_name,
        s.payment_method::TEXT,
        s.amount_received,
        s.change_calculated,
        s.total_amount,
        s.gcash_fee_applied,
        s.reference_number::TEXT,
        COALESCE(s.processed_by::TEXT, 'System') AS processed_by
    FROM public.sales s
    WHERE s.deleted_at IS NULL
      AND (s.is_quarantined IS NULL OR s.is_quarantined = false)
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::date = target_date::date
    ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 7. Centralized Sync Conflicts Table (visible and resolvable across all admin registers)
CREATE TABLE IF NOT EXISTS public.sync_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conflict_type TEXT NOT NULL DEFAULT 'sale_stock_collision',
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    first_transaction JSONB NOT NULL,
    second_transaction JSONB NOT NULL,
    resolution TEXT DEFAULT NULL,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_by_name TEXT DEFAULT NULL,
    resolved_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON public.sync_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_created_at ON public.sync_conflicts(created_at DESC);

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read sync conflicts" ON public.sync_conflicts;
CREATE POLICY "Allow authenticated users to read sync conflicts"
ON public.sync_conflicts
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to create sync conflicts" ON public.sync_conflicts;
CREATE POLICY "Allow authenticated users to create sync conflicts"
ON public.sync_conflicts
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update sync conflicts" ON public.sync_conflicts;
CREATE POLICY "Allow authenticated users to update sync conflicts"
ON public.sync_conflicts
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 8. Enable Realtime broadcasting for sync_conflicts
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sync_conflicts'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_conflicts;
        END IF;
    END IF;
END $$;

-- 9. Update Sales SELECT Policy to allow Staff to view sales in any open cash session
DROP POLICY IF EXISTS "Allow authenticated users to view sales" ON public.sales;

CREATE POLICY "Allow authenticated users to view sales" ON public.sales
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin_or_superadmin()
        OR (
            deleted_at IS NULL 
            AND (
                (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
                OR (
                    cash_session_id IS NOT NULL 
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs 
                        WHERE cs.id = sales.cash_session_id AND cs.status = 'open'
                    )
                )
            )
        )
    );

COMMIT;