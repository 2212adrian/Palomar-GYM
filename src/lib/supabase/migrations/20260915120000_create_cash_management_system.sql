-- ==============================================================================
-- MIGRATION: 20260915120000_create_cash_management_system.sql
-- DESCRIPTION: Live Cash Management, Physical Drawer Sessions, Cash In/Out,
--              Digital Collections, and Denomination Reconciliation.
-- ==============================================================================

BEGIN;

-- 1. Helper function to generate formatted Cash Session Number
CREATE OR REPLACE FUNCTION public.generate_cash_session_number()
RETURNS TEXT AS $$
DECLARE
  today_prefix TEXT;
  session_seq INT;
  new_num TEXT;
BEGIN
  today_prefix := 'CS-' || to_char(timezone('Asia/Manila', now()), 'YYYYMMDD') || '-';
  
  SELECT COUNT(*) + 1 INTO session_seq
  FROM public.cash_sessions
  WHERE session_number LIKE today_prefix || '%';

  new_num := today_prefix || lpad(session_seq::TEXT, 3, '0');
  RETURN new_num;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 2. Create Cash Sessions Table
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number TEXT NOT NULL DEFAULT public.generate_cash_session_number(),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  closed_at TIMESTAMPTZ DEFAULT NULL,
  opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_by_name TEXT NOT NULL DEFAULT 'Admin',
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by_name TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_float NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  closing_actual_cash NUMERIC(12, 2) DEFAULT NULL,
  closing_expected_cash NUMERIC(12, 2) DEFAULT NULL,
  discrepancy NUMERIC(12, 2) DEFAULT NULL,
  discrepancy_reason TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  denominations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Ensure Only One Session Can Be 'open' Simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS one_open_cash_session_idx 
  ON public.cash_sessions ((status)) 
  WHERE status = 'open';

-- 4. Create Cash Transactions (Movements) Table
CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cash_in', 'cash_out', 'digital_in')),
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  reference_number TEXT DEFAULT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT NOT NULL DEFAULT 'Staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cash_transactions_session_id ON public.cash_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON public.cash_sessions(opened_at DESC);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- Helper to verify admin/superadmin caller
CREATE OR REPLACE FUNCTION public.is_cash_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'superadmin')
        AND (status IS NULL OR status::text = 'active')
    )
  );
$$;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone authenticated can view cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Admins can open cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Admins can update and close cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Admins can delete cash sessions" ON public.cash_sessions;

DROP POLICY IF EXISTS "Anyone authenticated can view cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Authenticated staff and admins can insert cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Admins can manage cash transactions" ON public.cash_transactions;

-- RLS Policies for cash_sessions
CREATE POLICY "Anyone authenticated can view cash sessions"
  ON public.cash_sessions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can open cash sessions"
  ON public.cash_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cash_admin());

CREATE POLICY "Admins can update and close cash sessions"
  ON public.cash_sessions
  FOR UPDATE
  TO authenticated
  USING (public.is_cash_admin())
  WITH CHECK (public.is_cash_admin());

CREATE POLICY "Admins can delete cash sessions"
  ON public.cash_sessions
  FOR DELETE
  TO authenticated
  USING (public.is_cash_admin());

-- RLS Policies for cash_transactions
CREATE POLICY "Anyone authenticated can view cash transactions"
  ON public.cash_transactions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated staff and admins can insert cash transactions"
  ON public.cash_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Transaction must be linked to an active OPEN session
    EXISTS (
      SELECT 1 FROM public.cash_sessions
      WHERE id = session_id AND status = 'open'
    )
  );

CREATE POLICY "Admins can manage cash transactions"
  ON public.cash_transactions
  FOR ALL
  TO authenticated
  USING (public.is_cash_admin());

-- 6. Grant Permissions
GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;
GRANT SELECT, INSERT ON public.cash_transactions TO authenticated;

-- 7. Enable Supabase Realtime Replication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'cash_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'cash_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_transactions;
  END IF;
END $$;

COMMIT;
