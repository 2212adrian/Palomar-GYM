-- Migration: Create/Update Online Registrations Table, Auto-Audit & Purge Triggers
-- File: 20260804150500_create_online_registrations_table.sql

BEGIN;

-- 1. CREATE TABLE IF IT DOES NOT EXIST YET
CREATE TABLE IF NOT EXISTS public.online_registrations (
    id VARCHAR(30) PRIMARY KEY, -- e.g. REG-ABC12345
    full_name TEXT NOT NULL,
    email TEXT DEFAULT NULL,
    phone VARCHAR(20) NOT NULL,
    gender VARCHAR(20) NOT NULL DEFAULT 'Male',
    birthday DATE NOT NULL,
    address TEXT DEFAULT NULL,
    emergency_contact_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    emergency_contact_phone VARCHAR(20) NOT NULL,
    preferred_plan public.subscription_type_enum NOT NULL DEFAULT 'monthly'::public.subscription_type_enum,
    status public.online_reg_status_enum NOT NULL DEFAULT 'Pending'::public.online_reg_status_enum,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT DEFAULT NULL,

    -- Minor Fields & Signatures
    parent_consent_required BOOLEAN DEFAULT FALSE,
    parent_name TEXT DEFAULT NULL,
    parent_relationship TEXT DEFAULT NULL,
    parent_phone VARCHAR(20) DEFAULT NULL,
    parent_email TEXT DEFAULT NULL,
    applicant_signature TEXT DEFAULT NULL,
    parent_signature TEXT DEFAULT NULL,
    consent_date TIMESTAMPTZ DEFAULT NULL,
    guardian_consent BOOLEAN DEFAULT NULL,

    -- Archive & Soft-Delete Fields
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by TEXT DEFAULT NULL,
    delete_reason TEXT DEFAULT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ALTER TABLE TO ENSURE NEW COLUMNS ARE ADDED IF TABLE PREVIOUSLY EXISTED
ALTER TABLE public.online_registrations
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT DEFAULT NULL;

-- 3. CREATE INDEX FOR FILTERING ACTIVE VS ARCHIVED REGISTRATIONS
CREATE INDEX IF NOT EXISTS idx_online_reg_archived_status 
    ON public.online_registrations (is_archived, status, submitted_at);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.online_registrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'online_registrations' 
          AND policyname = 'Allow anonymous users to submit online registrations'
    ) THEN
        CREATE POLICY "Allow anonymous users to submit online registrations" ON public.online_registrations
            FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'online_registrations' 
          AND policyname = 'Allow authenticated staff to view & process registrations'
    ) THEN
        CREATE POLICY "Allow authenticated staff to view & process registrations" ON public.online_registrations
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. SPAM PROTECTION TRIGGER: RESTRICT TO MAX 3 PENDING NON-ARCHIVED REGISTRATIONS PER PHONE
CREATE OR REPLACE FUNCTION public.check_max_pending_registrations()
RETURNS TRIGGER AS $$
DECLARE
    pending_count INT;
BEGIN
    SELECT COUNT(*) INTO pending_count
    FROM public.online_registrations
    WHERE phone = NEW.phone
      AND status = 'Pending'
      AND is_archived = FALSE
      AND deleted_at IS NULL;

    IF pending_count >= 3 THEN
        RAISE EXCEPTION 'Maximum limit of 3 pending registrations reached for phone number %', NEW.phone;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_limit_pending_registrations ON public.online_registrations;

CREATE TRIGGER trigger_limit_pending_registrations
    BEFORE INSERT ON public.online_registrations
    FOR EACH ROW
    EXECUTE FUNCTION public.check_max_pending_registrations();

-- 6. AUTOMATIC AUDIT LOGGING & ROW CLEANUP UPON APPROVAL OR REJECTION
CREATE OR REPLACE FUNCTION public.handle_online_registration_status_change()
RETURNS TRIGGER AS $$
DECLARE
    audit_action TEXT;
    audit_details TEXT;
    operator_name TEXT;
BEGIN
    IF NEW.status IN ('Approved', 'Rejected') AND OLD.status = 'Pending' THEN
        operator_name := COALESCE(NEW.deleted_by, 'Admin Staff');
        
        IF NEW.status = 'Approved' THEN
            audit_action := 'ONLINE_REGISTRATION_APPROVED';
            audit_details := FORMAT('Approved online pre-registration ticket %s for %s (%s). Membership account activated.', NEW.id, NEW.full_name, NEW.phone);
        ELSE
            audit_action := 'ONLINE_REGISTRATION_REJECTED';
            audit_details := FORMAT('Rejected online pre-registration ticket %s for %s (%s). Reason: %s', NEW.id, NEW.full_name, NEW.phone, COALESCE(NEW.delete_reason, 'Rejected by staff'));
        END IF;

        -- Record audit log entry
        PERFORM public.log_audit_entry(
            NULL,
            operator_name,
            audit_action,
            NEW.id,
            audit_details
        );

        -- Automatically delete the row from online_registrations to prevent row bloat
        DELETE FROM public.online_registrations WHERE id = NEW.id;
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_process_online_registration ON public.online_registrations;

CREATE TRIGGER trigger_process_online_registration
    AFTER UPDATE ON public.online_registrations
    FOR EACH ROW
    WHEN (OLD.status = 'Pending' AND NEW.status IN ('Approved', 'Rejected'))
    EXECUTE FUNCTION public.handle_online_registration_status_change();

-- 7. DAILY PURGE FUNCTION WITH AUDIT LOGGING
CREATE OR REPLACE FUNCTION public.purge_expired_online_registrations()
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    WITH purged AS (
        DELETE FROM public.online_registrations
        WHERE status = 'Pending'
          AND is_archived = FALSE
          AND deleted_at IS NULL
          AND submitted_at < ((now() AT TIME ZONE 'Asia/Manila')::date AT TIME ZONE 'Asia/Manila')
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM purged;

    IF deleted_count > 0 THEN
        PERFORM public.log_audit_entry(
            NULL,
            'System Automated Cron',
            'ONLINE_REGISTRATION_PURGED',
            NULL,
            FORMAT('Automated midnight purge removed %s expired unarchived online registration ticket(s).', deleted_count)
        );
    END IF;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. ENABLE PG_CRON EXTENSION & SCHEDULE DAILY PURGE AT 12:00 AM MANILA TIME (16:00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'cron' AND tablename = 'job') THEN
        PERFORM cron.unschedule(jobid) 
        FROM cron.job 
        WHERE jobname = 'daily-purge-expired-online-registrations';
    END IF;
END $$;

SELECT cron.schedule(
    'daily-purge-expired-online-registrations',
    '0 16 * * *', 
    'SELECT public.purge_expired_online_registrations();'
);

-- 9. REALTIME CONFIGURATION
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'online_registrations') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.online_registrations;
        END IF;
    END IF;
END $$;

COMMIT;