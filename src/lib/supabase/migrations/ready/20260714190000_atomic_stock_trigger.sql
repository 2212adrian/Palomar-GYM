-- Migration: Atomic Server-Side Stock Restoration and Multi-Click Prevention
-- Timestamp: 20260714190000_atomic_stock_trigger.sql

-- 1. Update Soft Delete Trigger to perform Server-Side Stock Restoration and prevent duplicates
CREATE OR REPLACE FUNCTION public.handle_sales_soft_delete()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
BEGIN
    -- PREVENT MULTI-CLICK DUPLICATES: If already soft-deleted, exit immediately
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN NULL;
    END IF;

    -- ATOMIC STOCK RESTORATION: Automatically increase stock levels on delete
    FOR item_record IN 
        SELECT ("productId"::UUID) AS prod_id, quantity 
        FROM jsonb_to_recordset(OLD.items) AS x("productId" TEXT, quantity INT)
    LOOP
        UPDATE public.products
        SET stock_quantity = stock_quantity + item_record.quantity
        WHERE id = item_record.prod_id;
    END LOOP;

    -- Perform the soft delete update
    UPDATE public.sales
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;
    
    RETURN NULL; -- Suppresses physical table deletion
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create a Trigger to automatically deduct stock on restoration
CREATE OR REPLACE FUNCTION public.handle_sales_restoration_stock()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
BEGIN
    -- When deleted_at transitions from not null to null (Restored from Recycle Bin)
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        FOR item_record IN 
            SELECT ("productId"::UUID) AS prod_id, quantity 
            FROM jsonb_to_recordset(NEW.items) AS x("productId" TEXT, quantity INT)
        LOOP
            -- Deduct stock back when the transaction is brought back to the active ledger
            UPDATE public.products
            SET stock_quantity = GREATEST(0, stock_quantity - item_record.quantity)
            WHERE id = item_record.prod_id;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the restoration trigger to sales table
DROP TRIGGER IF EXISTS tr_sales_restoration_stock ON public.sales;

CREATE TRIGGER tr_sales_restoration_stock
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_sales_restoration_stock();