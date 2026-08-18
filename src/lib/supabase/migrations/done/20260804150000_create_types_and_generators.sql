-- Migration: Create Custom Types and ID Generators
-- File: 20260804150000_create_types_and_generators.sql

BEGIN;

-- Custom ENUM Types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status_enum') THEN
        CREATE TYPE public.member_status_enum AS ENUM ('Active', 'Suspended');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_type_enum') THEN
        CREATE TYPE public.subscription_type_enum AS ENUM ('monthly', 'yearly', 'incentive');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
        CREATE TYPE public.subscription_status_enum AS ENUM ('Active', 'Expired', 'Inactive', 'Voided');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_type_enum') THEN
        CREATE TYPE public.card_type_enum AS ENUM ('QR', 'Manual', 'None');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_type_enum') THEN
        CREATE TYPE public.customer_type_enum AS ENUM ('Walk-In', 'Existing Member', 'New Membership');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN
        CREATE TYPE public.payment_method_enum AS ENUM ('Cash', 'GCash');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'online_reg_status_enum') THEN
        CREATE TYPE public.online_reg_status_enum AS ENUM ('Pending', 'Approved', 'Rejected');
    END IF;
END $$;

-- Sequence Generator: Member Human ID (e.g. MEM-000001)
CREATE SEQUENCE IF NOT EXISTS public.member_id_seq START 1;
CREATE OR REPLACE FUNCTION public.generate_member_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'MEM-' || lpad(nextval('public.member_id_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Sequence Generator: Subscription ID (e.g. SUB-000001)
CREATE SEQUENCE IF NOT EXISTS public.sub_id_seq START 1;
CREATE OR REPLACE FUNCTION public.generate_sub_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'SUB-' || lpad(nextval('public.sub_id_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Sequence Generator: Receipt Number formatted as REC-XXXXXXXXXXX (e.g., REC-10000000001)
CREATE SEQUENCE IF NOT EXISTS public.rec_receipt_no_seq START 10000000001;
CREATE OR REPLACE FUNCTION public.generate_rec_receipt_no()
RETURNS TEXT AS $$
BEGIN
    RETURN 'REC-' || nextval('public.rec_receipt_no_seq')::text;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Sequence Generator: Check-in / Attendance ID (e.g. CHK-100001)
CREATE SEQUENCE IF NOT EXISTS public.checkin_id_seq START 100001;
CREATE OR REPLACE FUNCTION public.generate_checkin_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'CHK-' || nextval('public.checkin_id_seq')::text;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMIT;