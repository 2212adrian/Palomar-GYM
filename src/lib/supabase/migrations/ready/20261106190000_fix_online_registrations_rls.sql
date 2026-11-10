BEGIN;

-- 1. Ensure schema usage and restrict table privileges for anon role
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE SELECT ON TABLE public.online_registrations FROM anon;
GRANT INSERT ON TABLE public.online_registrations TO anon;
GRANT ALL ON TABLE public.online_registrations TO authenticated;

-- 2. Enable Row Level Security
ALTER TABLE public.online_registrations ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing permissive policies
DROP POLICY IF EXISTS "Allow anonymous users to submit online registrations" ON public.online_registrations;
DROP POLICY IF EXISTS "Allow public to read active pending registrations" ON public.online_registrations;
DROP POLICY IF EXISTS "Allow authenticated staff to view & process registrations" ON public.online_registrations;

-- 4. Tightened INSERT policy for anonymous & authenticated submissions
CREATE POLICY "Allow anonymous users to submit online registrations" ON public.online_registrations
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        status = 'Pending'::public.online_reg_status_enum
        AND is_archived = FALSE
        AND deleted_at IS NULL
        AND deleted_by IS NULL
        AND delete_reason IS NULL
        AND length(trim(full_name)) BETWEEN 2 AND 150
        AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 7 AND 15
        AND (email IS NULL OR length(email) <= 120)
        AND (address IS NULL OR length(address) <= 300)
        AND (emergency_contact_name IS NULL OR length(emergency_contact_name) <= 150)
        AND (emergency_contact_phone IS NULL OR length(emergency_contact_phone) <= 25)
        AND (applicant_signature IS NULL OR length(applicant_signature) <= 200000)
        AND (parent_signature IS NULL OR length(parent_signature) <= 200000)
    );

-- 5. Staff full access policy
CREATE POLICY "Allow authenticated staff to view & process registrations" ON public.online_registrations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Secure RPC to check ticket validity without exposing PII to anonymous users
CREATE OR REPLACE FUNCTION public.check_online_registration_tickets(p_ticket_ids text[])
RETURNS TABLE (
    id varchar(30),
    status public.online_reg_status_enum,
    is_archived boolean,
    deleted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_ticket_ids IS NULL OR cardinality(p_ticket_ids) = 0 THEN
        RETURN;
    END IF;

    IF cardinality(p_ticket_ids) > 10 THEN
        RAISE EXCEPTION 'Too many ticket IDs requested. Maximum allowed is 10.';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.status,
        r.is_archived,
        r.deleted_at
    FROM public.online_registrations r
    WHERE r.id = ANY(p_ticket_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.check_online_registration_tickets(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_online_registration_tickets(text[]) TO anon, authenticated;

-- 7. Normalized spam protection trigger: maximum 3 active pending tickets per phone number
CREATE OR REPLACE FUNCTION public.check_max_pending_registrations()
RETURNS TRIGGER AS $$
DECLARE
    cleaned_phone TEXT;
    pending_count INT;
BEGIN
    cleaned_phone := regexp_replace(NEW.phone, '\D', '', 'g');

    IF length(cleaned_phone) < 7 OR length(cleaned_phone) > 15 THEN
        RAISE EXCEPTION 'Please provide a valid phone number (at least 7 digits).';
    END IF;

    SELECT COUNT(*) INTO pending_count
    FROM public.online_registrations
    WHERE regexp_replace(phone, '\D', '', 'g') = cleaned_phone
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

-- 8. Precise midnight purge for unarchived tickets at 12:00 AM Manila Time
CREATE OR REPLACE FUNCTION public.purge_expired_online_registrations()
RETURNS INT AS $$
DECLARE
    deleted_count INT;
    midnight_manila TIMESTAMPTZ;
BEGIN
    midnight_manila := (date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila');

    WITH purged AS (
        DELETE FROM public.online_registrations
        WHERE status = 'Pending'
          AND is_archived = FALSE
          AND deleted_at IS NULL
          AND submitted_at < midnight_manila
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

-- 9. Reschedule pg_cron at 16:00 UTC (00:00 Asia/Manila)
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

COMMIT;