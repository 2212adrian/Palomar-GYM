-- ============================================================================
-- MIGRATION: 20260919000000_transfer_superadmin_ownership.sql
-- DESCRIPTION:
--   Adds the ability to transfer Superadmin ownership to another account.
--
--   The transfer is intentionally demanding:
--     1. Only the CURRENT Superadmin may invoke it.
--     2. The caller must re-enter their own account password (re-authentication).
--     3. The target is addressed by username, must be an active account, and
--        must have a resolvable email address.
--
--   Password verification happens HERE, inside the database, using the same
--   bcrypt comparison as public.verify_user_password(). It is deliberately not
--   done on the client, so it cannot be bypassed by tampering with the UI.
--
-- ALSO ADDS:
--   public.get_superadmin_email_for_admin()
--   Lets an admin-level session discover which account currently holds
--   Superadmin ownership. User Management needs this to hide the Superadmin row
--   from plain admins, and to stay correct after a transfer without waiting for
--   a frontend redeploy (VITE_SUPERADMIN_EMAIL is baked in at build time).
--
-- SAFETY:
--   * Idempotent -- CREATE OR REPLACE only.
--   * Wrapped in a single transaction.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADMIN-READABLE SUPERADMIN IDENTITY
--    Returns the configured Superadmin address to admin/superadmin callers only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_superadmin_email_for_admin()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NOT public.is_superadmin() THEN
    SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();

    IF COALESCE(v_role, '') <> 'admin' THEN
      RAISE EXCEPTION 'Access Denied: Administrative privileges required.';
    END IF;
  END IF;

  RETURN public.get_superadmin_email();
END;
$$;

REVOKE ALL ON FUNCTION public.get_superadmin_email_for_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_superadmin_email_for_admin() TO authenticated;

COMMENT ON FUNCTION public.get_superadmin_email_for_admin() IS
'Returns the email address of the account that currently holds Superadmin ownership. Restricted to admin and superadmin sessions.';

-- ============================================================================
-- 2. OWNERSHIP TRANSFER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_superadmin_ownership(
  p_target_username   TEXT,
  p_confirm_password  TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_email    TEXT;
  v_stored_hash     TEXT;
  v_password_ok     BOOLEAN := FALSE;
  v_clean_username  TEXT;
  v_target_id       UUID;
  v_target_email    TEXT;
  v_target_status   TEXT;
  v_target_role     TEXT;
  v_current_email   TEXT;
BEGIN
  -- --------------------------------------------------------------------------
  -- STEP 1: Only the current Superadmin may transfer ownership
  -- --------------------------------------------------------------------------
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Access Denied: Only the current Superadmin can transfer ownership.';
  END IF;

  -- --------------------------------------------------------------------------
  -- STEP 2: Re-authenticate the caller with their own password
  -- --------------------------------------------------------------------------
  IF p_confirm_password IS NULL OR p_confirm_password = '' THEN
    RAISE EXCEPTION 'Password confirmation is required.';
  END IF;

  SELECT email, encrypted_password
    INTO v_caller_email, v_stored_hash
  FROM auth.users
  WHERE id = auth.uid();

  IF v_stored_hash IS NULL THEN
    RAISE EXCEPTION 'Unable to verify credentials for the current account.';
  END IF;

  -- Same bcrypt comparison strategy used by public.verify_user_password()
  BEGIN
    v_password_ok := (v_stored_hash = extensions.crypt(p_confirm_password, v_stored_hash));
  EXCEPTION WHEN OTHERS THEN
    v_password_ok := (v_stored_hash = crypt(p_confirm_password, v_stored_hash));
  END;

  IF NOT v_password_ok THEN
    RAISE EXCEPTION 'Incorrect password. Ownership transfer aborted.';
  END IF;

  -- --------------------------------------------------------------------------
  -- STEP 3: Resolve and validate the target account
  -- --------------------------------------------------------------------------
  v_clean_username := lower(trim(COALESCE(p_target_username, '')));

  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'Target username is required.';
  END IF;

  SELECT p.id,
         p.email,
         COALESCE(p.status::text, 'active'),
         COALESCE(p.role::text, 'staff')
    INTO v_target_id, v_target_email, v_target_status, v_target_role
  FROM public.profiles p
  WHERE lower(p.username) = v_clean_username
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'No account found with the username "%".', p_target_username;
  END IF;

  IF v_target_email IS NULL OR trim(v_target_email) = '' THEN
    RAISE EXCEPTION 'That account has no email address on file and cannot take ownership.';
  END IF;

  IF v_target_status <> 'active' THEN
    RAISE EXCEPTION
      'That account is currently "%" and must be active before it can take ownership.',
      v_target_status;
  END IF;

  IF v_target_id = auth.uid() THEN
    RAISE EXCEPTION 'You already own the Superadmin role.';
  END IF;

  SELECT public.get_superadmin_email() INTO v_current_email;

  IF lower(v_target_email) = lower(COALESCE(v_current_email, '')) THEN
    RAISE EXCEPTION 'That account already holds Superadmin ownership.';
  END IF;

  -- --------------------------------------------------------------------------
  -- STEP 4: Promote the target BEFORE the config flips.
  --
  -- ORDER MATTERS: public.check_profile_update_privileges() is a BEFORE UPDATE
  -- trigger that calls public.is_superadmin(). Once system_config points at the
  -- new address the caller stops being Superadmin, and that trigger would then
  -- reject this very write. Promoting first keeps the caller privileged.
  -- --------------------------------------------------------------------------
  IF v_target_role <> 'admin' THEN
    UPDATE public.profiles
    SET role = 'admin'::public.user_role,
        updated_at = now()
    WHERE id = v_target_id;
  END IF;

  -- --------------------------------------------------------------------------
  -- STEP 5: Hand over ownership (this is the actual transfer)
  -- --------------------------------------------------------------------------
  UPDATE public.system_config
  SET value = lower(trim(v_target_email)),
      updated_at = now()
  WHERE key = 'superadmin_email';

  IF NOT FOUND THEN
    INSERT INTO public.system_config (key, value, updated_at)
    VALUES ('superadmin_email', lower(trim(v_target_email)), now());
  END IF;

  -- --------------------------------------------------------------------------
  -- STEP 6: Audit trail (must never block the transfer)
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM public.log_audit_entry(
      auth.uid(),
      COALESCE(v_caller_email, 'Superadmin'),
      'SUPERADMIN_OWNERSHIP_TRANSFERRED',
      v_target_id::text,
      format(
        'Superadmin ownership transferred to "%s" (%s). Previous owner: %s.',
        p_target_username,
        v_target_email,
        COALESCE(v_caller_email, 'unknown')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Audit log entry for ownership transfer failed: %', SQLERRM;
  END;

  RETURN lower(trim(v_target_email));
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_superadmin_ownership(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_superadmin_ownership(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.transfer_superadmin_ownership(TEXT, TEXT) IS
'Transfers Superadmin ownership to the account identified by username, after re-verifying the current Superadmin password. Restricted to the current Superadmin.';

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'transfer_superadmin_ownership'
  ) THEN
    RAISE EXCEPTION 'Migration aborted: public.transfer_superadmin_ownership() was not created.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK (commented out)
-- ----------------------------------------------------------------------------
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.transfer_superadmin_ownership(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.get_superadmin_email_for_admin();
--   -- Optionally point ownership back at a specific address:
--   -- UPDATE public.system_config SET value = 'wolf.palomar@gmail.com'
--   -- WHERE key = 'superadmin_email';
--   COMMIT;
-- ============================================================================
