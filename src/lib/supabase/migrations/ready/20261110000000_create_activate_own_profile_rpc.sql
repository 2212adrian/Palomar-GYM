-- Allows an authenticated user to automatically promote their own profile status from 'pending' to 'active' on login
CREATE OR REPLACE FUNCTION public.activate_own_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.profiles
  SET status = 'active',
      updated_at = NOW()
  WHERE id = auth.uid()
    AND (status = 'pending' OR status IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_own_profile() TO authenticated;