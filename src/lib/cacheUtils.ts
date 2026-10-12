// src/lib/cacheUtils.ts

const DB_NAME = 'palomar_indexed_cache_v1';
const DB_VERSION = 1;

export type CacheStoreName =
  | 'members'
  | 'subscriptions'
  | 'cards'
  | 'products'
  | 'sync_meta';

interface SyncMetaRecord {
  key: string;
  last_sync: string;
}

let dbInstance: IDBDatabase | null = null;
let dbOpeningPromise: Promise<IDBDatabase> | null = null;

export const openAppDatabase = (): Promise<IDBDatabase> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB unavailable in this runtime.'));
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbOpeningPromise) {
    return dbOpeningPromise;
  }

  dbOpeningPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('members')) {
        const store = db.createObjectStore('members', { keyPath: 'id' });
        store.createIndex('member_id', 'member_id', { unique: false });
        store.createIndex('updated_at', 'updated_at', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains('subscriptions')) {
        const store = db.createObjectStore('subscriptions', { keyPath: 'id' });
        store.createIndex('member_id', 'member_id', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('cards')) {
        const store = db.createObjectStore('cards', { keyPath: 'id' });
        store.createIndex('member_id', 'member_id', { unique: false });
        store.createIndex('receipt_number', 'receipt_number', { unique: false });
        store.createIndex('updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('products')) {
        const store = db.createObjectStore('products', { keyPath: 'id' });
        store.createIndex('barcode_id', 'barcode_id', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('sync_meta')) {
        db.createObjectStore('sync_meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbOpeningPromise = null;

      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      dbOpeningPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB.'));
    };

    request.onblocked = () => {
      console.warn('IndexedDB database open request blocked.');
    };
  });

  return dbOpeningPromise;
};

export const idbGetAll = async <T = any>(
  storeName: CacheStoreName
): Promise<T[]> => {
  try {
    const db = await openAppDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`idbGetAll failed for store ${storeName}:`, err);
    return [];
  }
};

export const idbBulkUpsert = async <T extends { id: string | number }>(
  storeName: CacheStoreName,
  records: T[]
): Promise<void> => {
  if (!records || records.length === 0) return;
  try {
    const db = await openAppDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (let i = 0; i < records.length; i++) {
        store.put(records[i]);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`idbBulkUpsert failed for store ${storeName}:`, err);
  }
};

export const idbDelete = async (
  storeName: CacheStoreName,
  key: string | number
): Promise<void> => {
  try {
    const db = await openAppDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`idbDelete failed for store ${storeName}:`, err);
  }
};

export const idbClearStore = async (
  storeName: CacheStoreName
): Promise<void> => {
  try {
    const db = await openAppDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`idbClearStore failed for store ${storeName}:`, err);
  }
};

export const idbGetSyncTimestamp = async (
  tableName: string
): Promise<string | null> => {
  try {
    const db = await openAppDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('sync_meta', 'readonly');
      const store = tx.objectStore('sync_meta');
      const req = store.get(tableName);

      req.onsuccess = () => {
        const record = req.result as SyncMetaRecord | undefined;
        resolve(record?.last_sync || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

export const idbSetSyncTimestamp = async (
  tableName: string,
  timestampIso: string
): Promise<void> => {
  try {
    const db = await openAppDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_meta', 'readwrite');
      const store = tx.objectStore('sync_meta');
      const record: SyncMetaRecord = { key: tableName, last_sync: timestampIso };
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`idbSetSyncTimestamp failed for ${tableName}:`, err);
  }
};

/**
 * Executes an incremental delta-synchronization against Supabase:
 * 1. Reads existing local records instantly from IndexedDB.
 * 2. Fetches only rows where updated_at > last_sync from Supabase.
 * 3. Upserts delta changes locally, purges soft-deleted rows, and stores the new sync watermark.
 */
export const syncTableDeltas = async <T extends { id: string; updated_at?: string; deleted_at?: string | null }>(
  storeName: CacheStoreName,
  fetchQuery: (sinceIso: string | null) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> => {
  const localCached = await idbGetAll<T>(storeName);
  const isOnline = typeof navigator === 'undefined' || navigator.onLine;

  if (!isOnline) {
    return localCached;
  }

  const lastSyncIso = await idbGetSyncTimestamp(storeName);

  try {
    const syncStartTime = new Date().toISOString();
    const { data: deltas, error } = await fetchQuery(lastSyncIso);

    if (error) {
      console.warn(`Delta query error on ${storeName}:`, error.message || error);
      return localCached;
    }

    if (deltas && deltas.length > 0) {
      const toUpsert: T[] = [];
      const toDeleteIds: string[] = [];

      for (let i = 0; i < deltas.length; i++) {
        const row = deltas[i];
        if (row.deleted_at) {
          toDeleteIds.push(row.id);
        } else {
          toUpsert.push(row);
        }
      }

      if (toUpsert.length > 0) {
        await idbBulkUpsert(storeName, toUpsert);
      }

      for (let i = 0; i < toDeleteIds.length; i++) {
        await idbDelete(storeName, toDeleteIds[i]);
      }

      await idbSetSyncTimestamp(storeName, syncStartTime);
      return await idbGetAll<T>(storeName);
    }

    if (!lastSyncIso && (!deltas || deltas.length === 0)) {
      await idbSetSyncTimestamp(storeName, syncStartTime);
    }

    return localCached;
  } catch (err) {
    console.warn(`syncTableDeltas exception on ${storeName}:`, err);
    return localCached;
  }
};

/**
 * Purges any sensitive business data or transaction caches erroneously stored in localStorage,
 * preserving only non-sensitive device/user preferences.
 */
export const purgeSensitiveLocalStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('sales_') ||
          key.startsWith('logbook_') ||
          key.startsWith('members_') ||
          key.startsWith('attendance_') ||
          key.startsWith('incident_') ||
          key.startsWith('products_') ||
          key.startsWith('cards_') ||
          key.startsWith('subscriptions_') ||
          key.startsWith('palomar_rates_config_') ||
          key.includes('sanitized') ||
          key.includes('closed_sessions_cache'))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Failed to purge sensitive localStorage keys:', err);
  }
};

/**
 * Clears all cached business data in sessionStorage, localStorage, and IndexedDB object stores
 * to prevent stale states across table restores or rollbacks.
 */
export const clearAppCaches = () => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.clear();
    }

    purgeSensitiveLocalStorage();

    idbClearStore('members').catch(() => {});
    idbClearStore('subscriptions').catch(() => {});
    idbClearStore('cards').catch(() => {});
    idbClearStore('products').catch(() => {});
    idbClearStore('sync_meta').catch(() => {});
  } catch (err) {
    console.warn('Failed to clear app cache:', err);
  }
};