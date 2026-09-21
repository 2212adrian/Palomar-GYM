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

// Guarded read: a missing VITE_SUPERADMIN_EMAIL must never crash the app.
const RAW_SUPERADMIN_EMAIL =
  (import.meta.env.VITE_SUPERADMIN_EMAIL as string | undefined) ?? '';

/**
 * Canonical Superadmin address, lower-cased.
 *
 * MIRROR OF RECORD: the database keeps the same address in
 *   public.system_config -> key 'superadmin_email'
 * and in the safety allow-list returned by public.get_superadmin_allowlist().
 * public.is_superadmin() accepts either copy, so the app and the database can
 * no longer disagree (see 20260922000000_superadmin_full_access_and_rls_repair.sql).
 */
export const SUPERADMIN_EMAIL = RAW_SUPERADMIN_EMAIL.trim().toLowerCase();

export const isSuperAdmin = (email?: string | null): boolean => {
  // An empty configuration must never match every address.
  if (!email || !SUPERADMIN_EMAIL) return false;
  return email.trim().toLowerCase() === SUPERADMIN_EMAIL;
};
