-- Migration: Create custom user_status and user_role Enum Types
-- Path: src/lib/supabase/migrations/ready/20260701113000_create_user_status_enum.sql

-- 1. Create user_status Enum Type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE public.user_status AS ENUM ('active', 'pending', 'inactive');
  END IF;
END$$;

-- 2. Create user_role Enum Type (typo "stuff" handled as "staff")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'staff');
  END IF;
END$$;