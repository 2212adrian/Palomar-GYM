// src/lib/serverTime.ts
import { supabase } from './supabase/client';

/**
 * Server Time Synchronization Service
 * 
 * Prevents clients from bypassing time-based constraints or backdating/forward-dating records
 * by altering the local computer / device clock.
 * 
 * Computes offset: serverTime - clientLocalTime, adjusting for network latency.
 */

let serverTimeOffsetMs = 0;
let isInitialized = false;
let isSyncing = false;
let lastSyncTimestamp = 0;

export async function syncServerTime(): Promise<number> {
  if (isSyncing) return serverTimeOffsetMs;
  isSyncing = true;

  try {
    const clientStartTime = Date.now();
    const { data, error } = await supabase.rpc('get_server_time');

    if (error || !data) {
      console.warn('Clock synchronization via get_server_time failed, keeping current offset:', error?.message);
      return serverTimeOffsetMs;
    }

    const clientEndTime = Date.now();
    const latency = (clientEndTime - clientStartTime) / 2;
    const serverTimestamp = new Date(data).getTime();

    // Offset is added to Date.now() to get current authoritative server time
    serverTimeOffsetMs = serverTimestamp + latency - clientEndTime;
    lastSyncTimestamp = Date.now();
    isInitialized = true;

    return serverTimeOffsetMs;
  } catch (err) {
    console.warn('Failed to sync server time:', err);
    return serverTimeOffsetMs;
  } finally {
    isSyncing = false;
  }
}

/**
 * Get authoritative server Date object
 */
export function getServerNow(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

/**
 * Get authoritative server timestamp in milliseconds
 */
export function getServerTime(): number {
  return Date.now() + serverTimeOffsetMs;
}

/**
 * Get authoritative ISO 8601 string
 */
export function getServerISOString(): string {
  return getServerNow().toISOString();
}

/**
 * Get authoritative current date string (YYYY-MM-DD) in Asia/Manila timezone
 */
export function getServerManilaDateString(): string {
  const now = getServerNow();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Hook or initialization helper that automatically keeps server time in sync.
 */
export function initServerTimeSync() {
  if (typeof window === 'undefined') return;

  // Immediate sync
  syncServerTime();

  // Periodic resync every 5 minutes
  const interval = setInterval(() => {
    syncServerTime();
  }, 5 * 60 * 1000);

  // Resync on window focus or network reconnect
  const onFocusOrOnline = () => {
    if (Date.now() - lastSyncTimestamp > 60 * 1000) {
      syncServerTime();
    }
  };

  window.addEventListener('focus', onFocusOrOnline);
  window.addEventListener('online', onFocusOrOnline);

  return () => {
    clearInterval(interval);
    window.removeEventListener('focus', onFocusOrOnline);
    window.removeEventListener('online', onFocusOrOnline);
  };
}

// Auto-run on import in browser
if (typeof window !== 'undefined' && !isInitialized) {
  initServerTimeSync();
}
