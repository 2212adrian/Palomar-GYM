-- Migration: Add Only Necessary Open Food Facts Columns
-- Path: src/lib/supabase/migrations/ready/20260711180000_add_manufacturer_source_check_and_index.sql

-- 1. Safely add the 2 necessary columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_barcode VARCHAR(32) UNIQUE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_source VARCHAR(15) DEFAULT 'manual';

-- 2. Enforce constraint to ensure only 'manual' or 'openfoodfacts' can be inserted
ALTER TABLE public.products 
DROP CONSTRAINT IF EXISTS chk_manufacturer_source;

ALTER TABLE public.products 
ADD CONSTRAINT chk_manufacturer_source 
CHECK (manufacturer_source IN ('manual', 'openfoodfacts'));

-- 3. Create index on source to optimize filtering queries
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_source 
ON public.products (manufacturer_source);