// src/constants/auth.ts

export const SUPERADMIN_EMAIL = 'wolf.palomar@gmail.com';

/**
 * Checks if a given email belongs to the Superadmin.
 * Performs a safe, case-insensitive comparison.
 */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
}
