// src/hooks/useHeadingFont.ts
import { useState, useEffect, useCallback } from 'react';

export type HeadingFontMode = 'freshman' | 'system';

const STORAGE_KEY = 'palomar_heading_font';
const SYNC_EVENT = 'palomar-heading-font-change';
const CLASS_NAME = 'system-heading-font';

const getStoredHeadingFont = (): HeadingFontMode => {
  if (typeof window === 'undefined') return 'freshman';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'freshman' || raw === 'system') return raw;
  } catch {
    // ignore storage errors
  }
  return 'freshman';
};

const applyHeadingFontClass = (mode: HeadingFontMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(CLASS_NAME, mode === 'system');
};

// Apply immediately on module load to prevent flash of wrong heading font
if (typeof window !== 'undefined') {
  applyHeadingFontClass(getStoredHeadingFont());
}

const persistHeadingFont = (nextMode: HeadingFontMode) => {
  try {
    localStorage.setItem(STORAGE_KEY, nextMode);
  } catch {
    // ignore storage error
  }
  applyHeadingFontClass(nextMode);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: nextMode }));
  }
};

export function useHeadingFont() {
  const [headingFont, setHeadingFontState] =
    useState<HeadingFontMode>(getStoredHeadingFont);

  useEffect(() => {
    applyHeadingFontClass(headingFont);
  }, [headingFont]);

  useEffect(() => {
    const handleSync = () => {
      const stored = getStoredHeadingFont();
      setHeadingFontState(stored);
      applyHeadingFontClass(stored);
    };
    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const setHeadingFont = useCallback((nextMode: HeadingFontMode) => {
    persistHeadingFont(nextMode);
    setHeadingFontState(nextMode);
  }, []);

  const toggleHeadingFont = useCallback(() => {
    const current = getStoredHeadingFont();
    const next: HeadingFontMode = current === 'freshman' ? 'system' : 'freshman';
    persistHeadingFont(next);
    setHeadingFontState(next);
    return next;
  }, []);

  return {
    headingFont,
    isSystemHeadingFont: headingFont === 'system',
    setHeadingFont,
    toggleHeadingFont,
  };
}
