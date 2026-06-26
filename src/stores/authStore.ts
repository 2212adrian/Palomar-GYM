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
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
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
      // 1. Resolve user role directly from auth metadata or fallback to email coordinates 
      // (Bypasses public database table queries entirely so you are never locked out)
      const userRole = session.user.user_metadata?.role || 
                       (session.user.email === 'wolf.palomar@gmail.com' ? 'admin' : 'staff');

      set({
        user: session.user,
        profile: {
          id: session.user.id,
          username: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
          role: userRole as 'admin' | 'staff',
        },
        loading: false,
        initialized: true,
      });
    } else {
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
      // If signups are disabled in the dashboard, Google OAuth will throw an error here
      set({ loading: false, error: err.message });
    }
  },

  logout: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    set({ user: null, loading: false, error: null });
  },
}));