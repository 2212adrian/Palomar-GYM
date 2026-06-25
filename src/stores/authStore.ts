import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
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
  loading: true,
  initialized: false,
  error: null,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  checkSession: async () => {
    try {
      set({ loading: true, error: null });

      // 1. Intercept OAuth error parameters from hash or query string
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const queryParams = new URLSearchParams(window.location.search);
      
      const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
      const errorCode = hashParams.get('error_code') || queryParams.get('error_code');

      if (errorDesc) {
        // Clean the URL immediately so the hash parameters don't linger in the browser bar
        window.history.replaceState(null, '', window.location.pathname);
        
        let friendlyError = errorDesc.replace(/\+/g, ' ');
        if (errorCode === 'signup_disabled') {
          friendlyError = 'ACCESS DENIED: This account has not been registered. Please contact an administrator.';
        }
        
        set({ 
          user: null, 
          loading: false, 
          initialized: true, 
          error: friendlyError 
        });
        return;
      }

      // 2. Proceed with standard Supabase session check if no URL error exists
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        set({
          user: session.user,
          loading: false,
          initialized: true,
        });
      } else {
        set({ user: null, loading: false, initialized: true });
      }
    } catch (err: any) {
      console.error('Session check failed:', err.message);
      set({ user: null, loading: false, initialized: true, error: err.message });
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
    set({ user: null, loading: false, error: null });
  },
}));