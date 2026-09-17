-- Migration: Bind sales, attendance, and receipts to cash_sessions
-- Replaces 12:00 AM Manila Time locks with POS Cash Session lifecycle locks.

BEGIN;

-- 1. Add cash_session_id column to sales, attendance, and receipts
ALTER TABLE public.sales 
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.attendance 
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.receipts 
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

-- 2. Indexes for high-speed lookups
CREATE INDEX IF NOT EXISTS idx_sales_cash_session_id ON public.sales(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_cash_session_id ON public.attendance(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_receipts_cash_session_id ON public.receipts(cash_session_id);

-- 3. Automatic Session Stamping Trigger
-- Guarantees that any sale/check-in/receipt automatically receives the currently open session ID.
CREATE OR REPLACE FUNCTION public.f_assign_active_cash_session()
RETURNS TRIGGER AS $$
DECLARE
    v_open_session_id UUID;
BEGIN
    IF NEW.cash_session_id IS NULL THEN
        SELECT id INTO v_open_session_id
        FROM public.cash_sessions
        WHERE status = 'open'
        LIMIT 1;

        NEW.cash_session_id := v_open_session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_assign_session_sales ON public.sales;
CREATE TRIGGER tr_assign_session_sales
    BEFORE INSERT ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.f_assign_active_cash_session();

DROP TRIGGER IF EXISTS tr_assign_session_attendance ON public.attendance;
CREATE TRIGGER tr_assign_session_attendance
    BEFORE INSERT ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.f_assign_active_cash_session();

DROP TRIGGER IF EXISTS tr_assign_session_receipts ON public.receipts;
CREATE TRIGGER tr_assign_session_receipts
    BEFORE INSERT ON public.receipts
    FOR EACH ROW
    EXECUTE FUNCTION public.f_assign_active_cash_session();

-- 4. Backfill existing rows without a cash_session_id based on session time windows
UPDATE public.sales s
SET cash_session_id = cs.id
FROM public.cash_sessions cs
WHERE s.cash_session_id IS NULL
  AND s.created_at >= cs.opened_at
  AND (cs.closed_at IS NULL OR s.created_at <= cs.closed_at);

UPDATE public.attendance a
SET cash_session_id = cs.id
FROM public.cash_sessions cs
WHERE a.cash_session_id IS NULL
  AND a.check_in_time >= cs.opened_at
  AND (cs.closed_at IS NULL OR a.check_in_time <= cs.closed_at);

UPDATE public.receipts r
SET cash_session_id = cs.id
FROM public.cash_sessions cs
WHERE r.cash_session_id IS NULL
  AND r.created_at >= cs.opened_at
  AND (cs.closed_at IS NULL OR r.created_at <= cs.closed_at);

-- 5. UPDATE RLS ON SALES
-- Staff can only delete a sale if it belongs to an OPEN cash session!
DROP POLICY IF EXISTS "Allow authorized users to delete sales" ON public.sales;
CREATE POLICY "Allow authorized users to delete sales" ON public.sales
    FOR DELETE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            cash_session_id IS NOT NULL 
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs 
                WHERE cs.id = sales.cash_session_id AND cs.status = 'open'
            )
        )
    );

-- 6. UPDATE RLS ON ATTENDANCE
-- Staff can only delete attendance check-ins if they belong to an OPEN cash session!
DROP POLICY IF EXISTS "Allow authorized users to delete attendance" ON public.attendance;
CREATE POLICY "Allow authorized users to delete attendance" ON public.attendance
    FOR DELETE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            cash_session_id IS NOT NULL 
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs 
                WHERE cs.id = attendance.cash_session_id AND cs.status = 'open'
            )
        )
    );

-- Staff can only update attendance (e.g. collect/undo payment) if the session is OPEN!
DROP POLICY IF EXISTS "Allow authenticated users to update attendance" ON public.attendance;
CREATE POLICY "Allow authenticated users to update attendance" ON public.attendance
    FOR UPDATE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            cash_session_id IS NOT NULL 
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs 
                WHERE cs.id = attendance.cash_session_id AND cs.status = 'open'
            )
        )
    )
    WITH CHECK (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            cash_session_id IS NOT NULL 
            AND EXISTS (
                SELECT 1 FROM public.cash_sessions cs 
                WHERE cs.id = attendance.cash_session_id AND cs.status = 'open'
            )
        )
    );

COMMIT;