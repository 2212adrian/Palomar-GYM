// src/constants/auth.ts

/**
 * The Superadmin email address is supplied at build time by the Vercel
 * environment variable VITE_SUPERADMIN_EMAIL. It is intentionally NOT hardcoded.
 *
 * IMPORTANT -- THIS VALUE IS PUBLIC:
 *   Vite inlines every `VITE_`-prefixed variable into the client bundle, so this
 *   address is readable by anyone who inspects the JavaScript. It is used ONLY
 *   for UI gating (deciding whether to render admin-only screens).
 *
 *   All real authorization is enforced by Postgres RLS via public.is_superadmin(),
 *   which reads the address from public.system_config in the database. Never rely
 *   on this constant for security.
 *
 * To change the address:
 *   1. Update SUPERADMIN_EMAIL in Vercel -> Settings -> Environment Variables
 *   2. POST /api/sync-superadmin-email to push it into the database
 *   See 20260918000000_add_superadmin_email_config.sql for the full design.
 */
const rawSuperAdminEmail = import.meta.env.VITE_SUPERADMIN_EMAIL as
  | string
  | undefined;

export const SUPERADMIN_EMAIL = (rawSuperAdminEmail ?? '')
  .trim()
  .toLowerCase();

/**
 * Checks if a given email belongs to the Superadmin.
 * Performs a safe, case-insensitive comparison.
 *
 * Returns false when VITE_SUPERADMIN_EMAIL is not configured, or when no email
 * is supplied. That guard matters: without it, an empty configured value would
 * compare equal to an empty input and grant admin UI access to everybody.
 */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email || !SUPERADMIN_EMAIL) return false;
  return email.trim().toLowerCase() === SUPERADMIN_EMAIL;
}
