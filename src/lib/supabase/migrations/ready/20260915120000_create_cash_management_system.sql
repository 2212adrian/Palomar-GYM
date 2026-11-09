-- ==============================================================================
-- MIGRATION: 20260915120000_create_cash_management_system.sql
-- DESCRIPTION: Live Cash Drawer Management, Reconciliation, Approvals & Void System.
-- NOTE: Sessions NEVER auto-close based on time. A session stays active 
--       indefinitely until manually reconciled and closed by an administrator.
-- ==============================================================================

BEGIN;

-- 1. Helper function to generate standardized Cash Session Number (e.g. CS-20260915-001)
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
  opening_float NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (opening_float >= 0),
  closing_actual_cash NUMERIC(12, 2) DEFAULT NULL,
  closing_expected_cash NUMERIC(12, 2) DEFAULT NULL,
  discrepancy NUMERIC(12, 2) DEFAULT NULL,
  discrepancy_reason TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  denominations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Pre-index Hygiene: If legacy data has multiple open sessions, keep only the latest one open
DO $$
DECLARE
  active_open_id UUID;
BEGIN
  SELECT id INTO active_open_id
  FROM public.cash_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF active_open_id IS NOT NULL THEN
    UPDATE public.cash_sessions
    SET status = 'closed',
        closed_at = timezone('utc', now()),
        closed_by_name = 'Admin (Closed Prior Open Session)'
    WHERE status = 'open' AND id <> active_open_id;
  END IF;
END $$;

-- 4. Strictly enforce that ONLY ONE physical register session can be open at a time
CREATE UNIQUE INDEX IF NOT EXISTS one_open_cash_session_idx 
  ON public.cash_sessions ((status)) 
  WHERE status = 'open';

-- 5. Create Cash Transactions (Movements) Table
CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cash_in', 'cash_out', 'digital_in')),
  category TEXT DEFAULT 'General',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  reference_number TEXT DEFAULT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT NOT NULL DEFAULT 'Staff',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name TEXT DEFAULT NULL,
  approved_at TIMESTAMPTZ DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  is_voided BOOLEAN NOT NULL DEFAULT false,
  voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_by_name TEXT DEFAULT NULL,
  voided_at TIMESTAMPTZ DEFAULT NULL,
  void_reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Ensure backwards-compatibility columns exist if table already exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'cash_transactions'
  ) THEN
    ALTER TABLE public.cash_transactions
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
      ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS approved_by_name TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS is_voided BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS voided_by_name TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS void_reason TEXT DEFAULT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'cash_transactions_status_check'
    ) THEN
      ALTER TABLE public.cash_transactions
        ADD CONSTRAINT cash_transactions_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'cash_transactions' 
        AND column_name = 'category'
    ) THEN
      ALTER TABLE public.cash_transactions ALTER COLUMN category DROP NOT NULL;
      ALTER TABLE public.cash_transactions ALTER COLUMN category SET DEFAULT 'General';
    END IF;
  END IF;
END $$;

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON public.cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON public.cash_sessions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_closed_at ON public.cash_sessions(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_session_id ON public.cash_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_created_at ON public.cash_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_status ON public.cash_transactions(status) WHERE is_voided = false;
CREATE INDEX IF NOT EXISTS idx_cash_transactions_session_status ON public.cash_transactions(session_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_voided ON public.cash_transactions(is_voided);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- 8. Admin Verification Helper Function
CREATE OR REPLACE FUNCTION public.is_cash_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('wolfpalomargym@gmail.com', 'wolf.palomar@gmail.com')
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'superadmin')
        AND (status IS NULL OR status::text = 'active')
    )
  );
$$;

-- 9. Atomic Safe RPC Functions
CREATE OR REPLACE FUNCTION public.open_cash_session_safe(
  p_opening_float NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_opened_by UUID DEFAULT NULL,
  p_opened_by_name TEXT DEFAULT 'Admin'
)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.cash_sessions;
  v_session_num TEXT;
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_cash_admin();

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can open cash sessions.';
  END IF;

  -- Close any existing open session first to prevent collision
  UPDATE public.cash_sessions
  SET status = 'closed',
      closed_at = timezone('utc', now()),
      closed_by = COALESCE(p_opened_by, v_caller_id),
      closed_by_name = COALESCE(p_opened_by_name, 'Admin')
  WHERE status = 'open';

  v_session_num := public.generate_cash_session_number();

  INSERT INTO public.cash_sessions (
    session_number,
    opened_at,
    opened_by,
    opened_by_name,
    status,
    opening_float,
    notes
  ) VALUES (
    v_session_num,
    timezone('utc', now()),
    COALESCE(p_opened_by, v_caller_id),
    COALESCE(p_opened_by_name, 'Admin'),
    'open',
    p_opening_float,
    p_notes
  )
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session_safe(
  p_session_id UUID,
  p_actual_cash NUMERIC,
  p_expected_cash NUMERIC,
  p_discrepancy NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_denominations JSONB DEFAULT '{}'::jsonb,
  p_closed_by UUID DEFAULT NULL,
  p_closed_by_name TEXT DEFAULT 'Admin'
)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.cash_sessions;
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_cash_admin();

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can close cash sessions.';
  END IF;

  UPDATE public.cash_sessions
  SET status = 'closed',
      closed_at = timezone('utc', now()),
      closed_by = COALESCE(p_closed_by, v_caller_id),
      closed_by_name = COALESCE(p_closed_by_name, 'Admin'),
      closing_actual_cash = p_actual_cash,
      closing_expected_cash = p_expected_cash,
      discrepancy = p_discrepancy,
      notes = p_notes,
      denominations = p_denominations,
      updated_at = timezone('utc', now())
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash session with ID % not found.', p_session_id;
  END IF;

  RETURN v_session;
