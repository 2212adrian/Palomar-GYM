-- Migration: Clean up and drop ALL custom triggers and trigger functions on auth.users and profiles
-- Path: src/lib/supabase/migrations/ready/20260701130000_sync_user_and_profile_updates.sql

-- 1. Drop all custom triggers on auth.users and public.profiles to prevent deadlocks and unexpected_failure errors
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_signin ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated_sync ON auth.users;
DROP TRIGGER IF EXISTS on_profile_updated_sync ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_role_updated ON public.profiles;
DROP TRIGGER IF EXISTS on_before_profile_update ON public.profiles;

-- 2. Drop all corresponding trigger functions to clean up the schema
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_user_signin_status();
DROP FUNCTION IF EXISTS public.sync_auth_user_updates_to_profiles();
DROP FUNCTION IF EXISTS public.sync_profile_updates_to_auth();
DROP FUNCTION IF EXISTS public.check_profile_update_privileges();


-- 3. One-time sync to update current existing user metadata roles, usernames, and statuses (Fixed Enum explicit typecasting)
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role::text),
    raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'full_name', p.username,
      'status', p.status::text
    )
FROM public.profiles p
WHERE u.id = p.id;