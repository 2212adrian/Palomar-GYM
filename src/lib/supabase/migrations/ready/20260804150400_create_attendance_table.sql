BEGIN;

-- 1. Create Table safely IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.attendance (
    id VARCHAR(30) PRIMARY KEY DEFAULT public.generate_checkin_id(),
    member_id VARCHAR(20) DEFAULT NULL REFERENCES public.members(member_id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_type public.customer_type_enum NOT NULL DEFAULT 'Walk-In'::public.customer_type_enum,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    plan_name TEXT DEFAULT 'Regular Pass',
    entry_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    base_price DECIMAL(10,2) DEFAULT 0.00,
    gcash_fee DECIMAL(10,2) DEFAULT 0.00,
    card_fee DECIMAL(10,2) DEFAULT 0.00,
    gcash_ref_no VARCHAR(50) DEFAULT NULL,
    payment_method public.payment_method_enum NOT NULL DEFAULT 'Cash'::public.payment_method_enum,
    receipt_number VARCHAR(30) DEFAULT NULL,
    staff_name TEXT NOT NULL DEFAULT 'Counter Staff',

    -- Soft Delete Metadata (Used exclusively for standard attendance check-ins)
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure Soft Delete Metadata columns exist
ALTER TABLE public.attendance 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- 2. Soft Delete Interceptor Function
-- Standard check-in logs are soft-deleted.
-- Voided Subscriptions / New Memberships bypass soft-delete and are PERMANENTLY REMOVED from the DB.
CREATE OR REPLACE FUNCTION public.handle_attendance_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- If already soft-deleted, allow physical DELETE statement (used by nightly purge job)
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    -- HARD DELETE BYPASS: New Memberships & Subscription transactions bypass soft-delete.
    -- They are physically purged from the database and NEVER enter the Recycle Bin.
    IF OLD.customer_type::text = 'New Membership' 
       OR OLD.plan_name ILIKE '%Membership%' 
       OR OLD.plan_name ILIKE '%Subscription%' 
       OR OLD.plan_name ILIKE '%Monthly%' 
       OR OLD.plan_name ILIKE '%Yearly%' THEN
        RETURN OLD; -- Proceed with physical hard row removal
    END IF;

    -- Intercept physical DELETE ONLY for standard walk-in / member daily attendance check-ins
    UPDATE public.attendance
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;

    RETURN NULL; -- Cancel physical row deletion for standard attendance
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger safely
DROP TRIGGER IF EXISTS tr_attendance_soft_delete ON public.attendance;
CREATE TRIGGER tr_attendance_soft_delete
    BEFORE DELETE ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_attendance_soft_delete();

-- 3. Purge Function for soft-deleted items (ONLY purges standard check-in items where deleted_at IS NOT NULL)
CREATE OR REPLACE FUNCTION public.purge_soft_deleted_attendance()
RETURNS void AS $$
BEGIN
    DELETE FROM public.attendance 
    WHERE deleted_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Integrated pg_cron Schedule for Logbook Attendance Purging
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    PERFORM cron.unschedule('daily-purge-soft-deleted-attendance');
EXCEPTION WHEN OTHERS THEN
END $$;

-- Schedule daily purge at 12:00 AM Manila Time (16:00 UTC)
SELECT cron.schedule(
    'daily-purge-soft-deleted-attendance',
    '0 16 * * *', 
    'SELECT public.purge_soft_deleted_attendance();'
);

-- 5. Row Level Security (RLS) Configuration
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated users to insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated users to update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authorized users to delete attendance" ON public.attendance;

CREATE POLICY "Allow authenticated users to view attendance" ON public.attendance
    FOR SELECT TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            deleted_at IS NULL 
            AND (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
        OR (deleted_at IS NOT NULL)
    );

CREATE POLICY "Allow authenticated users to insert attendance" ON public.attendance
    FOR INSERT TO authenticated WITH CHECK (deleted_at IS NULL);

CREATE POLICY "Allow authenticated users to update attendance" ON public.attendance
    FOR UPDATE TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    )
    WITH CHECK (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );

CREATE POLICY "Allow authorized users to delete attendance" ON public.attendance
    FOR DELETE TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );

-- Enable Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attendance') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
        END IF;
    END IF;
END $$;

COMMIT;