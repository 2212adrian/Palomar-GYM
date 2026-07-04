-- Migration: Create System Rates and Payments Configuration Table
-- Description: Enforces single-row design to manage global config parameters in Supabase
-- Timestamp: 20260704150000

CREATE TABLE IF NOT EXISTS public.rates_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Enforces single-row design
    monthly_rate NUMERIC(10, 2) NOT NULL DEFAULT 800.00,
    yearly_rate NUMERIC(10, 2) NOT NULL DEFAULT 8000.00,
    regular_walk_in NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
    student_walk_in NUMERIC(10, 2) NOT NULL DEFAULT 80.00,
    yearly_walk_in NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    gcash_fee NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    new_card_fee NUMERIC(10, 2) NOT NULL DEFAULT 150.00,
    vat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    vat_percentage NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.rates_config ENABLE ROW LEVEL SECURITY;

-- PREVENT 42710 ERROR: Drop existing policies before creating them
DROP POLICY IF EXISTS "Allow authenticated users to read rates" ON public.rates_config;
DROP POLICY IF EXISTS "Allow admins to update rates" ON public.rates_config;

-- Policy: Any authenticated user (staff/admin) can read the configuration
CREATE POLICY "Allow authenticated users to read rates" 
ON public.rates_config 
FOR SELECT 
TO authenticated
USING (true);

-- Policy: Only administrators can update the configuration
CREATE POLICY "Allow admins to update rates" 
ON public.rates_config 
FOR UPDATE 
TO authenticated
USING (
  (auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  (auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
);

-- Seed the single default row
INSERT INTO public.rates_config (id, monthly_rate, yearly_rate, regular_walk_in, student_walk_in, yearly_walk_in, gcash_fee, new_card_fee, vat_enabled, vat_percentage)
VALUES (1, 800.00, 8000.00, 100.00, 80.00, 50.00, 10.00, 150.00, TRUE, 12.00)
ON CONFLICT (id) DO NOTHING;