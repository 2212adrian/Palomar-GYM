// src/App.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppRoutes } from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Component Imports
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';

// Capacitor and Supabase Imports
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from './lib/supabase/client';

import { promptInitialPermissionsOnLogin } from './lib/permissions';

export const App: React.FC = () => {
  const checkSession = useAuthStore((state) => state.checkSession);
  const user = useAuthStore((state) => state.user);

  // State to manage the exit confirmation modal
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  // Ref to track modal state inside the persistent listener closure
  const isExitModalOpenRef = useRef(isExitModalOpen);

  // Keep the ref up-to-date with state changes
  useEffect(() => {
    isExitModalOpenRef.current = isExitModalOpen;
  }, [isExitModalOpen]);

  // Prompt camera and notification permissions immediately upon login
  useEffect(() => {
    if (user?.id) {
      const askedKey = `palomar_perm_asked_${user.id}`;
      const alreadyAsked = sessionStorage.getItem(askedKey);
      if (!alreadyAsked) {
        sessionStorage.setItem(askedKey, 'true');
        promptInitialPermissionsOnLogin().catch((err) => {
          console.warn('Initial permissions prompt handled:', err);
        });
      }
    }
  }, [user?.id]);

  // Global Theme Initialization (Survives hard page refreshes on protected routes)
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
    const activeTheme =
      saved === 'dark' || saved === 'light'
        ? saved
        : systemPrefersDark
          ? 'dark'
          : 'light';

    const root = document.documentElement;
    root.classList.toggle('dark', activeTheme === 'dark');
    root.classList.toggle('light', activeTheme === 'light');
  }, []);

  useEffect(() => {
    // Automatically retrieve the session state on page load/mount
    checkSession();
  }, [checkSession]);

  // ─── Native Back Button Listener with Modal Dialog ───
  useEffect(() => {
    // Only register the back button listener on native platforms (Android/iOS)
    if (!Capacitor.isNativePlatform()) return;

    let activeBackButtonListener: any;

    const setupBackButtonListener = async () => {
      activeBackButtonListener = await CapApp.addListener(
        'backButton',
        ({ canGoBack }) => {
          const currentPath = window.location.pathname;

          // Define route paths where hitting the Android back button should prompt an exit dialog
          const rootPaths = ['/', '/login', '/dashboard'];

          // If the confirmation modal is already open, pressing back will close it
          if (isExitModalOpenRef.current) {
            setIsExitModalOpen(false);
          } else if (!canGoBack || rootPaths.includes(currentPath)) {
            // Open the exit confirmation modal instead of shutting down immediately
            setIsExitModalOpen(true);
          } else {
            window.history.back();
          }
        }
      );
    };

    setupBackButtonListener();

    return () => {
      if (activeBackButtonListener) {
        activeBackButtonListener.remove();
      }
    };
  }, []);

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

      {/* Toast Notification Layer */}
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

      {/* Exit Confirmation Modal */}
      <Modal
        isOpen={isExitModalOpen}
        onClose={() => setIsExitModalOpen(false)}
        title="Exit App"
        className="max-w-xs text-center p-6"
      >
        <p className="text-sm font-body text-slate-600 dark:text-slate-400 mt-2">
          Are you sure you want to close the application?
        </p>
        <div className="flex gap-3 mt-4">
          <Button variant="secondary" onClick={() => setIsExitModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => CapApp.exitApp()}>
            Exit
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default App;
