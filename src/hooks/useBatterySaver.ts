// src/hooks/useBatterySaver.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { isAppOrPWA } from '../lib/platform';

export type BatterySaverMode = 'auto' | 'on' | 'off';

const STORAGE_KEY = 'palomar_battery_saver_mode';
const SYNC_EVENT = 'palomar-battery-saver-change';
const LOW_BATTERY_THRESHOLD_PERCENT = 20; // 20% or under

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
  addEventListener(
    type: 'chargingchange' | 'levelchange',
    listener: EventListenerOrEventListenerObject
  ): void;
  removeEventListener(
    type: 'chargingchange' | 'levelchange',
    listener: EventListenerOrEventListenerObject
  ): void;
}

const getStoredMode = (): BatterySaverMode => {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'on' || raw === 'off' || raw === 'auto') return raw;
  } catch {
    // ignore storage errors
  }
  return 'auto';
};

const persistMode = (nextMode: BatterySaverMode) => {
  try {
    localStorage.setItem(STORAGE_KEY, nextMode);
  } catch {
    // ignore storage error
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: nextMode }));
  }
};

export function useBatterySaver() {
  const [mode, setModeState] = useState<BatterySaverMode>(getStoredMode);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const prevBatteryLevelRef = useRef<number | null>(null);

  // Sync mode across components in the same tab and across tabs
  useEffect(() => {
    const handleSync = () => {
      setModeState(getStoredMode());
    };
    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Connect to Web Battery Status API where available
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
      return;
    }

    let battery: BatteryManager | null = null;
    let isMounted = true;

    const updateBatteryInfo = () => {
      if (!battery || !isMounted) return;
      const levelPercent = Math.round(battery.level * 100);
      const prevLevel = prevBatteryLevelRef.current;
      prevBatteryLevelRef.current = levelPercent;

      setBatteryLevel(levelPercent);
      setIsCharging(battery.charging);

      const currentMode = getStoredMode();
      // If battery is above 20% and mode was 'off' (from a previous manual override), re-arm 'auto'
      if (
        levelPercent > LOW_BATTERY_THRESHOLD_PERCENT &&
        currentMode === 'off'
      ) {
        persistMode('auto');
        setModeState('auto');
      }
      // If battery just dropped to 20% or under from above 20%, auto-turn on power saving mode
      else if (
        levelPercent <= LOW_BATTERY_THRESHOLD_PERCENT &&
        prevLevel !== null &&
        prevLevel > LOW_BATTERY_THRESHOLD_PERCENT &&
        currentMode === 'off'
      ) {
        persistMode('auto');
        setModeState('auto');
      }
    };

    (navigator as unknown as { getBattery: () => Promise<BatteryManager> })
      .getBattery()
      .then((bat) => {
        if (!isMounted) return;
        battery = bat;
        updateBatteryInfo();
        battery.addEventListener('levelchange', updateBatteryInfo);
        battery.addEventListener('chargingchange', updateBatteryInfo);
      })
      .catch(() => {
        // Battery API blocked or unsupported
      });

    return () => {
      isMounted = false;
      if (battery) {
        battery.removeEventListener('levelchange', updateBatteryInfo);
        battery.removeEventListener('chargingchange', updateBatteryInfo);
      }
    };
  }, []);

  // Power Saving Mode applies strictly to mobile/Capacitor devices (< 1024px or mobile user agent).
  // Desktop implementation for website and PWA retains 100% of animations in pristine condition.
  const isMobileOrCapacitorDevice =
    typeof window !== 'undefined'
      ? window.innerWidth < 1024 ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      : false;

  const isPlatformSupported = isAppOrPWA() && isMobileOrCapacitorDevice;

  // Auto-turn on when battery is 20% or under
  const isLowDevicePower =
    isPlatformSupported &&
    batteryLevel !== null &&
    batteryLevel <= LOW_BATTERY_THRESHOLD_PERCENT;

  const isBatterySaver =
    isPlatformSupported &&
    (mode === 'on' || (mode === 'auto' && isLowDevicePower));

  const isAutoTriggered =
    isPlatformSupported && mode === 'auto' && isLowDevicePower;

  // Apply global .battery-saver class to <html> for app-wide CSS/GPU optimization
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(
      'battery-saver',
      isPlatformSupported && isBatterySaver
    );
  }, [isBatterySaver, isPlatformSupported]);

  const setBatterySaverMode = useCallback((nextMode: BatterySaverMode) => {
    persistMode(nextMode);
    setModeState(nextMode);
  }, []);

  const toggleBatterySaver = useCallback(() => {
    if (isBatterySaver) {
      // Turning OFF: if currently at <=20% battery, set 'off' to override low battery;
      // otherwise set 'auto' so it stays off now but auto-turns on if battery drops to <=20%.
      const next: BatterySaverMode = isLowDevicePower ? 'off' : 'auto';
      setBatterySaverMode(next);
      return false;
    } else {
      setBatterySaverMode('on');
      return true;
    }
  }, [isBatterySaver, isLowDevicePower, setBatterySaverMode]);

  return {
    isBatterySaver,
    isAutoTriggered,
    isLowDevicePower,
    batteryLevel,
    isCharging,
    mode,
    setBatterySaverMode,
    toggleBatterySaver,
  };
}
