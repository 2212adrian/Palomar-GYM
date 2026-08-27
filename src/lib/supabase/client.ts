// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Environment Variables, please contact the developer'
  );
}

// Custom chunking storage engine to handle large OAuth payloads cleanly
const CHUNK_SIZE = 3000;

function getRawCookie(name: string): string | null {
  const encodedName = encodeURIComponent(name) + "=";
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    let c = cookies[i].trim();
    if (c.indexOf(encodedName) === 0) {
      try {
        return decodeURIComponent(c.substring(encodedName.length));
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

function setRawCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax; Secure`;
}

function clearCookie(name: string): void {
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax; Secure`;
}

const cookieStorage = {
  getItem(key: string): string | null {
    if (typeof document === 'undefined') return null;

    const primaryValue = getRawCookie(key);
    if (primaryValue) return primaryValue;

    let assembledValue = '';
    let i = 0;
    while (true) {
      const chunk = getRawCookie(`${key}.${i}`);
      if (!chunk) break;
      assembledValue += chunk;
      i++;
    }

    return assembledValue || null;
  },

  setItem(key: string, value: string): void {
    if (typeof document === 'undefined') return;

    clearCookie(key);
    let i = 0;
    while (getRawCookie(`${key}.${i}`)) {
      clearCookie(`${key}.${i}`);
      i++;
    }

    const maxAge = 400 * 24 * 60 * 60; // 400 days (maximum browser limit)

    if (value.length <= CHUNK_SIZE) {
      setRawCookie(key, value, maxAge);
    } else {
      let offset = 0;
      let chunkIdx = 0;
      while (offset < value.length) {
        const chunk = value.substring(offset, offset + CHUNK_SIZE);
        setRawCookie(`${key}.${chunkIdx}`, chunk, maxAge);
        offset += CHUNK_SIZE;
        chunkIdx++;
      }
    }
  },

  removeItem(key: string): void {
    if (typeof document === 'undefined') return;

    clearCookie(key);
    let i = 0;
    while (getRawCookie(`${key}.${i}`)) {
      clearCookie(`${key}.${i}`);
      i++;
    }
  }
};

const appStorage = {
  getItem(key: string): string | null {
    if (typeof window !== 'undefined') {
      try {
        const localVal = window.localStorage.getItem(key);
        if (localVal) return localVal;
      } catch (e) {
        // localStorage might be unavailable or restricted
      }
    }
    return cookieStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        // localStorage might be unavailable or restricted
      }
    }
    cookieStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        // localStorage might be unavailable or restricted
      }
    }
    cookieStorage.removeItem(key);
  }
};

// WebSocket Proxy to intercept connection attempts while offline
const SafeWebSocket = typeof window !== 'undefined' ? new Proxy(window.WebSocket, {
  construct(target, args) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const mockSocket = {
        readyState: 3, // CLOSED
        onopen: null,
        onerror: null,
        onclose: null,
        onmessage: null,
        close() {},
        send() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
      };

      setTimeout(() => {
        const errorEvent = new Event('error');
        const closeEvent = new CloseEvent('close', { code: 1006, reason: 'Offline' });
        if (typeof mockSocket.onerror === 'function') {
          (mockSocket as any).onerror(errorEvent);
        }
        if (typeof mockSocket.onclose === 'function') {
          (mockSocket as any).onclose(closeEvent);
        }
      }, 0);

      return mockSocket;
    }
    return Reflect.construct(target, args);
  }
}) : undefined;

const OFFLINE_STAFF_MESSAGE = 'No internet connection. Please check your Wi-Fi and try again.';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: appStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      fetch: (input, init) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return Promise.reject(new TypeError(OFFLINE_STAFF_MESSAGE));
        }

        return fetch(input, init).catch((err) => {
          if (err?.message === 'Failed to fetch' || err?.name === 'TypeError') {
            return Promise.reject(new TypeError(OFFLINE_STAFF_MESSAGE));
          }
          return Promise.reject(err);
        });
      },
    },
    realtime: {
      transport: SafeWebSocket as any
    }
  }
);

// AUTOMATIC LOGOUT CLEANUP:
// Clears ALL sessionStorage (Logbook, Sales, etc.) on logout
// while keeping localStorage (theme, user preferences, offline config) completely safe.
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      sessionStorage.clear();
    }
  });
}