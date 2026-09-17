// src/lib/cacheUtils.ts

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