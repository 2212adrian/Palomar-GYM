// src/lib/oauthCallback.ts
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import { logAudit } from './supabase/audit';

export interface NoemailSwapResult {
  checked: boolean;
  swapped: boolean;
  wasNoemail: boolean;
  oldEmail?: string;
  newEmail?: string;
  errorMessage?: string;
}

const isPlaceholderNoemail = (email?: string | null): boolean =>
  typeof email === 'string' && email.trim().toLowerCase().endsWith('@palomargym.noemail');

/**
 * Waits for Supabase to complete any in-flight OAuth PKCE code exchange or hash token hydration
 * and ensures the resulting session is persisted before running post-OAuth session logic.
 */
export const waitForPersistedOAuthSession = async (
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  hash: string = typeof window !== 'undefined' ? window.location.hash : ''
): Promise<Session | null> => {
  // 1. Calling getSession() awaits Supabase's internal initialize() promise (including detectSessionInUrl).
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    return session;
  }

  // 2. Parse explicit tokens from hash or PKCE code from query string if initialize() didn't consume them.
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const hashRaw = hash.startsWith('#') ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(hashRaw);

  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error && data?.session?.user) {
      return data.session;
    }
  }

  const code = searchParams.get('code');
  if (code) {
    // Poll briefly in case GoTrue's async PKCE exchange is still committing to storage.
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 150));
      const { data: polled } = await supabase.auth.getSession();
      if (polled?.session?.user) {
        return polled.session;
      }
    }

    const { data: exchanged, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError && exchanged?.session?.user) {
      return exchanged.session;
    }
  }

  // 3. Final short retry on persisted storage hydration
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 150));
    const { data: retried } = await supabase.auth.getSession();
    if (retried?.session?.user) {
      return retried.session;
    }
  }

  return null;
};

/**
 * Checks whether the authenticated user has a `@palomargym.noemail` placeholder email (or out-of-sync email)
 * while carrying a linked Google identity, and safely swaps it to the verified Google email via
 * the `sync_linked_google_email` SECURITY DEFINER RPC, refreshing the persisted session afterward.
 */
export const swapNoemailWithGoogleIdentity = async (
  currentUser: User
): Promise<NoemailSwapResult> => {
  const currentEmail = (currentUser.email || '').trim().toLowerCase();
  const rawProviders = currentUser.app_metadata?.providers;
  const singleProvider = currentUser.app_metadata?.provider;
  const providers: string[] = Array.isArray(rawProviders)
    ? rawProviders
    : singleProvider
      ? [singleProvider]
      : [];

  let identities: any[] = currentUser.identities || [];
  try {
    const { data: idData, error: idError } = await supabase.auth.getUserIdentities();
    if (!idError && Array.isArray(idData?.identities) && idData.identities.length > 0) {
      identities = idData.identities;
    }
  } catch {
    // Fallback to session user identities
  }

  const googleIdentity = identities.find((id: any) => id.provider === 'google');
  const hasGoogle = providers.includes('google') || Boolean(googleIdentity);

  if (!hasGoogle) {
    return {
      checked: true,
      swapped: false,
      wasNoemail: isPlaceholderNoemail(currentEmail),
    };
  }

  const googleEmail = (
    googleIdentity?.identity_data?.email ||
    googleIdentity?.email ||
    ''
  )
    .trim()
    .toLowerCase();

  const needsSwap =
    isPlaceholderNoemail(currentEmail) ||
    (Boolean(googleEmail) && currentEmail !== googleEmail);

  if (!needsSwap) {
    return {
      checked: true,
      swapped: false,
      wasNoemail: false,
      newEmail: currentEmail,
    };
  }

  const { data, error } = await supabase.rpc('sync_linked_google_email');

  if (error) {
    return {
      checked: true,
      swapped: false,
      wasNoemail: isPlaceholderNoemail(currentEmail),
      errorMessage: error.message || 'Failed to swap placeholder email with Google email.',
    };
  }

  if (data && data.success === false) {
    return {
      checked: true,
      swapped: false,
      wasNoemail: Boolean(data.was_noemail ?? isPlaceholderNoemail(currentEmail)),
      errorMessage: data.message || 'Could not update placeholder account email.',
    };
  }

  if (data?.success && data?.updated) {
    // Refresh the persisted JWT/session immediately so client auth state reflects the new verified email.
    await supabase.auth.refreshSession().catch(() => {});

    await logAudit(
      'GOOGLE_ACCOUNT_EMAIL_BOUND',
      `OAuth callback verified Google identity and swapped account email from "${data.old_email || currentEmail}" to "${data.new_email}".`,
      currentUser.id
    ).catch(() => {});

    return {
      checked: true,
      swapped: true,
      wasNoemail: Boolean(data.was_noemail ?? isPlaceholderNoemail(currentEmail)),
      oldEmail: data.old_email || currentEmail,
      newEmail: data.new_email,
    };
  }

  return {
    checked: true,
    swapped: false,
    wasNoemail: Boolean(data?.was_noemail ?? false),
    newEmail: data?.email || currentEmail,
  };
};
