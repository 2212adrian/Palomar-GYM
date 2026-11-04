// src/lib/hapticsService.ts
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isCapacitorApp } from './platform';

/**
 * Checks whether Battery Saver mode is currently active.
 * When Battery Saver is on, all tactile/vibration haptics are suppressed
 * to minimize hardware power consumption.
 */
export function isBatterySaverActive(): boolean {
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('battery-saver')) {
      return true;
    }
  }
  if (typeof window !== 'undefined') {
    try {
      const mode = localStorage.getItem('palomar_battery_saver_mode');
      if (mode === 'on') return true;
    } catch {
      // ignore storage access errors
    }
  }
  return false;
}

/**
 * Fires a light tactile haptic impact on button press or click.
 * Strictly suppressed if Battery Saver mode is active.
 */
export async function triggerHapticButton(): Promise<void> {
  if (isBatterySaverActive()) return;

  try {
    if (isCapacitorApp()) {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    }
    // Web Vibration API fallback where supported
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
  } catch {
    // Graceful silent fail on unsupported hardware
  }
}

/**
 * Fires a celebratory / distinct haptic pulse upon form completion or successful operation.
 * Strictly suppressed if Battery Saver mode is active.
 */
export async function triggerHapticFormSuccess(): Promise<void> {
  if (isBatterySaverActive()) return;

  try {
    if (isCapacitorApp()) {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    }
    // Web Vibration API fallback: two quick pulses
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([15, 60, 20]);
    }
  } catch {
    // Graceful silent fail
  }
}

/**
 * Fires an error haptic pulse upon form validation failure.
 * Strictly suppressed if Battery Saver mode is active.
 */
export async function triggerHapticError(): Promise<void> {
  if (isBatterySaverActive()) return;

  try {
    if (isCapacitorApp()) {
      await Haptics.notification({ type: NotificationType.Error });
      return;
    }
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([30, 40, 30]);
    }
  } catch {
    // Graceful silent fail
  }
}

/**
 * Fires subtle tick on selection toggle or slider change.
 */
export async function triggerHapticSelection(): Promise<void> {
  if (isBatterySaverActive()) return;

  try {
    if (isCapacitorApp()) {
      await Haptics.selectionChanged();
      return;
    }
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8);
    }
  } catch {
    // Graceful silent fail
  }
}
