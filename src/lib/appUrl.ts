// src/lib/appUrl.ts
import { Capacitor } from '@capacitor/core';

/**
 * Single source of truth for every absolute URL that leaves the application
 * (signup confirmation, password recovery, administrator-issued invites).
 *
 * STRICT RESOLUTION PRIORITY:
 * ---------------------------
 * 1. VITE_APP_URL:
 *    Always wins. Whatever domain is defined in your `.env` or Vercel Environment
 *    Variables (e.g. `https://dev-wolfpalomar.vercel.app`) is strictly used.
 *
 * 2. Localhost Development Fallback:
 *    If `VITE_APP_URL` is unset and we are actively in local development
 *    (`import.meta.env.DEV`), uses the local browser origin (`http://localhost:...`).
 *
 * 3. CANONICAL_PORTAL_URL:
 *    Default fallback for production builds, installed Capacitor native shells,
 *    or when the browser origin is an internal Vercel deployment hash
 *    (e.g., `*-projects.vercel.app`), preventing Vercel login wall loops.
 */

export const CANONICAL_PORTAL_URL = 'https://dev-wolfpalomar.vercel.app';

/** Removes trailing slashes so we never emit `https://host//path`. */
const stripTrailingSlashes = (value: string): string =>
  value.trim().replace(/\/+$/, '');

/** True when running inside an installed Capacitor mobile shell (Android / iOS). */
const isNativeAppShell = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Reads and normalizes VITE_APP_URL from Vite's environment variables.
 */
const readConfiguredAppUrl = (): string => {
  try {
    const raw = import.meta.env.VITE_APP_URL;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return stripTrailingSlashes(raw);
    }
  } catch {
    // import.meta.env might be unavailable in non-Vite environments
  }
  return '';
};

/**
 * Resolves the base URL strictly around VITE_APP_URL.
 */
const resolveAppUrl = (): string => {
  // 1. VITE_APP_URL is the primary source of truth
  const configured = readConfiguredAppUrl();
  if (configured) {
    return configured;
  }

  // 2. Safe origin detection for local dev or custom web domains
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;

    // Reject native mobile schemes (capacitor://, file://, http://localhost on Android)
    if (!isNativeAppShell()) {
      // In local development, permit localhost origin
      if (import.meta.env.DEV && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(origin)) {
        return stripTrailingSlashes(origin);
      }

      // Allow live origin ONLY if it is not an auto-generated Vercel preview project hash
      if (!origin.includes('-projects.vercel.app')) {
        return stripTrailingSlashes(origin);
      }
    }
  }

  // 3. Fallback to canonical portal URL
  return CANONICAL_PORTAL_URL;
};

/** The absolute base URL of this application, with no trailing slash. */
export const APP_URL: string = resolveAppUrl();

/**
 * Builds an absolute URL for a route this app serves, suitable for handing to
 * Supabase as `emailRedirectTo` / `redirectTo`.
 *
 * @example buildAppUrl('/confirm-signup') -> 'https://dev-wolfpalomar.vercel.app/confirm-signup'
 * @example buildAppUrl('/forgot-password') -> 'https://dev-wolfpalomar.vercel.app/forgot-password'
 */
export const buildAppUrl = (path = '/'): string => {
  if (!path || path === '/') return APP_URL;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_URL}${cleanPath}`;
};

// Surface configuration warnings in development
if (import.meta.env.DEV) {
  if (!readConfiguredAppUrl()) {
    console.info(
      `[appUrl] VITE_APP_URL is not explicitly set in your .env file. Falling back to: ${APP_URL}`
    );
  }
}