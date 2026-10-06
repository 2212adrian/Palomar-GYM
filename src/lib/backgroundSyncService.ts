// src/lib/backgroundSyncService.ts
import { toast } from 'react-toastify';
import { Network } from '@capacitor/network';
import { useCashSessionStore } from '../stores/useCashSessionStore';

let isInitialized = false;

// Track whether the app was genuinely offline
let isCurrentlyOffline =
  typeof navigator !== 'undefined' ? !navigator.onLine : false;

let offlineDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let onlinePollTimer: ReturnType<typeof setInterval> | null = null;
let isHandlingOnline = false;
let lastRestoredToastTimestamp = 0;
const RESTORED_COOLDOWN_MS = 8000;

/**
 * Automatically closes the active session when offline,
 * and restores it to its original state when connection returns.
 */
export function initBackgroundSyncService(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }
  isInitialized = true;

  const stopPolling = () => {
    if (onlinePollTimer) {
      clearInterval(onlinePollTimer);
      onlinePollTimer = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    // Actively poll every 2s while offline so Windows/Chromium 
    // network restoration is caught even if the browser event is delayed
    onlinePollTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        handleOnline();
      }
    }, 2000);
  };

  const handleOnline = async () => {
    // 1. Cancel any pending offline trigger and stop polling
    if (offlineDebounceTimer) {
      clearTimeout(offlineDebounceTimer);
      offlineDebounceTimer = null;
    }
    stopPolling();

    // 2. ALWAYS dismiss the red offline restriction toast immediately
    toast.dismiss('offline-restricted');

    // 3. If we are already running restoration or were never marked offline, stop here
    if (!isCurrentlyOffline || isHandlingOnline) {
      return;
    }

    isHandlingOnline = true;
    isCurrentlyOffline = false;

    try {
      const wasSuspended = useCashSessionStore.getState().wasSuspendedByOffline;

      // Restore active session and drawer balance from Supabase
      await useCashSessionStore.getState().restoreSessionAfterOnline();

      const now = Date.now();
      const isCooldownActive = now - lastRestoredToastTimestamp < RESTORED_COOLDOWN_MS;
      const isToastAlreadyActive = toast.isActive('online-restored');

      // 4. Show success / restored toast once only
      if (!isCooldownActive && !isToastAlreadyActive) {
        lastRestoredToastTimestamp = now;

        if (wasSuspended && useCashSessionStore.getState().isSessionOpen) {
          toast.success(
            'Internet connection restored. Cash drawer session has been reopened to its original state.',
            {
              toastId: 'online-restored',
              autoClose: 4000,
            }
          );
        } else {
          toast.info('Internet connection restored. Live sync active.', {
            toastId: 'online-restored',
            autoClose: 4000,
          });
        }
      }
    } catch (err) {
      console.warn('Background sync restore error:', err);
    } finally {
      isHandlingOnline = false;
    }
  };

  const handleOffline = () => {
    // 1000ms debounce: ignores momentary network handshakes/switching
    if (offlineDebounceTimer) clearTimeout(offlineDebounceTimer);

    offlineDebounceTimer = setTimeout(() => {
      if (isCurrentlyOffline) return;
      isCurrentlyOffline = true;

      // Start active polling to detect restoration immediately
      startPolling();

      const isSessionOpen = useCashSessionStore.getState().isSessionOpen;
      if (isSessionOpen) {
        useCashSessionStore.getState().suspendSessionForOffline();
        toast.error(
          'No internet connection. Active cash session has been automatically closed to restrict transactions.',
          {
            toastId: 'offline-restricted',
            autoClose: false,
          }
        );
      } else {
        toast.error(
          'No internet connection. Transactions and updates are restricted.',
          {
            toastId: 'offline-restricted',
            autoClose: false,
          }
        );
      }
    }, 1000);
  };

  // Re-check status when user returns/focuses the app window
  const handleWindowFocus = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      if (isCurrentlyOffline || toast.isActive('offline-restricted')) {
        handleOnline();
      }
    }
  };

  // Browser listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', handleWindowFocus);

  // Capacitor Network listener
  let capListener: any = null;
  try {
    Network.addListener('networkStatusChange', (status) => {
      if (!status.connected) {
        handleOffline();
      } else {
        handleOnline();
      }
    })
      .then((l) => {
        capListener = l;
      })
      .catch(() => {});
  } catch (_) {}

  return () => {
    isInitialized = false;
    stopPolling();
    if (offlineDebounceTimer) {
      clearTimeout(offlineDebounceTimer);
      offlineDebounceTimer = null;
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleWindowFocus);
    if (capListener && typeof capListener.remove === 'function') {
      capListener.remove();
    }
  };
}