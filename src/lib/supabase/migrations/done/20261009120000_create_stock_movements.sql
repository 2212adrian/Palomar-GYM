-- Migration: Create Stock Movements (Restock & Inventory Adjustment Ledger) Table
-- Timestamp: 20261009120000

-- 1. Create the stock_movements table
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    movement_type TEXT NOT NULL DEFAULT 'RESTOCK',
    quantity_added INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    note TEXT DEFAULT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    created_by_name TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Performance indexes for fast querying & sorting
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Allow authenticated users to view stock movements" ON public.stock_movements;
CREATE POLICY "Allow authenticated users to view stock movements"
ON public.stock_movements
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert stock movements" ON public.stock_movements;
CREATE POLICY "Allow authenticated users to insert stock movements"
ON public.stock_movements
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 5. Enable Realtime broadcasting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'stock_movements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
