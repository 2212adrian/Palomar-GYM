-- Migration: Create Members Table (Includes Card Fields, Signatures & Soft Delete)
-- File: 20260804150100_create_members_table.sql

BEGIN;

-- Type Guard Enforcers (Ensures standalone execution without dependency errors)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status_enum') THEN
        CREATE TYPE public.member_status_enum AS ENUM ('Active', 'Suspended');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_type_enum') THEN
        CREATE TYPE public.card_type_enum AS ENUM ('QR', 'Manual', 'None');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id VARCHAR(20) UNIQUE NOT NULL DEFAULT public.generate_member_id(),
    full_name TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email TEXT DEFAULT NULL,
    gender VARCHAR(20) NOT NULL DEFAULT 'Male',
    birthday DATE DEFAULT NULL,
    address TEXT DEFAULT NULL,
    image_url TEXT DEFAULT NULL,
    emergency_contact_name TEXT DEFAULT NULL,
    relationship TEXT DEFAULT NULL,
    emergency_contact_phone VARCHAR(20) DEFAULT NULL,
    status public.member_status_enum NOT NULL DEFAULT 'Active'::public.member_status_enum,
    notes TEXT DEFAULT NULL,

    -- Security Card Fields
    card_number VARCHAR(50) UNIQUE DEFAULT NULL,
    card_type public.card_type_enum NOT NULL DEFAULT 'None'::public.card_type_enum,
    card_version INT NOT NULL DEFAULT 1,
    card_issued_at TIMESTAMPTZ DEFAULT NULL,

    -- Minor & E-Signature Legal Consent Fields
    parent_name TEXT DEFAULT NULL,
    parent_relationship TEXT DEFAULT NULL,
    parent_phone VARCHAR(20) DEFAULT NULL,
    parent_email TEXT DEFAULT NULL,
    applicant_signature TEXT DEFAULT NULL, -- Applicant E-Signature
    parent_signature TEXT DEFAULT NULL,    -- Parent / Guardian E-Signature
    consent_date TIMESTAMPTZ DEFAULT NULL,

    -- Soft Delete Recycle Bin Metadata
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    delete_reason TEXT DEFAULT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Soft Delete Interceptor Function
CREATE OR REPLACE FUNCTION public.handle_members_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    UPDATE public.members
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = OLD.id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_members_soft_delete ON public.members;
CREATE TRIGGER tr_members_soft_delete
    BEFORE DELETE ON public.members
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_members_soft_delete();

-- Row Level Security (RLS)
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view active members" ON public.members;
CREATE POLICY "Allow authenticated users to view active members" ON public.members
    FOR SELECT TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR deleted_at IS NULL
    );

DROP POLICY IF EXISTS "Allow authenticated users to insert members" ON public.members;
CREATE POLICY "Allow authenticated users to insert members" ON public.members
    FOR INSERT TO authenticated WITH CHECK (deleted_at IS NULL);

DROP POLICY IF EXISTS "Allow authenticated users to update members" ON public.members;
CREATE POLICY "Allow authenticated users to update members" ON public.members
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete members" ON public.members;
CREATE POLICY "Allow authenticated users to delete members" ON public.members
    FOR DELETE TO authenticated USING (true);

-- Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'members') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
        END IF;
    END IF;
END $$;

COMMIT; 