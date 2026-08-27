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
        CREATE TYPE public.payment_method_enum AS ENUM ('Cash', 'GCash', 'Promo');
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

-- Random Generator: Receipt Number formatted as REC-XXXXXXXXXXX (e.g., REC-84920193847)
CREATE OR REPLACE FUNCTION public.generate_rec_receipt_no()
RETURNS TEXT AS $$
DECLARE
    candidate TEXT;
    exists_flag BOOLEAN := FALSE;
    col_name TEXT := NULL;
    target_table TEXT := NULL;
BEGIN
    -- Dynamically check if receipts table exists and identify the exact column ('receipt_no' or 'receipt_number')
    IF to_regclass('public.receipts') IS NOT NULL THEN
        SELECT column_name INTO col_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'receipts'
          AND column_name IN ('receipt_no', 'receipt_number')
        LIMIT 1;

        IF col_name IS NOT NULL THEN
            target_table := 'public.receipts';
        END IF;
    END IF;

    -- Fallback: check subscriptions table if receipts table/column was not found
    IF col_name IS NULL AND to_regclass('public.subscriptions') IS NOT NULL THEN
        SELECT column_name INTO col_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
          AND column_name IN ('receipt_no', 'receipt_number')
        LIMIT 1;

        IF col_name IS NOT NULL THEN
            target_table := 'public.subscriptions';
        END IF;
    END IF;

    LOOP
        -- Generate random 11-digit number string (10000000000 to 99999999999)
        candidate := 'REC-' || (floor(random() * 90000000000 + 10000000000)::bigint)::text;

        -- Check uniqueness against database using the detected column name
        IF target_table IS NOT NULL AND col_name IS NOT NULL THEN
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', target_table, col_name)
            INTO exists_flag
            USING candidate;
        ELSE
            exists_flag := FALSE;
        END IF;

        IF NOT exists_flag THEN
            RETURN candidate;
        END IF;
    END LOOP;
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