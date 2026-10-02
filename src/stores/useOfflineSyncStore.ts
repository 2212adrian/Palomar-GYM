// src/stores/useOfflineSyncStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { logAudit } from '../lib/supabase/audit';
import { getServerISOString } from '../lib/serverTime';

export type PendingSyncActionType =
  | 'attendance_checkin'
  | 'attendance_payment_status'
  | 'attendance_delete';

export interface PendingSyncItem {
  id: string;
  action: PendingSyncActionType;
  label: string;
  payload: Record<string, any>;
  createdAt: string;
  retryCount: number;
}

interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingQueue: PendingSyncItem[];
  lastSyncedAt: string | null;
  syncError: string | null;
  setOnlineStatus: (online: boolean) => void;
  markSyncStart: () => void;
  markSyncComplete: (error?: string | null) => void;
  enqueueMutation: (
    item: Omit<PendingSyncItem, 'id' | 'createdAt' | 'retryCount'>
  ) => PendingSyncItem;
  removeQueueItem: (id: string) => void;
  flushQueue: () => Promise<{ synced: number; remaining: number }>;
  refreshQueueFromStorage: () => void;
}

const QUEUE_STORAGE_KEY = 'palomar_offline_sync_queue_v1';
const LAST_SYNC_STORAGE_KEY = 'palomar_last_synced_at_v1';

const loadStoredQueue = (): PendingSyncItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveQueueToStorage = (queue: PendingSyncItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Failed to persist offline sync queue:', e);
  }
};

const loadLastSyncedAt = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_SYNC_STORAGE_KEY);
  } catch {
    return null;
  }
};

const saveLastSyncedAt = (iso: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, iso);
  } catch {
    // ignore
  }
};

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingQueue: loadStoredQueue(),
  lastSyncedAt: loadLastSyncedAt(),
  syncError: null,

  setOnlineStatus: (online: boolean) => {
    set({ isOnline: online });
    if (online && get().pendingQueue.length > 0) {
      get().flushQueue();
    }
  },

  markSyncStart: () => {
    set({ isSyncing: true, syncError: null });
  },

  markSyncComplete: (error = null) => {
    const nowIso = getServerISOString();
    if (!error) {
      saveLastSyncedAt(nowIso);
      set({ isSyncing: false, lastSyncedAt: nowIso, syncError: null });
    } else {
      set({ isSyncing: false, syncError: error });
    }
  },

  refreshQueueFromStorage: () => {
    set({
      pendingQueue: loadStoredQueue(),
      lastSyncedAt: loadLastSyncedAt(),
    });
  },

  enqueueMutation: (item) => {
    const newItem: PendingSyncItem = {
      ...item,
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: getServerISOString(),
      retryCount: 0,
    };
    const updated = [...get().pendingQueue, newItem];
    saveQueueToStorage(updated);
    set({ pendingQueue: updated });
    return newItem;
  },

  removeQueueItem: (id: string) => {
    const updated = get().pendingQueue.filter((i) => i.id !== id);
    saveQueueToStorage(updated);
    set({ pendingQueue: updated });
  },

  flushQueue: async () => {
    const state = get();
    if (state.isSyncing) {
      return { synced: 0, remaining: state.pendingQueue.length };
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      set({ isOnline: false });
      return { synced: 0, remaining: state.pendingQueue.length };
    }

    const currentQueue = loadStoredQueue();
    if (currentQueue.length === 0) {
      const nowIso = getServerISOString();
      saveLastSyncedAt(nowIso);
      set({
        pendingQueue: [],
        isSyncing: false,
        lastSyncedAt: nowIso,
        syncError: null,
      });
      return { synced: 0, remaining: 0 };
    }

    set({ isSyncing: true, syncError: null });
    const remainingItems: PendingSyncItem[] = [];
    let syncedCount = 0;
    let lastErr: string | null = null;

    for (const item of currentQueue) {
      try {
        if (item.action === 'attendance_checkin') {
          const { insertPayload, auditDescription } = item.payload;
          const { data: inserted, error } = await supabase
            .from('attendance')
            .insert([insertPayload])
            .select()
            .single();

          if (error) throw error;

          if (auditDescription && inserted?.id) {
            logAudit(
              'ATTENDANCE_CHECKIN',
              `${auditDescription} [Synced from Offline Cache]`,
              String(inserted.id)
            ).catch(() => {});
          }
          syncedCount++;
        } else if (item.action === 'attendance_payment_status') {
          const { recordId, paymentStatus, updatedAt } = item.payload;
          const { error } = await supabase
            .from('attendance')
            .update({
              payment_status: paymentStatus,
              updated_at: updatedAt || getServerISOString(),
            })
            .eq('id', recordId);

          if (error) throw error;
          syncedCount++;
        } else if (item.action === 'attendance_delete') {
          const { recordId, deletedAt, deletedBy } = item.payload;
          const { error } = await supabase
            .from('attendance')
            .update({
              deleted_at: deletedAt || getServerISOString(),
              deleted_by: deletedBy || null,
            })
            .eq('id', recordId);

          if (error) throw error;
          syncedCount++;
        }
      } catch (err: any) {
        lastErr = err?.message || 'Pending upload to Supabase';
        remainingItems.push({
          ...item,
          retryCount: (item.retryCount || 0) + 1,
        });
      }
    }

    saveQueueToStorage(remainingItems);
    const nowIso = getServerISOString();
    if (remainingItems.length === 0) {
      saveLastSyncedAt(nowIso);
    }

    set({
      pendingQueue: remainingItems,
      isSyncing: false,
      lastSyncedAt: remainingItems.length === 0 ? nowIso : get().lastSyncedAt,
      syncError: lastErr,
    });

    if (syncedCount > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('palomar_logbook_updated'));
    }

    return { synced: syncedCount, remaining: remainingItems.length };
  },
}));

// Auto-attach online/offline listeners in browser environment
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOfflineSyncStore.getState().setOnlineStatus(true);
  });
  window.addEventListener('offline', () => {
    useOfflineSyncStore.getState().setOnlineStatus(false);
  });
  window.addEventListener('storage', (e) => {
    if (e.key === QUEUE_STORAGE_KEY || e.key === LAST_SYNC_STORAGE_KEY) {
      useOfflineSyncStore.getState().refreshQueueFromStorage();
    }
  });
}
