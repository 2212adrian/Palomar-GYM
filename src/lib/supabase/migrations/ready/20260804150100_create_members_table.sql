-- Migration: Create Members Table (Includes Card Fields Cleanup, Signatures, Soft Delete & Daily 16:00 UTC Auto-Purge)
-- File: 20260804150100_create_members_table.sql

BEGIN;

-- ============================================================================
-- 1. EXTENSION & ENUM PREPARATION
-- ============================================================================

-- Enable pg_cron extension for scheduled database tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Type Guard Enforcers (Ensures standalone execution without dependency errors)
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status_enum') THEN
        CREATE TYPE public.member_status_enum AS ENUM ('Active', 'Suspended');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_type_enum') THEN
        CREATE TYPE public.card_type_enum AS ENUM ('QR', 'Manual', 'None');
    END IF;
END $do$;

-- ============================================================================
-- 2. TABLE CREATION
-- ============================================================================

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

-- Clean up any legacy embedded card columns
ALTER TABLE public.members 
  DROP COLUMN IF EXISTS card_number,
  DROP COLUMN IF EXISTS card_type,
  DROP COLUMN IF EXISTS card_version,
  DROP COLUMN IF EXISTS card_issued_at;

-- ============================================================================
-- 3. SOFT DELETE INTERCEPTOR TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_members_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- If row is already soft deleted, allow permanent deletion (used by manual hard delete in Recycle Bin or pg_cron auto-purge)
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    -- Intercept delete and update timestamps/user metadata instead (Soft Delete)
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

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Drop pre-existing policies for clean migration
DROP POLICY IF EXISTS "Allow authenticated users to view active members" ON public.members;
DROP POLICY IF EXISTS "Allow authenticated users to view members" ON public.members;
DROP POLICY IF EXISTS "Allow authenticated users to insert members" ON public.members;
DROP POLICY IF EXISTS "Allow authenticated users to update members" ON public.members;
DROP POLICY IF EXISTS "Allow authenticated users to delete members" ON public.members;
DROP POLICY IF EXISTS "Allow admin and superadmin to delete members" ON public.members;

-- A. SELECT Policy: Admins and Superadmin can view all members (including soft-deleted). Staff can only view active/non-deleted members.
CREATE POLICY "Allow authenticated users to view members" ON public.members
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'::public.user_role
        )
        OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
        OR deleted_at IS NULL
    );

-- B. INSERT Policy: All authenticated users (Staff, Admin, Superadmin) can register new members
CREATE POLICY "Allow authenticated users to insert members" ON public.members
    FOR INSERT TO authenticated 
    WITH CHECK (deleted_at IS NULL);

-- C. UPDATE Policy: All authenticated users (Staff, Admin, Superadmin) can update member profiles
CREATE POLICY "Allow authenticated users to update members" ON public.members
    FOR UPDATE TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- D. DELETE Policy: Strictly restricted to Administrators and Superadmin (wolf.palomar@gmail.com). Staff CANNOT delete.
CREATE POLICY "Allow admin and superadmin to delete members" ON public.members
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'::public.user_role
        )
        OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );

-- ============================================================================
-- 5. REALTIME PUBLICATION
-- ============================================================================

DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_rel pr 
            JOIN pg_class c ON pr.prrelid = c.oid 
            JOIN pg_namespace n ON c.relnamespace = n.oid 
            WHERE n.nspname = 'public' AND c.relname = 'members'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
        END IF;
    END IF;
END $do$;

-- ============================================================================
-- 6. AUTO-PURGE CRON JOB (Every day at 16:00 UTC / 12:00 AM Manila Time)
-- ============================================================================

-- Pure hard-delete function executed by pg_cron
CREATE OR REPLACE FUNCTION public.purge_expired_soft_deleted_members()
RETURNS void AS $$
BEGIN
    -- Permanently hard-deletes profiles soft deleted >= 30 days ago
    DELETE FROM public.members
    WHERE deleted_at IS NOT NULL 
      AND deleted_at <= (now() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safely schedule the cron job if pg_cron is enabled
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove existing schedule if it exists to avoid duplication errors
        PERFORM cron.unschedule(jobid) 
        FROM cron.job 
        WHERE jobname = 'purge_expired_members_daily';

        -- Schedule cron: '0 16 * * *' = 16:00 UTC = 00:00 Midnight Manila Time (UTC+8)
        PERFORM cron.schedule(
            'purge_expired_members_daily',
            '0 16 * * *',
            'SELECT public.purge_expired_soft_deleted_members();'
        );
    END IF;
END $do$;

COMMIT;