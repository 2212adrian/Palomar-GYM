// src/App.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  useAuthStore,
  getLocalActiveSessionId,
  markPendingNewLogin,
} from './stores/authStore';
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
import { initBackgroundSyncService } from './lib/backgroundSyncService';
import { WhatsNewModal } from './components/ui/WhatsNewModal';
import { OfflineStatus } from './components/common/OfflineStatus';
import { useBatterySaver } from './hooks/useBatterySaver';
import pkg from '../package.json';

// Single deduplicated session toast notification helper
const notifySessionTerminated = (message: string) => {
  if (!toast.isActive('session-terminated')) {
    toast.error(message, {
      toastId: 'session-terminated',
      autoClose: 5000,
    });
  }
};

export const App: React.FC = () => {
  const checkSession = useAuthStore((state) => state.checkSession);
  const validateSession = useAuthStore((state) => state.validateSession);
  const forceSessionLogout = useAuthStore((state) => state.forceSessionLogout);
  const user = useAuthStore((state) => state.user);
  const { isBatterySaver, isAutoTriggered, batteryLevel } = useBatterySaver();
  const autoBatteryNotifiedRef = useRef(false);

  // Notify once when Power Saving Mode is automatically turned on at 20% or under battery
  useEffect(() => {
    if (isAutoTriggered) {
      if (!autoBatteryNotifiedRef.current) {
        autoBatteryNotifiedRef.current = true;
        toast.info(
          `Power Saving Mode automatically turned on${batteryLevel !== null ? ` (${batteryLevel}% battery)` : ''}.`,
          { toastId: 'battery-saver-auto-enabled' }
        );
      }
    } else if (batteryLevel !== null && batteryLevel > 20) {
      autoBatteryNotifiedRef.current = false;
    }
  }, [isAutoTriggered, batteryLevel]);

  // State to manage the exit confirmation modal
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  // Ref to track modal state inside the persistent listener closure
  const isExitModalOpenRef = useRef(isExitModalOpen);

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

  // Background Sync & ServiceWorker coordination for offline transactions & daily session consolidation
  useEffect(() => {
    const cleanup = initBackgroundSyncService();
    return () => {
      cleanup();
    };
  }, []);

  // ─── Real-Time Single Active Session & Revocation Listener ───
  useEffect(() => {
    if (!user?.id) return;

    const sessionSyncChannel = supabase
      .channel('user-session-sync')
      .on('broadcast', { event: 'FORCE_SIGNOUT_USER' }, async ({ payload }) => {
        if (payload?.userId !== user.id) return;

        const localSessionId = getLocalActiveSessionId(user.id);

        // If this broadcast is from a new login claiming a specific sessionId:
        if (payload?.sessionId) {
          if (localSessionId && payload.sessionId === localSessionId) {
            return;
          }

          notifySessionTerminated(
            'Your account was signed in on another device or browser. You have been logged out.'
          );
          await forceSessionLogout();
          return;
        }

        // Administrator manual session termination
        notifySessionTerminated(
          'Your session has been terminated by an administrator.'
        );
        await forceSessionLogout();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const currentLocalSessionId = getLocalActiveSessionId(user.id);
          if (currentLocalSessionId) {
            sessionSyncChannel
              .send({
                type: 'broadcast',
                event: 'FORCE_SIGNOUT_USER',
                payload: {
                  userId: user.id,
                  sessionId: currentLocalSessionId,
                  reason: 'SESSION_REPLACED',
                },
              })
              .catch(() => {});
          }
        }
      });

    return () => {
      supabase.removeChannel(sessionSyncChannel);
    };
  }, [user?.id, forceSessionLogout]);

  // ─── Active Session Validity Heartbeat & Focus Verification ───
  useEffect(() => {
    if (!user?.id) return;

    const verifyCurrentSession = async () => {
      const isValid = await validateSession();
      if (!isValid) {
        notifySessionTerminated(
          'Your account was signed in on another device or browser. You have been logged out.'
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        verifyCurrentSession();
      }
    };

    window.addEventListener('focus', verifyCurrentSession);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = setInterval(
      verifyCurrentSession,
      isBatterySaver ? 30000 : 10000
    );

    return () => {
      window.removeEventListener('focus', verifyCurrentSession);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [user?.id, validateSession, isBatterySaver]);

  // Global Theme Initialization
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
    checkSession();
  }, [checkSession]);

  // ─── PWA Out-of-Date Detection & Refresh Handling ───
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    let isSubscribed = true;

    const handleControllerChange = async () => {
      if (!isSubscribed) return;

      try {
        const remote = await fetchLatestRelease(pkg.version, 'web');
        if (!remote?.isNewer) return;

        toast.dismiss('pwa-version-outdated');

        toast.info(
          ({ closeToast }) => (
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="font-bold">App update applied</span>
              <span className="text-[11px] text-slate-300">
                A new version (v{remote.version}) has loaded in the background.
                Refresh to activate.
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
      } catch (err) {
        console.debug('[PWA] Version check deferred on controller change:', err);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleControllerChange
      );
    }

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

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          handleControllerChange
        );
      }
    };
  }, []);

  // ─── Native Back Button Listener with Modal Dialog ───
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let activeBackButtonListener: any;

    const setupBackButtonListener = async () => {
      activeBackButtonListener = await CapApp.addListener(
        'backButton',
        ({ canGoBack }) => {
          const currentPath = window.location.pathname;
          const rootPaths = ['/', '/login', '/dashboard'];

          if (isExitModalOpenRef.current) {
            setIsExitModalOpen(false);
          } else if (!canGoBack || rootPaths.includes(currentPath)) {
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
    if (!Capacitor.isNativePlatform()) return;

    let activeListener: any;

    const setupDeepLinkListener = async () => {
      activeListener = await CapApp.addListener('appUrlOpen', async (data) => {
        try {
          try {
            await Browser.close();
          } catch {
            // Already closed
          }

          const url = new URL(data.url);
          const code = url.searchParams.get('code');
          if (code) {
            markPendingNewLogin();
            const { data: sessionData, error } =
              await supabase.auth.exchangeCodeForSession(code);
            if (!error && sessionData?.session) {
              window.location.href = '/dashboard';
              return;
            }
          }

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
            markPendingNewLogin();
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (!error) {
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
      {/* Toast Notification Layer - limit={1} prevents stacked duplicate notifications */}
      <ToastContainer
        limit={1}
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

      <WhatsNewModal />
      <OfflineStatus />

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