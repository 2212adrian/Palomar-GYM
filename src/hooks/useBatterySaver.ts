// src/hooks/useBatterySaver.ts
import { useState, useEffect, useCallback } from 'react';

export type BatterySaverMode = 'auto' | 'on' | 'off';

const STORAGE_KEY = 'palomar_battery_saver_mode';
const SYNC_EVENT = 'palomar-battery-saver-change';
const LOW_BATTERY_THRESHOLD = 0.2; // 20%

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

export function useBatterySaver() {
  const [mode, setModeState] = useState<BatterySaverMode>(getStoredMode);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

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

  // Listen to OS reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
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
      setBatteryLevel(Math.round(battery.level * 100));
      setIsCharging(battery.charging);
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

  const isLowDevicePower =
    (batteryLevel !== null &&
      batteryLevel <= LOW_BATTERY_THRESHOLD * 100 &&
      isCharging === false) ||
    prefersReducedMotion;

  const isBatterySaver =
    mode === 'on' || (mode === 'auto' && isLowDevicePower);

  const isAutoTriggered = mode === 'auto' && isLowDevicePower;

  const setBatterySaverMode = useCallback((nextMode: BatterySaverMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // ignore storage error
    }
    setModeState(nextMode);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: nextMode }));
  }, []);

  const toggleBatterySaver = useCallback(() => {
    const next: BatterySaverMode = isBatterySaver ? 'off' : 'on';
    setBatterySaverMode(next);
    return next === 'on';
  }, [isBatterySaver, setBatterySaverMode]);

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
