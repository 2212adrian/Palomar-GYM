-- Migration: Add 'disabled' to user_status enum if not present
-- Ensures compatibility with both 'inactive' and 'disabled' status designations

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_status' AND e.enumlabel = 'disabled'
  ) THEN
    ALTER TYPE public.user_status ADD VALUE IF NOT EXISTS 'disabled';
  END IF;
END $$;
