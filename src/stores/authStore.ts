//src/stores/authStore.ts

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { isSuperAdmin } from '../constants/auth'; // Centralized helper

export interface UserProfile {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  status: 'active' | 'pending' | 'inactive';
  avatar_url?: string; // Will hold the secure, local blob URL
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  checkSession: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Memory leak protection: Track active object URL to revoke before creating a new one
let activeAvatarObjectUrl: string | null = null;
let activeProfileChannel: any = null;
let activeProfileUserId: string | null = null; // Track currently subscribed User ID to prevent duplicate binds

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,
  error: null,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  checkSession: async () => {
    try {
      set({ loading: true, error: null });
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        // Evaluate using the centralized case-insensitive helper
        const isSuperAdminUser = isSuperAdmin(session.user.email);
        let dbProfile: any = null;

        // 1. Validation: Fetch or fallback profile from public.profiles
        if (!isSuperAdminUser) {
          try {
            const { data, error: dbError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();

            if (!dbError && data) {
              dbProfile = data;
            } else if (!data && !dbError) {
              // Auto-create missing profile row if user was registered via auth directly
              try {
                const autoRole = (
                  session.user.app_metadata?.role ||
                  session.user.user_metadata?.role ||
                  'admin'
                ).toLowerCase();
                const { data: createdProfile } = await supabase
                  .from('profiles')
                  .insert({
                    id: session.user.id,
                    username:
                      session.user.user_metadata?.full_name ||
                      session.user.user_metadata?.username ||
                      session.user.email?.split('@')[0] ||
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
          await supabase.auth.signOut();
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
          session.user.app_metadata?.role ||
          session.user.user_metadata?.role ||
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
          : dbProfile?.status || session.user.user_metadata?.status || 'active';

        const metadataAvatarPath =
          dbProfile?.avatar_url || session.user.user_metadata?.avatar_url || '';
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
        if (!isSuperAdminUser && activeProfileUserId !== session.user.id) {
          if (activeProfileChannel) {
            supabase.removeChannel(activeProfileChannel);
          }

          activeProfileUserId = session.user.id;
          activeProfileChannel = supabase
            .channel(`profile-sync-${session.user.id}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${session.user.id}`,
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
                      }
                    : null,
                }));
              }
            )
            .subscribe();
        }

        // 3. Client-Side Account Activation Trigger (Non-blocking)
        if (userStatus === 'pending' && !isSuperAdminUser) {
          supabase
            .from('profiles')
            .update({ status: 'active' })
            .eq('id', session.user.id)
            .then(() => {});
        }

        set({
          user: session.user,
          profile: {
            id: session.user.id,
            username: isSuperAdminUser
              ? 'SUPERADMIN'
              : dbProfile?.username ||
                session.user.user_metadata?.full_name ||
                session.user.user_metadata?.username ||
                session.user.email?.split('@')[0] ||
                'User',
            role: userRole as 'admin' | 'staff',
            status: userStatus as 'active' | 'pending' | 'inactive',
            avatar_url: localAvatarBlobUrl,
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      set({ loading: false, error: err.message });
    }
  },

  logout: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
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
    // Clear cached session parameters
    useAuthStore.setState({
      user: null,
      profile: null,
      loading: false,
      initialized: true,
    });
  } else if (
    event === 'SIGNED_IN' ||
    event === 'TOKEN_REFRESHED' ||
    event === 'USER_UPDATED'
  ) {
    if (session?.user) {
      await useAuthStore.getState().checkSession();
    }
  }
});
