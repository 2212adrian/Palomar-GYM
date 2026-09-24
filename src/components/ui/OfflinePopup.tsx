// src/components/ui/OfflinePopup.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';

const RESTORED_DURATION_MS = 3500; // Duration to show "Back Online" before animating out

export const OfflinePopup: React.FC = () => {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isRestored, setIsRestored] = useState<boolean>(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(100);

  const restoredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // Active check to verify real external connectivity
  const probeConnection = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        resolve(false);
        return;
      }

      const img = new Image();
      let done = false;

      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          img.src = '';
          resolve(false);
        }
      }, 2500);

      img.onload = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(true);
        }
      };

      img.onerror = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(false);
        }
      };

      // Cache-busting query to test real ping
      img.src = `https://www.google.com/favicon.ico?_ping=${Date.now()}`;
    });
  }, []);

  const clearAllTimers = () => {
    if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  };

  // Outro transition handler
  const triggerClose = useCallback(() => {
    setIsAnimatingOut(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setIsAnimatingOut(false);
      setIsDismissed(true);
      setIsRestored(false);
      setProgress(100);
    }, 350); // Matches ease-out transition duration
  }, []);

  // Dedicated effect for auto-closing the restored state after 3 seconds
  useEffect(() => {
    if (!isRestored) return;

    setProgress(100);
    const intervalStep = 50;
    const totalSteps = RESTORED_DURATION_MS / intervalStep;
    const stepDecrement = 100 / totalSteps;

    const progInterval = setInterval(() => {
      setProgress((prev) => {
        const nextVal = prev - stepDecrement;
        if (nextVal <= 0) {
          clearInterval(progInterval);
          return 0;
        }
        return nextVal;
      });
    }, intervalStep);

    const closeTimer = setTimeout(() => {
      triggerClose();
    }, RESTORED_DURATION_MS);

    return () => {
      clearInterval(progInterval);
      clearTimeout(closeTimer);
    };
  }, [isRestored, triggerClose]);

  const handleOnlineDetected = useCallback(() => {
    clearAllTimers();
    setIsOffline(false);
    setIsDismissed(false);
    setIsRestored(true);
    setIsAnimatingOut(false);
  }, []);

  const handleOfflineDetected = useCallback(() => {
    clearAllTimers();
    setIsRestored(false);
    setIsDismissed(false);
    setIsOffline(true);
    setIsAnimatingOut(false);
    setProgress(100);
  }, []);

  const handleManualRetry = async () => {
    setIsChecking(true);
    const alive = await probeConnection();
    setIsChecking(false);

    if (alive) {
      handleOnlineDetected();
    } else {
      setIsOffline(true);
      setIsDismissed(false);
    }
  };

  useEffect(() => {
    const onOffline = () => handleOfflineDetected();
    const onOnline = () => handleOnlineDetected();

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    const interval = setInterval(async () => {
      if (!navigator.onLine) {
        if (!isOffline && !isRestored) {
          handleOfflineDetected();
        }
        return;
      }

      if (isRestored) return;

      const connected = await probeConnection();
      if (!connected) {
        if (!isOffline) {
          handleOfflineDetected();
        }
      } else {
        if (isOffline) {
          handleOnlineDetected();
        }
      }
    }, 4000);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
      clearAllTimers();
    };
  }, [
    isOffline,
    isRestored,
    probeConnection,
    handleOfflineDetected,
    handleOnlineDetected,
  ]);

  // Don't render if online and not in restored notification, or dismissed
  if ((!isOffline && !isRestored) || (isDismissed && !isAnimatingOut)) {
    return null;
  }

  return (
    <div
      style={{ zIndex: 99999 }}
      className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 md:w-[370px] pointer-events-auto select-none"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 ease-out transform ${
          isAnimatingOut
            ? 'opacity-0 translate-y-6 scale-95 pointer-events-none'
            : 'opacity-100 translate-y-0 scale-100'
        } ${
          isRestored
            ? /* Online Restored State */
              'bg-emerald-600 text-white border-emerald-400/60 shadow-emerald-950/20'
            : /* Offline State (Adaptive Light / Dark) */
              'bg-white dark:bg-[#161920] text-[#0b1a30] dark:text-[#f3f4f6] border-[#0c3c73]/15 dark:border-rose-500/30 shadow-[0_12px_36px_-8px_rgba(11,26,48,0.18)] dark:shadow-black/60'
        } p-3.5 sm:p-4`}
      >
        {/* Animated Progress Bar (When Back Online) */}
        {isRestored && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-black/20 overflow-hidden">
            <div
              className="h-full bg-emerald-200 transition-all ease-linear"
              style={{
                width: `${progress}%`,
                transitionDuration: '50ms',
              }}
            />
          </div>
        )}

        {/* Offline Pulsing Indicator */}
        {!isRestored && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-rose-500 to-red-600 animate-pulse" />
        )}

        {/* Dismiss 'X' Button */}
        <button
          type="button"
          onClick={triggerClose}
          className={`absolute top-2.5 right-2.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
            isRestored
              ? 'text-white/70 hover:text-white hover:bg-white/10'
              : 'text-slate-400 dark:text-slate-400 hover:text-[#0b1a30] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
          }`}
          title="Dismiss notification"
          aria-label="Dismiss offline alert"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="flex items-center gap-3 pr-6">
          {/* Status Icon */}
          {isRestored ? (
            <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white border border-white/30">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          ) : (
            <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
              <svg
                className="w-5 h-5 animate-pulse"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                  d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 0a5 5 0 010-7.072m-2.828-2.828a9 9 0 000 12.728M3 3l18 18"
                />
              </svg>
            </div>
          )}

          {/* Texts & Controls */}
          <div className="min-w-0 flex-1">
            <h4
              className={`text-xs sm:text-sm font-bold tracking-wide uppercase ${
                isRestored ? 'text-white' : 'text-[#0b1a30] dark:text-white'
              }`}
            >
              {isRestored ? 'Back Online' : 'No Internet Connection'}
            </h4>
            <p
              className={`text-[11px] sm:text-xs leading-tight sm:leading-normal mt-0.5 ${
                isRestored
                  ? 'text-emerald-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {isRestored
                ? 'Connection restored. System synced.'
                : 'Working offline. Real-time sync paused.'}
            </p>

            {!isRestored && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualRetry}
                  disabled={isChecking}
                  className="px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] active:scale-95 text-white transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isChecking ? (
                    <>
                      <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Retry'
                  )}
                </button>
                <button
                  type="button"
                  onClick={triggerClose}
                  className="px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
