// src/App.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppRoutes } from './routes';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Component Imports
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';

// Capacitor and Supabase Imports
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from './lib/supabase/client';

import { promptInitialPermissionsOnLogin } from './lib/permissions';
import { fetchLatestRelease, reloadPwaApp } from './lib/appUpdateService';
import { WhatsNewModal } from './components/ui/WhatsNewModal';
import pkg from '../package.json';

export const App: React.FC = () => {
  const checkSession = useAuthStore((state) => state.checkSession);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

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

  // ─── Real-Time Session Revocation Listener (Instant Remote Auto-Kick) ───
  useEffect(() => {
    if (!user?.id) return;

    // Connect to WebSocket broadcast channel for global session control
    const sessionSyncChannel = supabase
      .channel('user-session-sync')
      .on('broadcast', { event: 'FORCE_SIGNOUT_USER' }, async ({ payload }) => {
        // If the terminated user is this logged-in account, kick immediately
        if (payload?.userId === user.id) {
          toast.error('Your session has been terminated by an administrator.', {
            toastId: 'session-terminated',
            autoClose: 5000,
          });

          try {
            // Sign out from Supabase client and wipe storage
            await supabase.auth.signOut();
          } catch (err) {
            console.warn('SignOut error during forced kick:', err);
          }

          if (logout) {
            logout();
          }

          // Redirect immediately to login screen
          window.location.href = '/login';
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionSyncChannel);
    };
  }, [user?.id, logout]);

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

  // ─── PWA Out-of-Date Detection & Refresh Handling ───
  useEffect(() => {
    // Only applies to PWA / Web browser mode
    if (Capacitor.isNativePlatform()) return;

    let isSubscribed = true;

    // 1. Listen for new service worker controlling the page
    if ('serviceWorker' in navigator) {
      const handleControllerChange = () => {
        toast.info(
          ({ closeToast }) => (
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="font-bold">App update applied</span>
              <span className="text-[11px] text-slate-300">
                A new version has loaded in the background. Refresh to activate.
              </span>
              <button
                type="button"
                onClick={async () => {
                  closeToast();
                  await reloadPwaApp();
                }}
                className="mt-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[10px] uppercase tracking-wider self-start cursor-pointer shadow-xs"
              >
                Refresh Page
              </button>
            </div>
          ),
          {
            toastId: 'pwa-controller-changed',
            autoClose: false,
            closeOnClick: false,
          }
        );
      };

      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleControllerChange
      );
    }

    // 2. Periodic release check against Supabase app_releases
    const checkPwaVersion = async () => {
      if (!isSubscribed) return;
      try {
        const remote = await fetchLatestRelease(pkg.version, 'web');
        if (remote?.isNewer) {
          toast.info(
            ({ closeToast }) => (
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="font-bold">
                  New update available (v{remote.version})
                </span>
                <span className="text-[11px] text-slate-300">
                  Your web app is running v{pkg.version}. A newer build (v
                  {remote.version}) is ready.
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    closeToast();
                    await reloadPwaApp();
                  }}
                  className="mt-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[10px] uppercase tracking-wider self-start cursor-pointer shadow-xs"
                >
                  Refresh Page
                </button>
              </div>
            ),
            {
              toastId: 'pwa-version-outdated',
              autoClose: false,
              closeOnClick: false,
            }
          );
        }
      } catch (err) {
        console.debug('[PWA] Version check deferred:', err);
      }
    };

    const initialTimer = setTimeout(checkPwaVersion, 4000);
    const intervalTimer = setInterval(checkPwaVersion, 20 * 60 * 1000);

    return () => {
      isSubscribed = false;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

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
          // Close the system browser tab used for OAuth
          try {
            await Browser.close();
          } catch {
            // Already closed or not applicable
          }

          const url = new URL(data.url);

          // 1. Support PKCE authorization code exchange (Supabase v2 standard)
          const code = url.searchParams.get('code');
          if (code) {
            const { data: sessionData, error } =
              await supabase.auth.exchangeCodeForSession(code);
            if (!error && sessionData?.session) {
              window.location.href = '/dashboard';
              return;
            }
          }

          // 2. Support implicit hash tokens (#access_token=...&refresh_token=...)
          const rawHash = url.hash.startsWith('#')
            ? url.hash.substring(1)
            : url.hash;
          const hashParams = new URLSearchParams(rawHash);

          const access_token =
            hashParams.get('access_token') ||
            url.searchParams.get('access_token');
          const refresh_token =
            hashParams.get('refresh_token') ||
            url.searchParams.get('refresh_token');

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

      {/* Post-Update Release Notes ("What's New") */}
      <WhatsNewModal />

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
