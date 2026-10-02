// src/stores/authStore.ts

import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { buildAppUrl } from '../lib/appUrl';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { isSuperAdmin } from '../constants/auth'; // Centralized helper

export interface UserProfile {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  status: 'active' | 'pending' | 'inactive';
  avatar_url?: string; // Will hold the secure, local blob URL
  email_verification_enabled?: boolean;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  checkSession: () => Promise<void>;
  claimActiveSession: (userIdOverride?: string) => Promise<string | null>;
  validateSession: () => Promise<boolean>;
  forceSessionLogout: (reasonMessage?: string) => Promise<void>;
  setLoginInProgress: (inProgress: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const ACTIVE_SESSION_KEY_PREFIX = 'palomar_active_session_id_';
const OAUTH_PENDING_LOGIN_KEY = 'palomar_oauth_login_pending';

const generateSessionId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

export const getLocalActiveSessionId = (userId?: string | null): string | null => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(`${ACTIVE_SESSION_KEY_PREFIX}${userId}`);
  } catch {
    return null;
  }
};

export const setLocalActiveSessionId = (
  userId: string,
  sessionId: string
): void => {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${ACTIVE_SESSION_KEY_PREFIX}${userId}`, sessionId);
  } catch {
    // Ignore storage quota/restriction errors
  }
};

export const clearLocalActiveSessionId = (userId?: string | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      localStorage.removeItem(`${ACTIVE_SESSION_KEY_PREFIX}${userId}`);
    } else {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(ACTIVE_SESSION_KEY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    }
  } catch {
    // Ignore storage errors
  }
};

export const markPendingNewLogin = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OAUTH_PENDING_LOGIN_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
};

const consumePendingNewLogin = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const pending = localStorage.getItem(OAUTH_PENDING_LOGIN_KEY) === 'true';
    if (pending) {
      localStorage.removeItem(OAUTH_PENDING_LOGIN_KEY);
    }
    return pending;
  } catch {
    return false;
  }
};

const isTransientNetworkError = (err: any): boolean => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('no internet connection') ||
    msg.includes('load failed')
  );
};

const isTemporaryAuthFlowRoute = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  const hash = window.location.hash;
  return (
    path.startsWith('/forgot-password') ||
    path.startsWith('/confirm-signup') ||
    hash.includes('type=recovery') ||
    hash.includes('type=signup') ||
    hash.includes('type=invite')
  );
};

// Memory leak protection: Track active object URL to revoke before creating a new one
let activeAvatarObjectUrl: string | null = null;
let activeProfileChannel: any = null;
let activeProfileUserId: string | null = null; // Track currently subscribed User ID to prevent duplicate binds
let isClaimingSession = false;
let isForcingLogout = false;
let isLoginInProgress = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,
  error: null,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLoginInProgress: (inProgress) => {
    isLoginInProgress = inProgress;
  },

  claimActiveSession: async (userIdOverride?: string) => {
    isClaimingSession = true;
    try {
      let targetUserId = userIdOverride || get().user?.id;
      if (!targetUserId) {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        targetUserId = currentUser?.id;
      }

      if (!targetUserId) return null;

      const newSessionId = generateSessionId();
      setLocalActiveSessionId(targetUserId, newSessionId);

      // 1. Revoke all other active sessions & refresh tokens for this user on Supabase Auth server
      const { error: signOutOthersError } = await supabase.auth.signOut({
        scope: 'others',
      });
      if (signOutOthersError) {
        console.warn(
          'Could not revoke other sessions via scope=others:',
          signOutOthersError.message
        );
      }

      // 2. Persist authoritative active_session_id in user_metadata so other devices detect replacement
      const { error: updateError } = await supabase.auth.updateUser({
        data: { active_session_id: newSessionId },
      });
      if (updateError) {
        console.warn(
          'Could not update active_session_id metadata:',
          updateError.message
        );
      }

      return newSessionId;
    } catch (err) {
      console.warn('Failed to claim single active session:', err);
      return null;
    } finally {
      isClaimingSession = false;
    }
  },

  forceSessionLogout: async (
    reasonMessage = 'Your account was signed in on another device or browser. You have been logged out.'
  ) => {
    if (isForcingLogout) return;
    isForcingLogout = true;

    try {
      const currentUserId = get().user?.id;
      clearLocalActiveSessionId(currentUserId);

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('cash_session_closed_banner_dismissed');
        sessionStorage.removeItem('palomar_greeting_shown');
      }

      try {
        // Use scope: 'local' so the invalidated device only clears its own local tokens
        // without revoking the new device's active session on the server.
        await supabase.auth.signOut({ scope: 'local' });
      } catch (err) {
        console.warn('Local signOut error during forced logout:', err);
      }

      if (activeAvatarObjectUrl) {
        URL.revokeObjectURL(activeAvatarObjectUrl);
        activeAvatarObjectUrl = null;
      }
      if (activeProfileChannel) {
        supabase.removeChannel(activeProfileChannel);
        activeProfileChannel = null;
      }
      activeProfileUserId = null;

      set({
        user: null,
        profile: null,
        loading: false,
        initialized: true,
        error: reasonMessage,
      });
    } finally {
      isForcingLogout = false;
    }
  },

  validateSession: async () => {
    const currentUser = get().user;
    if (
      !currentUser?.id ||
      isClaimingSession ||
      isForcingLogout ||
      isLoginInProgress ||
      isTemporaryAuthFlowRoute()
    ) {
      return true;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return true;
    }

    try {
      const {
        data: { user: serverUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        if (isTransientNetworkError(userError)) {
          return true;
        }
        await get().forceSessionLogout(
          'Your session is no longer valid because your account was signed in on another device.'
        );
        return false;
      }

      if (!serverUser) {
        await get().forceSessionLogout(
          'Your session is no longer valid because your account was signed in on another device.'
        );
        return false;
      }

      const remoteSessionId = serverUser.user_metadata?.active_session_id;
      const localSessionId = getLocalActiveSessionId(serverUser.id);

      if (
        remoteSessionId &&
        (!localSessionId || remoteSessionId !== localSessionId)
      ) {
        await get().forceSessionLogout(
          'Your account was signed in on another device or browser. You have been logged out.'
        );
        return false;
      }

      return true;
    } catch (err) {
      if (isTransientNetworkError(err)) {
        return true;
      }
      return true;
    }
  },

  checkSession: async () => {
    try {
      // Only show full-screen blocking loader on the initial cold boot
      const isAlreadyInitialized = get().initialized;
      if (!isAlreadyInitialized) {
        set({ loading: true, error: null });
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        let activeUser = session.user;

        // Enforce single active session per user (skip on temporary recovery/invite routes)
        if (!isTemporaryAuthFlowRoute()) {
          const isNewOAuthLogin = consumePendingNewLogin();

          if (isNewOAuthLogin) {
            await get().claimActiveSession(activeUser.id);
          } else if (
            !isClaimingSession &&
            !isLoginInProgress &&
            (typeof navigator === 'undefined' || navigator.onLine)
          ) {
            const {
              data: { user: verifiedUser },
              error: verifyError,
            } = await supabase.auth.getUser();

            if (verifyError) {
              if (!isTransientNetworkError(verifyError)) {
                await get().forceSessionLogout(
                  'Your session is no longer valid because your account was signed in on another device.'
                );
                return;
              }
            } else if (!verifiedUser) {
              await get().forceSessionLogout(
                'Your session is no longer valid because your account was signed in on another device.'
              );
              return;
            } else {
              activeUser = verifiedUser;
              const remoteSessionId =
                verifiedUser.user_metadata?.active_session_id;
              const localSessionId = getLocalActiveSessionId(verifiedUser.id);

              if (!remoteSessionId) {
                // First time initializing single-session token for this session
                await get().claimActiveSession(verifiedUser.id);
              } else if (
                !localSessionId ||
                remoteSessionId !== localSessionId
              ) {
                await get().forceSessionLogout(
                  'Your account was signed in on another device or browser. You have been logged out.'
                );
                return;
              }
            }
          }
        }

        // Evaluate using the centralized case-insensitive helper
        const isSuperAdminUser = isSuperAdmin(activeUser.email);
        let dbProfile: any = null;

        // 1. Validation: Fetch or fallback profile from public.profiles
        if (!isSuperAdminUser) {
          try {
            const { data, error: dbError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', activeUser.id)
              .maybeSingle();

            if (!dbError && data) {
              dbProfile = data;
            } else if (!data && !dbError) {
              // Auto-create missing profile row if user was registered via auth directly
              try {
                const autoRole = (
                  activeUser.app_metadata?.role ||
                  activeUser.user_metadata?.role ||
                  'admin'
                ).toLowerCase();
                const { data: createdProfile } = await supabase
                  .from('profiles')
                  .insert({
                    id: activeUser.id,
                    username:
                      activeUser.user_metadata?.full_name ||
                      activeUser.user_metadata?.username ||
                      activeUser.email?.split('@')[0] ||
                      'User',
                    role: autoRole === 'staff' ? 'staff' : 'admin',
                    status: 'active',
                  })
                  .select()
                  .maybeSingle();

                if (createdProfile) {
                  dbProfile = createdProfile;
                }
              } catch {
                // Ignore background insertion error, proceed with auth metadata fallback
              }
            }
          } catch (fetchErr) {
            console.warn(
              'Could not load profile from database, falling back to auth metadata:',
              fetchErr
            );
          }
        }

        // If explicitly deactivated in DB profile, sign out
        if (dbProfile?.status === 'inactive') {
          clearLocalActiveSessionId(activeUser.id);
          await supabase.auth.signOut({ scope: 'local' });
          if (activeAvatarObjectUrl) {
            URL.revokeObjectURL(activeAvatarObjectUrl);
            activeAvatarObjectUrl = null;
          }
          if (activeProfileChannel) {
            supabase.removeChannel(activeProfileChannel);
            activeProfileChannel = null;
          }
          activeProfileUserId = null;
          set({
            user: null,
            profile: null,
            loading: false,
            initialized: true,
            error: 'Account suspended',
          });
          return;
        }

        // 2. Resolve account attributes with Superadmin taking absolute priority
        const rawRole = (
          dbProfile?.role ||
          activeUser.app_metadata?.role ||
          activeUser.user_metadata?.role ||
          'admin'
        ).toLowerCase();
        const userRole = isSuperAdminUser
          ? 'admin'
          : rawRole === 'admin'
            ? 'admin'
            : 'staff';

        // Superadmin status always resolves to active; other accounts default to active unless specified
        const userStatus = isSuperAdminUser
          ? 'active'
          : dbProfile?.status || activeUser.user_metadata?.status || 'active';

        const metadataAvatarPath =
          dbProfile?.avatar_url || activeUser.user_metadata?.avatar_url || '';
        let localAvatarBlobUrl = '';

        // Dynamically resolve private file storage as local blob URLs
        if (metadataAvatarPath) {
          if (!metadataAvatarPath.startsWith('http')) {
            try {
              const { data: imageBlob, error: downloadError } =
                await supabase.storage
                  .from('avatars')
                  .download(metadataAvatarPath);

              if (!downloadError && imageBlob) {
                // Revoke old reference to prevent browser memory leaks
                if (activeAvatarObjectUrl) {
                  URL.revokeObjectURL(activeAvatarObjectUrl);
                }
                localAvatarBlobUrl = URL.createObjectURL(imageBlob);
                activeAvatarObjectUrl = localAvatarBlobUrl;
              }
            } catch (err) {
              console.error('Failed to download secure avatar file:', err);
            }
          } else {
            localAvatarBlobUrl = metadataAvatarPath;
          }
        }

        // Only establish Realtime subscription if not superadmin
        if (!isSuperAdminUser && activeProfileUserId !== activeUser.id) {
          if (activeProfileChannel) {
            supabase.removeChannel(activeProfileChannel);
          }

          activeProfileUserId = activeUser.id;
          activeProfileChannel = supabase
            .channel(`profile-sync-${activeUser.id}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${activeUser.id}`,
              },
              async (payload: any) => {
                const rawAvatar = payload.new.avatar_url || '';
                let resolvedBlobUrl = '';

                if (rawAvatar && !rawAvatar.startsWith('http')) {
                  try {
                    const { data: imageBlob } = await supabase.storage
                      .from('avatars')
                      .download(rawAvatar);
                    if (imageBlob) {
                      resolvedBlobUrl = URL.createObjectURL(imageBlob);
                    }
                  } catch (err) {
                    console.error(
                      'Failed to resolve raw avatar inside realtime event:',
                      err
                    );
                  }
                } else {
                  resolvedBlobUrl = rawAvatar;
                }

                // Instantly update the state when status, role, username, or photo is modified in real-time
                set((state) => ({
                  profile: state.profile
                    ? {
                        ...state.profile,
                        username: payload.new.username,
                        role: payload.new.role,
                        status: payload.new.status,
                        avatar_url: resolvedBlobUrl,
                        email_verification_enabled:
                          payload.new.email_verification_enabled ??
                          state.profile.email_verification_enabled,
                      }
                    : null,
                }));
              }
            )
            .subscribe();
        }

        // 3. Client-Side Account Activation Trigger (Non-blocking)
        // Any user entering the system/admin page should immediately have their status set to Active and no longer pending
        let effectiveStatus = userStatus;
        if (userStatus === 'pending') {
          effectiveStatus = 'active';
          supabase
            .from('profiles')
            .update({ status: 'active' })
            .eq('id', activeUser.id)
            .then(({ error }) => {
              if (error) {
                console.error('Failed to auto-activate pending profile:', error);
              }
            });
        }

        set({
          user: activeUser,
          profile: {
            id: activeUser.id,
            username: isSuperAdminUser
              ? 'SUPERADMIN'
              : dbProfile?.username ||
                activeUser.user_metadata?.full_name ||
                activeUser.user_metadata?.username ||
                activeUser.email?.split('@')[0] ||
                'User',
            role: userRole as 'admin' | 'staff',
            status: effectiveStatus as 'active' | 'pending' | 'inactive',
            avatar_url: localAvatarBlobUrl,
            email_verification_enabled:
              dbProfile?.email_verification_enabled ??
              activeUser.user_metadata?.email_verification_enabled ??
              false,
          },
          loading: false,
          initialized: true,
        });
      } else {
        // Clean up memory and subscriptions on logout
        if (activeAvatarObjectUrl) {
          URL.revokeObjectURL(activeAvatarObjectUrl);
          activeAvatarObjectUrl = null;
        }
        if (activeProfileChannel) {
          supabase.removeChannel(activeProfileChannel);
          activeProfileChannel = null;
        }
        activeProfileUserId = null;
        set({ user: null, profile: null, loading: false, initialized: true });
      }
    } catch (err: any) {
      console.error('Session check failed:', err.message);
      set({
        user: null,
        profile: null,
        loading: false,
        initialized: true,
        error: err.message,
      });
    }
  },

  signInWithGoogle: async () => {
    try {
      set({ loading: true, error: null });
      markPendingNewLogin();
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'com.wolfpalomar.gymmanagement://login'
        : buildAppUrl('/dashboard');

      if (isNative) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        if (data?.url) {
          await Browser.open({ url: data.url, windowName: '_system' });
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      set({ loading: false, error: err.message });
    }
  },

  logout: async () => {
    const currentUserId = get().user?.id;
    set({ loading: true });
    clearLocalActiveSessionId(currentUserId);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('cash_session_closed_banner_dismissed');
    }
    await supabase.auth.signOut({ scope: 'local' });
    if (activeAvatarObjectUrl) {
      URL.revokeObjectURL(activeAvatarObjectUrl);
      activeAvatarObjectUrl = null;
    }
    if (activeProfileChannel) {
      supabase.removeChannel(activeProfileChannel);
      activeProfileChannel = null;
    }
    activeProfileUserId = null;
    set({ user: null, profile: null, loading: false, error: null });
  },
}));

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    const isSuperAdminUser = isSuperAdmin(session?.user?.email);

    // Safely update user credentials directly to bypass database schema checks on restricted recovery tokens
    useAuthStore.setState({
      user: session?.user || null,
      profile: session?.user
        ? {
            id: session.user.id,
            username:
              session.user.user_metadata?.full_name ||
              session.user.email?.split('@')[0] ||
              'User',
            role: isSuperAdminUser ? 'admin' : 'staff', // Force admin role if superadmin during password recovery
            status: 'active',
            avatar_url: session.user.user_metadata?.avatar_url || '',
          }
        : null,
      loading: false,
      initialized: true,
    });
  } else if (event === 'SIGNED_OUT') {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('cash_session_closed_banner_dismissed');
    }
    // Clear cached session parameters
    useAuthStore.setState({
      user: null,
      profile: null,
      loading: false,
      initialized: true,
    });
  } else if (event === 'TOKEN_REFRESHED') {
    // Background token refresh: verify single active session and update user session quietly
    if (session?.user) {
      const remoteSessionId = session.user.user_metadata?.active_session_id;
      const localSessionId = getLocalActiveSessionId(session.user.id);
      if (
        !isClaimingSession &&
        !isLoginInProgress &&
        remoteSessionId &&
        (!localSessionId || remoteSessionId !== localSessionId)
      ) {
        await useAuthStore
          .getState()
          .forceSessionLogout(
            'Your account was signed in on another device or browser. You have been logged out.'
          );
        return;
      }
      useAuthStore.setState({ user: session.user });
    }
  } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    if (isLoginInProgress || isClaimingSession) {
      return;
    }
    if (session?.user) {
      const currentUser = useAuthStore.getState().user;
      // Only do a heavy check if user ID actually changed or if user explicitly updated profile
      if (!currentUser || currentUser.id !== session.user.id || event === 'USER_UPDATED') {
        await useAuthStore.getState().checkSession();
      } else {
        useAuthStore.setState({ user: session.user });
      }
    }
  }
});