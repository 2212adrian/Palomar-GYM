-- Migration: Add email tracking and perform clean backfill
-- Path: src/lib/supabase/migrations/ready/20260701140000_sync_user_emails.sql

-- 1. Safely add the email column to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Clean up any leftover triggers on auth.users to ensure zero database-level deadlock conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_signin ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated_sync ON auth.users;

-- 3. One-time sync to update all existing profile email columns
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;