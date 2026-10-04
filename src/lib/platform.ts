// src/lib/platform.ts
import { Capacitor } from '@capacitor/core';

/**
 * Checks if running inside the native Capacitor mobile/tablet application
 */
export const isCapacitorApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    Capacitor.isNativePlatform() ||
    Boolean(
      (
        window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }
      )?.Capacitor?.isNativePlatform?.()
    )
  );
};

/**
 * Checks if running as an installed Progressive Web App (PWA)
 */
export const isPWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true ||
    document.referrer.includes('android-app://')
  );
};

/**
 * Checks if running in either Capacitor native app or installed PWA
 */
export const isCapacitorOrPWA = (): boolean => {
  return isCapacitorApp() || isPWA();
};

export const isAppOrPWA = isCapacitorOrPWA;
