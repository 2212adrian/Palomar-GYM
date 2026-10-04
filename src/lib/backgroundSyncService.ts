// src/lib/backgroundSyncService.ts
import { useOfflineSyncStore } from '../stores/useOfflineSyncStore';
import { useCashSessionStore } from '../stores/useCashSessionStore';
import { mergeDailySessionsInSupabase } from './sessionMergeService';
import { Network } from '@capacitor/network';
import { toast } from 'react-toastify';

let isInitialized = false;
let isSyncInProgress = false;

/**
 * Registers background sync with ServiceWorker API.
 * When connection is restored, the browser will wake up the service worker and trigger the sync tag.
 */
export async function requestBackgroundSync(tag = 'supabase-background-sync'): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;

  // 1. ServiceWorker SyncManager registration
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        await (registration as any).sync.register(tag);
        console.info(`[BackgroundSync] Registered SW sync tag: "${tag}"`);
        return true;
      }
    } catch (err) {
      console.warn('[BackgroundSync] SyncManager registration skipped:', err);
    }

    // 2. Fallback: Notify ServiceWorker via postMessage
    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'QUEUE_TRANSACTION',
          tag,
          timestamp: Date.now(),
        });
      }
    } catch (_) {}
  }

  return false;
}

/**
 * Triggers queue flushing and runs post-sync routines like daily session consolidation.
 */
export async function triggerBackgroundSyncProcess(): Promise<void> {
  if (isSyncInProgress) return;
  isSyncInProgress = true;

  try {
    const offlineStore = useOfflineSyncStore.getState();
    const queueLength = offlineStore.pendingQueue.length;

    if (queueLength > 0) {
      console.info(`[BackgroundSync] Starting push of ${queueLength} pending transactions to Supabase...`);
      const { synced, remaining } = await offlineStore.flushQueue();

      if (synced > 0) {
        toast.success(`Background sync: Uploaded ${synced} offline transaction(s) to Supabase.`, {
          toastId: 'bg-sync-success',
        });

        // Consolidate any offline cash sessions created today into a unified ended session
        await mergeDailySessionsInSupabase().catch((mergeErr) => {
          console.warn('[BackgroundSync] Session merge notice:', mergeErr);
        });

        // Recalculate cash session metrics & history
        await useCashSessionStore.getState().loadActiveSession();
        await useCashSessionStore.getState().recalculateMetrics();
      }

      if (remaining > 0) {
        console.warn(`[BackgroundSync] ${remaining} items remain in offline queue for next retry.`);
      }
    } else {
      // Even if no local pending queue, check if there are multiple sessions from today to merge
      await mergeDailySessionsInSupabase().catch(() => {});
      await useCashSessionStore.getState().loadActiveSession();
      await useCashSessionStore.getState().recalculateMetrics();
    }
  } catch (err) {
    console.error('[BackgroundSync] Sync process failed:', err);
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Initializes ServiceWorker background sync listener and cross-platform network triggers.
 */
export function initBackgroundSyncService(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // 1. Listen for messages from ServiceWorker (e.g. from sync event)
  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === 'TRIGGER_OFFLINE_SYNC') {
      console.info('[BackgroundSync] Received TRIGGER_OFFLINE_SYNC from ServiceWorker.');
      triggerBackgroundSyncProcess();
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
  }

  // 2. BroadcastChannel coordination across browser tabs
  let broadcastChannel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel('palomar_sync_channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'TRIGGER_OFFLINE_SYNC') {
          triggerBackgroundSyncProcess();
        }
      };
    }
  } catch (_) {}

  // 3. Native Network status listener (Capacitor)
  let capListener: any = null;
  try {
    Network.addListener('networkStatusChange', (status) => {
      if (status.connected) {
        console.info('[BackgroundSync] Device reconnected (Capacitor Network). Triggering sync...');
        triggerBackgroundSyncProcess();
      }
    }).then((l) => {
      capListener = l;
    }).catch(() => {});
  } catch (_) {}

  // 4. Window 'online' and 'visibilitychange' events
  const handleOnline = () => {
    console.info('[BackgroundSync] Window online event detected. Triggering sync...');
    triggerBackgroundSyncProcess();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      triggerBackgroundSyncProcess();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // If already online at startup and pending items exist, trigger sync
  if (navigator.onLine && useOfflineSyncStore.getState().pendingQueue.length > 0) {
    setTimeout(() => {
      triggerBackgroundSyncProcess();
    }, 1500);
  }

  return () => {
    isInitialized = false;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    }
    if (broadcastChannel) {
      broadcastChannel.close();
    }
    if (capListener && typeof capListener.remove === 'function') {
      capListener.remove();
    }
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
