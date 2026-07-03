//src/stores/authStore.ts

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';

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

export const useAuthStore = create<AuthState>((set, get) => ({
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
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        const isSuperAdmin = session.user.email === 'wolf.palomar@gmail.com';
        let dbProfile: any = null;

        // 1. Validation: Verify if their profile actually exists inside public.profiles
        if (!isSuperAdmin) {
          const { data, error: dbError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          // If the profile row is missing, the account was deleted. Force immediate logout.
          if (dbError || !data) {
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
            set({ user: null, profile: null, loading: false, initialized: true });
            return;
          }
          dbProfile = data;
        }

        // 2. Resolve account attributes using database values as priority, falling back to JWT claims
        const userRole = dbProfile?.role || 
                         session.user.app_metadata?.role || 
                         (isSuperAdmin ? 'admin' : 'staff');

        // Superadmin status always resolves to active; other accounts load from DB with a pending fallback
        const userStatus = isSuperAdmin 
          ? 'active' 
          : (dbProfile?.status || session.user.user_metadata?.status || 'pending');

        const metadataAvatarPath = dbProfile?.avatar_url || 
                                   session.user.user_metadata?.avatar_url || '';
        let localAvatarBlobUrl = '';

        // Dynamically resolve private file storage as local blob URLs
        if (metadataAvatarPath) {
          if (!metadataAvatarPath.startsWith('http')) {
            try {
              const { data: imageBlob, error: downloadError } = await supabase.storage
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

        // Only establish Realtime subscription if not already subscribed for this user ID
        if (activeProfileUserId !== session.user.id) {
          if (activeProfileChannel) {
            supabase.removeChannel(activeProfileChannel);
          }
          
          activeProfileUserId = session.user.id;
          activeProfileChannel = supabase
            .channel(`profile-sync-${session.user.id}`)
            .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
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
                    console.error('Failed to resolve raw avatar inside realtime event:', err);
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
                    : null
                }));
              }
            )
            .subscribe();
        }

        // 3. Client-Side Account Activation Trigger (Bypasses background database trigger lock errors)
        if (userStatus === 'pending' && !isSuperAdmin) {
          await supabase.from('profiles').update({ status: 'active' }).eq('id', session.user.id);
          // Recursively re-run checkSession once status transitions to active
          await get().checkSession();
          return;
        }

        set({
          user: session.user,
          profile: {
            id: session.user.id,
            username: dbProfile?.username || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
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
      set({ user: null, profile: null, loading: false, initialized: true, error: err.message });
    }
  },

  signInWithGoogle: async () => {
    try {
      set({ loading: true, error: null });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        }
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
    // Safely update user credentials directly to bypass database schema checks on restricted recovery tokens
    useAuthStore.setState({ 
      user: session?.user || null, 
      profile: session?.user ? {
        id: session.user.id,
        username: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
        role: 'staff', // Temporary placeholder for UI rendering on recovery screen
        status: 'active',
        avatar_url: session.user.user_metadata?.avatar_url || ''
      } : null,
      loading: false, 
      initialized: true 
    });
  } else if (event === 'SIGNED_OUT') {
    // Clear cached session parameters
    useAuthStore.setState({ user: null, profile: null });
  }
});