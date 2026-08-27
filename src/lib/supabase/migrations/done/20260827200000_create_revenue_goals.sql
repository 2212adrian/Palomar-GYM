-- ==============================================================================
-- MIGRATION: 20260827200000_create_revenue_goals.sql
-- DESCRIPTION: Create revenue_goals table, RLS security, and Realtime replication
-- ACCESS: Exclusive to Admin and Superadmin (wolf.palomar@gmail.com)
-- ==============================================================================

-- 1. Create Revenue Goals Table
CREATE TABLE IF NOT EXISTS public.revenue_goals (
  id TEXT PRIMARY KEY DEFAULT 'default_goals',
  daily NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
  weekly NUMERIC(12, 2) NOT NULL DEFAULT 35000.00,
  monthly NUMERIC(12, 2) NOT NULL DEFAULT 150000.00,
  yearly NUMERIC(12, 2) NOT NULL DEFAULT 1800000.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Seed Default Singleton Record (Idempotent)
INSERT INTO public.revenue_goals (id, daily, weekly, monthly, yearly)
VALUES ('default_goals', 5000.00, 35000.00, 150000.00, 1800000.00)
ON CONFLICT (id) DO NOTHING;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.revenue_goals ENABLE ROW LEVEL SECURITY;

-- 4. Create/Replace Admin & Superadmin Security Function
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    -- 1. Hardcoded Superadmin Email Check
    LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
    OR
    -- 2. Check profiles table with explicit enum to text casting
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'superadmin')
        AND (status IS NULL OR status::text = 'active')
    )
  );
$$;

-- 5. Drop Any Existing Policies on revenue_goals
DROP POLICY IF EXISTS "Admins can view revenue goals" ON public.revenue_goals;
DROP POLICY IF EXISTS "Admins can update revenue goals" ON public.revenue_goals;
DROP POLICY IF EXISTS "Admins can insert revenue goals" ON public.revenue_goals;
DROP POLICY IF EXISTS "Admins can delete revenue goals" ON public.revenue_goals;
DROP POLICY IF EXISTS "Admins can manage revenue goals" ON public.revenue_goals;

-- 6. Create RLS Policy (Full Access for Admins & Superadmin, Blocks Staff)
CREATE POLICY "Admins can manage revenue goals"
  ON public.revenue_goals
  FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_superadmin()
  )
  WITH CHECK (
    public.is_admin_or_superadmin()
  );

-- 7. Grant Table Permissions
GRANT SELECT, INSERT, UPDATE ON public.revenue_goals TO authenticated;

-- 8. Enable Supabase Realtime Replication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'revenue_goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.revenue_goals;
  END IF;
END $$;