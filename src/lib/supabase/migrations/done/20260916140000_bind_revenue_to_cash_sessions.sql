-- Migration: Bind sales, attendance, and receipts to cash_sessions
-- Ensures all revenue, check-in, and register transactions are linked to the currently open cash session.
-- 20260916140000_bind_revenue_to_cash_sessions.sql
BEGIN;

-- 1. Add cash_session_id column to sales, attendance, and receipts if not present
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
-- Verifies whether any incoming cash_session_id is valid and active.
-- If missing or pointing to a closed session, automatically assigns the active open session.
CREATE OR REPLACE FUNCTION public.f_assign_active_cash_session()
RETURNS TRIGGER AS $$
DECLARE
    v_open_session_id UUID;
    v_session_status TEXT;
BEGIN
    -- If a cash_session_id was provided, verify if that session is currently open
    IF NEW.cash_session_id IS NOT NULL THEN
        SELECT status INTO v_session_status
        FROM public.cash_sessions
        WHERE id = NEW.cash_session_id;

        -- If the session is closed or invalid, clear it so it binds to the active open session
        IF v_session_status IS NULL OR v_session_status <> 'open' THEN
            NEW.cash_session_id := NULL;
        END IF;
    END IF;

    -- If cash_session_id is NULL, assign the currently active open session
    IF NEW.cash_session_id IS NULL THEN
        SELECT id INTO v_open_session_id
        FROM public.cash_sessions
        WHERE status = 'open'
        ORDER BY opened_at DESC
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

-- 4. Re-bind transactions created after active session opening to the current open session
UPDATE public.sales s
SET cash_session_id = cs.id
FROM public.cash_sessions cs
WHERE cs.status = 'open'
  AND (s.cash_session_id IS NULL OR s.cash_session_id <> cs.id)
  AND s.created_at >= cs.opened_at
  AND s.deleted_at IS NULL;

UPDATE public.attendance a
SET cash_session_id = cs.id
FROM public.cash_sessions cs
WHERE cs.status = 'open'
  AND (a.cash_session_id IS NULL OR a.cash_session_id <> cs.id)
  AND a.check_in_time >= cs.opened_at
  AND a.deleted_at IS NULL;

UPDATE public.receipts r
SET cash_session_id = cs.id
FROM public.cash_sessions cs
WHERE cs.status = 'open'
  AND (r.cash_session_id IS NULL OR r.cash_session_id <> cs.id)
  AND r.created_at >= cs.opened_at;

-- 5. Backfill historical rows without a cash_session_id based on session time windows
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

-- 6. UPDATE RLS ON SALES
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

-- 7. UPDATE RLS ON ATTENDANCE
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