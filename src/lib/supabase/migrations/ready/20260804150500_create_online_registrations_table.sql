-- Migration: Create Online Registrations Table
-- File: 20260804150500_create_online_registrations_table.sql

BEGIN;

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
    applicant_signature TEXT DEFAULT NULL, -- Applicant E-Signature
    parent_signature TEXT DEFAULT NULL,    -- Parent / Guardian E-Signature
    consent_date TIMESTAMPTZ DEFAULT NULL,
    guardian_consent BOOLEAN DEFAULT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security (RLS)
ALTER TABLE public.online_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous users to submit online registrations" ON public.online_registrations
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated staff to view & process registrations" ON public.online_registrations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'online_registrations') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.online_registrations;
        END IF;
    END IF;
END $$;

COMMIT;