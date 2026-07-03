-- Migration: Create administrative user pre-registration function with GoTrue and Enum compliance
-- Path: src/lib/supabase/migrations/ready/20260701110000_create_admin_registration_function.sql

-- Enable pgcrypto for crypt password hashing if not already configured
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Clean up existing definitions to avoid signature conflicts
DROP FUNCTION IF EXISTS public.admin_register_user(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_register_user(
  new_email TEXT,
  new_password TEXT,
  new_name TEXT,
  new_role TEXT
)
RETURNS UUID
SECURITY DEFINER
-- Added extensions to search_path to resolve pgcrypto functions safely
SET search_path = public, auth, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  new_user_id UUID;
  caller_role TEXT;
  caller_email TEXT;
BEGIN
  -- 1. Security Check: Validate that the client caller is an administrator or superadmin
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_email <> 'wolf.palomar@gmail.com' AND COALESCE(caller_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Only system administrators are authorized to pre-register users.';
  END IF;

  -- 2. Insert credentials directly into auth.users (Unconfirmed for email users to allow signup confirmation triggers)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    is_anonymous
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    new_email,
    extensions.crypt(new_password, extensions.gen_salt('bf')),
    CASE WHEN new_email LIKE '%@palomargym.noemail' THEN now() ELSE NULL END, -- email_confirmed_at remains NULL for email accounts to enable signup mailers
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', new_role), -- Synced raw_app_meta_data role on creation
    jsonb_build_object('full_name', new_name),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '', -- confirmation_token must not be null
    '', -- recovery_token must not be null
    '', -- email_change
    '', -- email_change_token_new
    '', -- email_change_token_current
    NULL, -- phone
    NULL, -- phone_confirmed_at
    '', -- phone_change
    '', -- phone_change_token
    0, -- email_change_confirm_status
    NULL, -- banned_until
    '', -- reauthentication_token
    NULL, -- reauthentication_sent_at
    false, -- is_sso_user
    false -- is_anonymous
  )
  RETURNING id INTO new_user_id;

  -- 3. Insert the REQUIRED identity mapping (email is omitted as it is automatically populated via system-generated expressions)
  INSERT INTO auth.identities (
    id, -- Expects UUID primary key
    user_id,
    provider,
    provider_id, -- Expects TEXT
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(), -- Generate secure UUID for the primary key
    new_user_id,
    'email',
    new_user_id::text, -- Match user UUID as text string
    jsonb_build_object('sub', new_user_id::text, 'email', new_email, 'email_verified', false),
    now(),
    now(),
    now()
  );

  -- 4. Sync or create corresponding profiles dataset block in public.profiles (Explicitly cast role variable to Enum)
  INSERT INTO public.profiles (id, username, role, status, email, created_at, updated_at)
  VALUES (
    new_user_id, 
    new_name, 
    new_role::public.user_role,
    CASE WHEN new_email LIKE '%@palomargym.noemail' THEN 'active'::public.user_status ELSE 'pending'::public.user_status END,
    new_email,
    now(), 
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      role = EXCLUDED.role,
      email = EXCLUDED.email,
      updated_at = now();

  RETURN new_user_id;
END;
$$;

-- Grant execution privileges to authenticated administrative sessions
GRANT EXECUTE ON FUNCTION public.admin_register_user(TEXT, TEXT, TEXT, TEXT) TO authenticated;