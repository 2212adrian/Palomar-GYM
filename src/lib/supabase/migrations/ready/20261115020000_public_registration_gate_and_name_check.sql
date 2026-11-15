-- Public registration gate & duplicate member name check RPCs
-- Safely exposes minimal boolean checks to anonymous and authenticated clients without weakening RLS on members or cash_sessions.

CREATE OR REPLACE FUNCTION public.is_gym_open()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.cash_sessions
    WHERE status = 'open'
      AND closed_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_gym_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_gym_open() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_member_name_exists(p_full_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RETURN FALSE;
  END IF;

  v_normalized := regexp_replace(lower(trim(p_full_name)), '\s+', ' ', 'g');

  RETURN EXISTS (
    SELECT 1
    FROM public.members
    WHERE deleted_at IS NULL
      AND regexp_replace(lower(trim(full_name)), '\s+', ' ', 'g') = v_normalized
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_member_name_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_member_name_exists(TEXT) TO anon, authenticated;
