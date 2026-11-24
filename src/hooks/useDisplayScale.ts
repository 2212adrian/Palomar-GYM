// src/hooks/useDisplayScale.ts
import { useState, useEffect, useCallback } from 'react';

export const MIN_DISPLAY_SCALE = 85;
export const DEFAULT_DISPLAY_SCALE = 100;
export const MAX_DISPLAY_SCALE = 130;
export const DISPLAY_SCALE_STEP = 5;
export const DISPLAY_SCALE_STEPS = [85, 90, 95, 100, 105, 110, 115, 120, 125, 130] as const;

const STORAGE_KEY = 'palomar_display_scale';
const SYNC_EVENT = 'palomar-display-scale-change';

export const snapDisplayScale = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_DISPLAY_SCALE;
  const snapped = Math.round(value / DISPLAY_SCALE_STEP) * DISPLAY_SCALE_STEP;
  return Math.min(MAX_DISPLAY_SCALE, Math.max(MIN_DISPLAY_SCALE, snapped));
};

const parseStoredScale = (raw: string | null): number => {
  if (!raw) return DEFAULT_DISPLAY_SCALE;
  if (raw === 'compact') return 90;
  if (raw === 'standard') return DEFAULT_DISPLAY_SCALE;
  if (raw === 'projector') return 120;
  return snapDisplayScale(Number(raw));
};

const getStoredDisplayScale = (): number => {
  if (typeof window === 'undefined') return DEFAULT_DISPLAY_SCALE;
  try {
    return parseStoredScale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_DISPLAY_SCALE;
  }
};

const applyDisplayScale = (scalePercent: number) => {
  if (typeof document === 'undefined') return;
  const snapped = snapDisplayScale(scalePercent);
  const root = document.documentElement;

  root.classList.remove(
    'display-scale-compact',
    'display-scale-standard',
    'display-scale-projector'
  );

  if (snapped < 95) {
    root.classList.add('display-scale-compact');
  } else if (snapped >= 115) {
    root.classList.add('display-scale-projector');
  } else {
    root.classList.add('display-scale-standard');
  }

  const rootPx = Number(((16 * snapped) / 100).toFixed(2));
  root.style.setProperty('--desktop-root-size', `${rootPx}px`);
};

if (typeof window !== 'undefined') {
  applyDisplayScale(getStoredDisplayScale());
}

const persistDisplayScale = (nextScale: number) => {
  const snapped = snapDisplayScale(nextScale);
  try {
    localStorage.setItem(STORAGE_KEY, String(snapped));
  } catch {
    // Ignore storage quota errors
  }
  applyDisplayScale(snapped);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: snapped }));
  }
  return snapped;
};

export const getDisplayScaleLabel = (scalePercent: number): string => {
  if (scalePercent < 95) return 'Small';
  if (scalePercent >= 115) return 'Large';
  return 'Standard';
};

export function useDisplayScale() {
  const [displayScale, setDisplayScaleState] = useState<number>(
    getStoredDisplayScale
  );

  useEffect(() => {
    applyDisplayScale(displayScale);
  }, [displayScale]);

  useEffect(() => {
    const handleSync = () => {
      const stored = getStoredDisplayScale();
      setDisplayScaleState(stored);
      applyDisplayScale(stored);
    };
    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const setDisplayScale = useCallback((nextScale: number) => {
    const snapped = persistDisplayScale(nextScale);
    setDisplayScaleState(snapped);
  }, []);

  const resetDisplayScale = useCallback(() => {
    const snapped = persistDisplayScale(DEFAULT_DISPLAY_SCALE);
    setDisplayScaleState(snapped);
  }, []);

  return {
    displayScale,
    minScale: MIN_DISPLAY_SCALE,
    maxScale: MAX_DISPLAY_SCALE,
    defaultScale: DEFAULT_DISPLAY_SCALE,
    steps: DISPLAY_SCALE_STEPS,
    scaleLabel: getDisplayScaleLabel(displayScale),
    setDisplayScale,
    resetDisplayScale,
  };
}
