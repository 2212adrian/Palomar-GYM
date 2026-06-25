import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  avatar_url?: string;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,
  error: null,

  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  checkSession: async () => {
    try {
      set({ loading: true, error: null });
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        // Fetch custom profile containing the user's role
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, role, avatar_url')
          .eq('id', session.user.id)
          .single();

        // BLOCK REGISTER POLICY: If user authenticated but has no pre-registered profile
        if (profileError || !profileData) {
          console.warn('Unauthorized access attempt: No registered profile found.');
          await supabase.auth.signOut();
          set({ 
            user: null, 
            profile: null, 
            loading: false, 
            initialized: true, 
            error: 'ACCESS DENIED: This account has not been registered. Please contact an administrator.' 
          });
          return;
        }

        set({
          user: session.user,
          profile: profileData as UserProfile,
          loading: false,
          initialized: true,
        });
      } else {
        set({ user: null, profile: null, loading: false, initialized: true });
      }
    } catch (err: any) {
      console.error('Session restoration failed:', err.message);
      set({ user: null, profile: null, loading: false, initialized: true, error: err.message });
    }
  },

  logout: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    set({ user: null, profile: null, loading: false, error: null });
  },
}));