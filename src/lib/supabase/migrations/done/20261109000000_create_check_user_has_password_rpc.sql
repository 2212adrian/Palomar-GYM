-- Creates an RPC function to detect if the authenticated user has an assigned password
CREATE OR REPLACE FUNCTION public.check_user_has_password()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  has_pass boolean;
BEGIN
  SELECT (encrypted_password IS NOT NULL AND encrypted_password != '')
  INTO has_pass
  FROM auth.users
  WHERE id = auth.uid();

  RETURN COALESCE(has_pass, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_has_password() TO authenticated;