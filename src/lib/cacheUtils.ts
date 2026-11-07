// src/lib/cacheUtils.ts

export const PRODUCT_IMAGE_CACHE_NAME = 'palomar-product-images-v1';
const objectUrlMap = new Map<string, string>();

/**
 * Synchronously retrieves an in-memory Object URL for an image if already resolved.
 */
export const getCachedImageUrlSync = (
  url: string | null | undefined
): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  return objectUrlMap.get(trimmed) || null;
};

const PRODUCT_IMAGE_IDB_STORE = 'palomar_product_images_db';

const openProductImageDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(PRODUCT_IMAGE_IDB_STORE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'url' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveImageToOfflineCache = async (
  url: string,
  dataOrBlob: string | Blob
): Promise<void> => {
  try {
    const db = await openProductImageDB();
    let dataToStore = dataOrBlob;
    if (dataOrBlob instanceof Blob) {
      dataToStore = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(dataOrBlob);
      });
    }
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    store.put({ url, data: dataToStore, timestamp: Date.now() });
  } catch {
    // Non-fatal if offline storage unavailable
  }
};

export const getImageFromOfflineCache = async (
  url: string
): Promise<string | null> => {
  try {
    const db = await openProductImageDB();
    return new Promise((resolve) => {
      const tx = db.transaction('images', 'readonly');
      const store = tx.objectStore('images');
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

const convertImageUrlToDataUrl = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

/**
 * Retrieves a cached image URL. If cached in Cache Storage or IndexedDB, returns
 * an Object URL or data URL so it displays offline.
 */
export const getCachedImageUrl = async (
  url: string | null | undefined
): Promise<string | null> => {
  if (!url || typeof window === 'undefined') return url || null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (objectUrlMap.has(trimmed)) {
    return objectUrlMap.get(trimmed)!;
  }

  // 1. Check IndexedDB offline store first
  const idbData = await getImageFromOfflineCache(trimmed);
  if (idbData) {
    objectUrlMap.set(trimmed, idbData);
    return idbData;
  }

  // 2. Check CacheStorage
  if ('caches' in window) {
    try {
      const cache = await caches.open(PRODUCT_IMAGE_CACHE_NAME);
      const cachedResponse = await cache.match(trimmed);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlMap.set(trimmed, objectUrl);
        saveImageToOfflineCache(trimmed, blob).catch(() => {});
        return objectUrl;
      }

      if (navigator.onLine) {
        try {
          const fetchResponse = await fetch(trimmed, { mode: 'cors' });
          if (fetchResponse.ok) {
            await cache.put(trimmed, fetchResponse.clone());
            const blob = await fetchResponse.blob();
            const objectUrl = URL.createObjectURL(blob);
            objectUrlMap.set(trimmed, objectUrl);
            saveImageToOfflineCache(trimmed, blob).catch(() => {});
            return objectUrl;
          }
        } catch {
          // If direct fetch fails (e.g. CORS), attempt canvas extraction
          const dataUrl = await convertImageUrlToDataUrl(trimmed);
          if (dataUrl) {
            objectUrlMap.set(trimmed, dataUrl);
            saveImageToOfflineCache(trimmed, dataUrl).catch(() => {});
            return dataUrl;
          }
        }
      }
    } catch (err) {
      console.warn('Error reading from image cache:', err);
    }
  }

  return trimmed;
};

/**
 * Prefetches and caches product image URLs into Cache Storage and IndexedDB in the background.
 */
export const prefetchProductImages = async (
  urls: (string | null | undefined)[]
): Promise<void> => {
  if (typeof window === 'undefined') return;

  const validUrls = Array.from(
    new Set(
      urls
        .filter((u): u is string => Boolean(u && typeof u === 'string'))
        .map((u) => u.trim())
        .filter(
          (u) =>
            (u.startsWith('http://') || u.startsWith('https://')) &&
            !objectUrlMap.has(u)
        )
    )
  );

  if (validUrls.length === 0) return;

  try {
    await Promise.allSettled(
      validUrls.map(async (url) => {
        try {
          await getCachedImageUrl(url);
        } catch {}
      })
    );
  } catch (err) {
    console.warn('Failed to prefetch product images:', err);
  }
};

import { clearVaultDatabase } from './offlineVault';

/**
 * Whitelist check to preserve user preferences (theme, user agreement, notifications, version info, etc.)
 * while purging all sensitive gym, financial, member, and token cache data.
 */
export const isUserPreferenceKey = (key: string): boolean => {
  const PRESERVED_EXACT_KEYS = new Set([
    'theme',
    'palomar_user_agreement_accepted',
    'palomar_remembered_login',
    'palomar_seen_notification_ids',
    'preferred_camera_id',
  ]);

  if (PRESERVED_EXACT_KEYS.has(key)) return true;

  const PRESERVED_PREFIXES = [
    'palomar_user_agreement',
    'palomar_seen_notification',
    'palomar_remembered_login',
    'preferred_camera',
    'palomar_guide',
    'palomar_version',
    'palomar_dismissed_version',
    'palomar_whats_new',
    'palomar_app_version',
    'palomar_pwa',
    'palomar_battery',
    'theme',
  ];

  return PRESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
};

/**
 * Clears all cookies accessible via document.cookie
 */
export const clearAllCookies = (): void => {
  if (typeof document === 'undefined') return;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const eqPos = cookie.indexOf('=');
    const rawName = eqPos > -1 ? cookie.slice(0, eqPos) : cookie;
    const name = rawName.trim();
    if (!name) continue;

    const expiredBase = '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
    document.cookie = `${name}${expiredBase}`;
    document.cookie = `${name}${expiredBase} SameSite=Lax;`;
    document.cookie = `${name}${expiredBase} SameSite=Lax; Secure;`;

    const encoded = encodeURIComponent(name);
    if (encoded !== name) {
      document.cookie = `${encoded}${expiredBase}`;
      document.cookie = `${encoded}${expiredBase} SameSite=Lax;`;
      document.cookie = `${encoded}${expiredBase} SameSite=Lax; Secure;`;
    }
  }
};

/**
 * Purges the offline transactions vault and any cached IndexedDB databases
 */
export const purgeAllIndexedDB = async (): Promise<void> => {
  try {
    await clearVaultDatabase();
  } catch (err) {
    console.warn('Error clearing vault database:', err);
  }

  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      if (typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          if (dbInfo.name && dbInfo.name !== 'palomar_offline_vault_v1') {
            indexedDB.deleteDatabase(dbInfo.name);
          }
        }
      }
    } catch (err) {
      console.warn('Error deleting databases:', err);
    }
  }
};

/**
 * Comprehensive cleanup of exposed sensitive data across sessionStorage,
 * non-whitelisted localStorage items, cookies, IndexedDB, and Cache Storage.
 */
export const clearSensitiveAppData = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.clear();
  } catch (err) {
    console.warn('Failed to clear sessionStorage:', err);
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !isUserPreferenceKey(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Failed to clean localStorage:', err);
  }

  try {
    clearAllCookies();
  } catch (err) {
    console.warn('Failed to clear cookies:', err);
  }

  try {
    await purgeAllIndexedDB();
  } catch (err) {
    console.warn('Failed to purge IndexedDB:', err);
  }

  try {
    if ('caches' in window) {
      await caches.delete(PRODUCT_IMAGE_CACHE_NAME);
    }
  } catch (err) {
    console.warn('Failed to delete cache storage:', err);
  }
};

/**
 * Clears all cached data in sessionStorage (especially sales, logbook, and attendance)
 * to prevent stale data after a database restore or rollback.
 */
export const clearAppCaches = () => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
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
          key.includes('sanitized'))
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch (err) {
    console.warn('Failed to clear app cache:', err);
  }
};