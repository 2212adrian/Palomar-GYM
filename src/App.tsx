// src/App.tsx
import React, { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppRoutes } from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Capacitor and Supabase Imports
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from './lib/supabase/client';

export const App: React.FC = () => {
  const checkSession = useAuthStore((state) => state.checkSession);

  // Global Theme Initialization (Survives hard page refreshes on protected routes)
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const activeTheme = saved === 'dark' || saved === 'light' 
      ? saved 
      : (systemPrefersDark ? 'dark' : 'light');

    const root = document.documentElement;
    root.classList.toggle('dark', activeTheme === 'dark');
    root.classList.toggle('light', activeTheme === 'light');
  }, []);

  useEffect(() => {
    // Automatically retrieve the session state on page load/mount
    checkSession();
  }, [checkSession]);

  // ─── Native Deep Link Listener for Google OAuth ───
  useEffect(() => {
    // Only register deep-linking if on a native platform (Android/iOS)
    if (!Capacitor.isNativePlatform()) return;

    let activeListener: any;

    const setupDeepLinkListener = async () => {
      activeListener = await CapApp.addListener('appUrlOpen', async (data) => {
        try {
          const url = new URL(data.url);
          
          // Parse the hash parameters from the redirect URL (contains tokens)
          const hash = url.hash.substring(1); 
          const params = new URLSearchParams(hash);
          
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            // Initialize session tokens in Supabase
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (!error) {
              // Redirect your router to the main authenticated dashboard
              window.location.href = '/dashboard';
            }
          }
        } catch (err) {
          console.error('Failed to parse deep link URL payload:', err);
        }
      });
    };

    setupDeepLinkListener();

    return () => {
      if (activeListener) {
        activeListener.remove();
      }
    };
  }, []);

  return (
    <>
      <AppRoutes />
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </>
  );
};

export default App;