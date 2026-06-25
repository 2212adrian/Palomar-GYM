-- 1. Safely drop custom tables if they still exist in any environment states
drop table if exists public.profiles cascade;
drop table if exists public.allowed_users cascade;

-- 2. Drop the after-insert trigger (which fails because the profiles table is deleted)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user_profile();

-- 3. Drop the before-insert triggers and validation functions
drop trigger if exists before_auth_user_created on auth.users;
drop function if exists public.block_unauthorized_signups();
drop function if exists public.block_oauth_signups();