-- Migration: 20261111000000_handle_google_bind_unbind_email.sql
-- Function to synchronize user email when Google OAuth identity is linked to a local account
CREATE OR REPLACE FUNCTION public.sync_linked_google_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_google_identity record;
  v_google_email text;
  v_current_email text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_current_email FROM auth.users WHERE id = v_user_id;

  -- Find linked google identity for this user in auth.identities
  SELECT * INTO v_google_identity 
  FROM auth.identities 
  WHERE user_id = v_user_id AND provider = 'google'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_google_identity IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No Google identity linked');
  END IF;

  -- Extract email from identity_data or email field
  v_google_email := lower(trim(COALESCE(
    v_google_identity.identity_data->>'email',
    v_google_identity.email
  )));

  IF v_google_email IS NULL OR v_google_email = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Google email not found in identity data');
  END IF;

  -- If current email is a noemail placeholder or different from google email
  IF v_current_email LIKE '%@palomargym.noemail' OR lower(v_current_email) <> v_google_email THEN
    -- Check if another user already has this email
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_google_email AND id <> v_user_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Email ' || v_google_email || ' is already used by another account');
    END IF;

    UPDATE auth.users
    SET email = v_google_email,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;

    UPDATE public.profiles
    SET email = v_google_email,
        updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', true, 
      'updated', true, 
      'old_email', v_current_email, 
      'new_email', v_google_email
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', false, 'email', v_current_email);
END;
$$;

-- Function to revert user account email to local handle <username>@palomargym.noemail upon unlinking Google
CREATE OR REPLACE FUNCTION public.revert_user_to_local_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_username text;
  v_clean_slug text;
  v_local_email text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lookup username from profiles table
  SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;

  IF v_username IS NULL OR trim(v_username) = '' THEN
    SELECT lower(regexp_replace(COALESCE(raw_user_meta_data->>'full_name', 'user'), '[^a-z0-9]', '', 'g'))
    INTO v_clean_slug
    FROM auth.users
    WHERE id = v_user_id;
  ELSE
    v_clean_slug := lower(regexp_replace(v_username, '[^a-z0-9]', '', 'g'));
  END IF;

  IF v_clean_slug IS NULL OR v_clean_slug = '' THEN
    v_clean_slug := 'user' || substr(replace(v_user_id::text, '-', ''), 1, 6);
  END IF;

  v_local_email := v_clean_slug || '@palomargym.noemail';

  -- Check if another user already has this local email
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_local_email AND id <> v_user_id) THEN
    v_local_email := v_clean_slug || substr(replace(v_user_id::text, '-', ''), 1, 4) || '@palomargym.noemail';
  END IF;

  -- Update auth.users and profiles
  UPDATE auth.users
  SET email = v_local_email,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"email_verification_enabled": false}'::jsonb,
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.profiles
  SET email = v_local_email,
      email_verification_enabled = false,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'local_email', v_local_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_linked_google_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_user_to_local_email() TO authenticated;