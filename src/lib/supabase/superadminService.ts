// src/lib/supabase/superadminService.ts
import { supabase } from './client';

/**
 * Resolves the email address of the account that currently holds Superadmin
 * ownership, as recorded in public.system_config on the server.
 *
 * This is the authoritative source. VITE_SUPERADMIN_EMAIL is only a build-time
 * fallback: Vite inlines it into the bundle, so it goes stale the moment
 * ownership is transferred and stays stale until the next deployment.
 *
 * Returns null when the caller is not an administrator, or when the lookup
 * fails, so callers can gracefully fall back to the baked-in value.
 */
export async function fetchSuperAdminEmail(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc(
      'get_superadmin_email_for_admin'
    );

    if (error || !data) return null;

    const email = String(data).trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

/**
 * Transfers Superadmin ownership to another account.
 *
 * The password is verified inside Postgres by the RPC itself, not here, so a
 * tampered client cannot bypass re-authentication.
 *
 * @param targetUsername  Username of the account that will become Superadmin.
 * @param confirmPassword The CURRENT Superadmin's own password.
 * @returns The email address of the new Superadmin.
 */
export async function transferSuperAdminOwnership(params: {
  targetUsername: string;
  confirmPassword: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('transfer_superadmin_ownership', {
    p_target_username: params.targetUsername,
    p_confirm_password: params.confirmPassword,
  });

  if (error) throw error;
  if (!data) {
    throw new Error('Ownership transfer did not return a new owner address.');
  }

  return String(data).trim().toLowerCase();
}
