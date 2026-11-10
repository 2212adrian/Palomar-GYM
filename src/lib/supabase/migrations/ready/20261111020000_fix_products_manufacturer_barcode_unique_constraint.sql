-- Migration: Fix Products Manufacturer Barcode Unique Constraint for Soft Deletion
-- Description: Drops the global table-level unique constraint on manufacturer_barcode which prevented 
-- creating or restoring products when an item with the same external barcode was in the recycle bin.
-- Replaces it with a partial unique index that only enforces uniqueness on active products (deleted_at IS NULL).

DO $$
BEGIN
  -- 1. Drop existing global table-level unique constraint on manufacturer_barcode if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_manufacturer_barcode_key'
  ) THEN
    ALTER TABLE public.products DROP CONSTRAINT products_manufacturer_barcode_key;
  END IF;
END $$;

-- 2. Drop any legacy non-partial index on manufacturer_barcode
DROP INDEX IF EXISTS public.products_manufacturer_barcode_key;
DROP INDEX IF EXISTS public.products_manufacturer_barcode_idx;
DROP INDEX IF EXISTS public.products_manufacturer_barcode_active_idx;

-- 3. Create partial unique index on active products only
CREATE UNIQUE INDEX products_manufacturer_barcode_active_idx
ON public.products (manufacturer_barcode)
WHERE deleted_at IS NULL
  AND manufacturer_barcode IS NOT NULL
  AND trim(manufacturer_barcode) <> '';

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';