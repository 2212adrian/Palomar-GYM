// src/stores/useActionQueueStore.ts
import { create } from 'zustand';
import {
  getDecryptedPendingTransactions,
  dropPendingTransaction,
  type DecryptedTransaction,
} from '../lib/offlineVault';
import { executeOfflineSync } from '../lib/backgroundSyncService';
import { triggerHapticButton, triggerHapticFormSuccess } from '../lib/hapticsService';
import { toast } from 'react-toastify';

export interface ActionQueueState {
  queueItems: DecryptedTransaction[];
  queueCount: number;
  isLoading: boolean;
  isSyncing: boolean;
  isDrawerOpen: boolean;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  loadQueue: () => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  triggerManualSync: () => Promise<void>;
  initListeners: () => () => void;
}

export const useActionQueueStore = create<ActionQueueState>((set, get) => ({
  queueItems: [],
  queueCount: 0,
  isLoading: false,
  isSyncing: false,
  isDrawerOpen: false,

  openDrawer: () => {
    triggerHapticButton();
    set({ isDrawerOpen: true });
    get().loadQueue();
  },

  closeDrawer: () => {
    triggerHapticButton();
    set({ isDrawerOpen: false });
  },

  toggleDrawer: () => {
    triggerHapticButton();
    const nextState = !get().isDrawerOpen;
    set({ isDrawerOpen: nextState });
    if (nextState) {
      get().loadQueue();
    }
  },

  loadQueue: async () => {
    set({ isLoading: true });
    try {
      const items = await getDecryptedPendingTransactions();
      set({
        queueItems: items,
        queueCount: items.length,
      });
    } catch (err) {
      console.warn('Failed to load action queue from IndexedDB:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  removeItem: async (id: string) => {
    triggerHapticButton();
    try {
      await dropPendingTransaction(id);
      await get().loadQueue();
      toast.info('Queued action removed from local vault.');
    } catch (err) {
      console.error('Failed to remove queued item:', err);
      toast.error('Could not remove queued action.');
    }
  },

  triggerManualSync: async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      triggerHapticButton();
      toast.warn('Cannot sync: device is currently offline. Will sync when reconnected.');
      return;
    }

    triggerHapticButton();
    set({ isSyncing: true });
    try {
      const res = await executeOfflineSync();
      await get().loadQueue();
      if (res.syncedCount > 0) {
        triggerHapticFormSuccess();
        toast.success(`Successfully synced ${res.syncedCount} queued action(s) to cloud!`);
      } else if (res.conflictCount > 0) {
        toast.warn(`Encountered ${res.conflictCount} conflict(s) during sync.`);
      } else {
        toast.info('All actions are up to date.');
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
      toast.error('Failed to synchronize action queue. Retrying shortly.');
    } finally {
      set({ isSyncing: false });
    }
  },

  initListeners: () => {
    const handleQueueChange = () => {
      get().loadQueue();
    };

    const handleOnline = () => {
      get().loadQueue();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('palomar-action-queue-changed', handleQueueChange);
      window.addEventListener('online', handleOnline);
      window.addEventListener('focus', handleQueueChange);
    }

    // Initial load
    get().loadQueue();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('palomar-action-queue-changed', handleQueueChange);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('focus', handleQueueChange);
      }
    };
  },
}));