END;
$$;

-- 10. Approval & Void RPC Functions
CREATE OR REPLACE FUNCTION public.approve_cash_transaction(
  p_transaction_id UUID,
  p_admin_id UUID DEFAULT NULL,
  p_admin_name TEXT DEFAULT 'Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tx RECORD;
  v_admin_id UUID;
BEGIN
  v_admin_id := COALESCE(p_admin_id, auth.uid());

  SELECT * INTO v_tx
  FROM public.cash_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id;
  END IF;

  IF v_tx.is_voided THEN
    RAISE EXCEPTION 'Cannot approve a transaction that has been voided.';
  END IF;

  IF v_tx.status <> 'pending' THEN
    RAISE EXCEPTION 'Transaction is not in pending status (current status: %).', v_tx.status;
  END IF;

  UPDATE public.cash_transactions
  SET
    status = 'approved',
    approved_by = v_admin_id,
    approved_by_name = COALESCE(p_admin_name, 'Admin'),
    approved_at = timezone('utc', now())
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_transaction_id,
    'status', 'approved',
    'approved_by_name', COALESCE(p_admin_name, 'Admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_cash_transaction(
  p_transaction_id UUID,
  p_admin_id UUID DEFAULT NULL,
  p_admin_name TEXT DEFAULT 'Admin',
  p_reason TEXT DEFAULT 'Declined by Administrator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tx RECORD;
  v_admin_id UUID;
BEGIN
  v_admin_id := COALESCE(p_admin_id, auth.uid());

  SELECT * INTO v_tx
  FROM public.cash_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id;
  END IF;

  IF v_tx.status <> 'pending' THEN
    RAISE EXCEPTION 'Transaction is not in pending status (current status: %).', v_tx.status;
  END IF;

  UPDATE public.cash_transactions
  SET
    status = 'rejected',
    approved_by = v_admin_id,
    approved_by_name = COALESCE(p_admin_name, 'Admin'),
    approved_at = timezone('utc', now()),
    rejection_reason = TRIM(COALESCE(p_reason, 'Declined by Administrator'))
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_transaction_id,
    'status', 'rejected',
    'reason', TRIM(COALESCE(p_reason, 'Declined by Administrator'))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.void_cash_transaction(
  p_transaction_id UUID,
  p_admin_id UUID DEFAULT NULL,
  p_admin_name TEXT DEFAULT 'Admin',
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tx RECORD;
  v_admin_id UUID;
BEGIN
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A specific reason of at least 5 characters is required to void a cash transaction.';
  END IF;

  v_admin_id := COALESCE(p_admin_id, auth.uid());

  SELECT * INTO v_tx
  FROM public.cash_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id;
  END IF;

  IF v_tx.is_voided THEN
    RAISE EXCEPTION 'This transaction has already been voided.';
  END IF;

  UPDATE public.cash_transactions
  SET
    is_voided = true,
    voided_by = v_admin_id,
    voided_by_name = COALESCE(p_admin_name, 'Admin'),
    voided_at = timezone('utc', now()),
    void_reason = TRIM(p_reason)
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_transaction_id,
    'is_voided', true,
    'void_reason', TRIM(p_reason),
    'voided_by_name', COALESCE(p_admin_name, 'Admin')
  );
END;
$$;

-- 11. Drop ALL existing policies for idempotent execution
DROP POLICY IF EXISTS "Anyone authenticated can view cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Admins can open cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Admins can update and close cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Admins can delete cash sessions" ON public.cash_sessions;

DROP POLICY IF EXISTS "Anyone authenticated can view cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert cash transactions into open session" ON public.cash_transactions;
DROP POLICY IF EXISTS "Anyone authenticated can insert cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Admins can manage cash transactions" ON public.cash_transactions;

-- 12. RLS Policies for cash_sessions
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

-- 13. RLS Policies for cash_transactions
CREATE POLICY "Anyone authenticated can view cash transactions"
  ON public.cash_transactions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone authenticated can insert cash transactions"
  ON public.cash_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can manage cash transactions"
  ON public.cash_transactions
  FOR ALL
  TO authenticated
  USING (public.is_cash_admin())
  WITH CHECK (public.is_cash_admin());

-- 14. Role Grants & RPC Function Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transactions TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_cash_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_cash_session_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_session_safe(NUMERIC, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session_safe(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_cash_transaction(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_cash_transaction(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_cash_transaction(UUID, UUID, TEXT, TEXT) TO authenticated;

-- 15. Register all relevant revenue tables in Supabase Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cash_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cash_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sales'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
  END IF;
END $$;

COMMIT;