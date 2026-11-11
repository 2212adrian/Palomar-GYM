// src/hooks/useBeyondTheDay.ts
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  isToday,
  isYesterday,
  isTomorrow,
  startOfDay,
  format,
} from 'date-fns';
import { getServerNow } from '../lib/serverTime';

export interface UseBeyondTheDayProps {
  currentWeekStart: Date;
  selectedDayIndex: number;
  onWeekStartChange: (date: Date) => void;
  onDayIndexChange: (index: number) => void;
  role?: 'admin' | 'staff';
  enabled?: boolean;
}

export interface BeyondTheDayState {
  canGoNext: boolean;
  canGoPast: boolean;
  nextDate: Date;
  pastDate: Date;
  nextDateLabel: string;
  pastDateLabel: string;
  goToNextDay: () => void;
  goToPastDay: () => void;
  pullDirection: 'next' | 'past' | null;
  pullProgress: number; // 0 to 1
  isTransitioning: boolean;
}

const formatFriendlyDay = (date: Date): string => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
};

export const useBeyondTheDay = ({
  currentWeekStart,
  selectedDayIndex,
  onWeekStartChange,
  onDayIndexChange,
  role = 'admin',
  enabled = true,
}: UseBeyondTheDayProps): BeyondTheDayState => {
  const selectedDate = useMemo(() => {
    return addDays(currentWeekStart, selectedDayIndex);
  }, [currentWeekStart, selectedDayIndex]);

  const nextDate = useMemo(() => addDays(selectedDate, 1), [selectedDate]);
  const pastDate = useMemo(() => subDays(selectedDate, 1), [selectedDate]);

  // Capped at today: cannot go beyond today into the future
  const canGoNext = useMemo(() => {
    return startOfDay(nextDate).getTime() <= startOfDay(getServerNow()).getTime();
  }, [nextDate]);

  // Past day navigation allowed for admin
  const canGoPast = useMemo(() => {
    if (role === 'staff') return false;
    return true;
  }, [role]);

  const nextDateLabel = useMemo(() => formatFriendlyDay(nextDate), [nextDate]);
  const pastDateLabel = useMemo(() => formatFriendlyDay(pastDate), [pastDate]);

  const [pullDirection, setPullDirection] = useState<'next' | 'past' | null>(null);
  const [pullProgress, setPullProgress] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  const transitionCooldownRef = useRef<boolean>(false);
  const wheelAccumulatorRef = useRef<number>(0);
  const wheelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }
    } catch {
      // ignore
    }
  }, []);

  const goToNextDay = useCallback(() => {
    if (!canGoNext || transitionCooldownRef.current) return;
    transitionCooldownRef.current = true;
    setIsTransitioning(true);
    triggerHaptic();

    if (selectedDayIndex < 6) {
      onDayIndexChange(selectedDayIndex + 1);
    } else {
      const nextWeek = addWeeks(currentWeekStart, 1);
      onWeekStartChange(nextWeek);
      onDayIndexChange(0);
    }

    setPullDirection(null);
    setPullProgress(0);

    // Smooth scroll to top when landing on new day
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setTimeout(() => {
      transitionCooldownRef.current = false;
      setIsTransitioning(false);
    }, 700);
  }, [canGoNext, selectedDayIndex, currentWeekStart, onDayIndexChange, onWeekStartChange, triggerHaptic]);

  const goToPastDay = useCallback(() => {
    if (!canGoPast || transitionCooldownRef.current) return;
    transitionCooldownRef.current = true;
    setIsTransitioning(true);
    triggerHaptic();

    if (selectedDayIndex > 0) {
      onDayIndexChange(selectedDayIndex - 1);
    } else {
      const prevWeek = subWeeks(currentWeekStart, 1);
      onWeekStartChange(prevWeek);
      onDayIndexChange(6);
    }

    setPullDirection(null);
    setPullProgress(0);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setTimeout(() => {
      transitionCooldownRef.current = false;
      setIsTransitioning(false);
    }, 700);
  }, [canGoPast, selectedDayIndex, currentWeekStart, onDayIndexChange, onWeekStartChange, triggerHaptic]);

  // Wheel and trackpad overscroll detector
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleWheel = (e: WheelEvent) => {
      if (transitionCooldownRef.current) return;

      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const isAtTop = scrollY <= 8;
      const isAtBottom =
        window.innerHeight + scrollY >= document.documentElement.scrollHeight - 20;

      // Scrolling UP at Top boundary -> Navigate to Next Day
      if (isAtTop && e.deltaY < 0 && canGoNext) {
        wheelAccumulatorRef.current += Math.abs(e.deltaY);
        const progress = Math.min(wheelAccumulatorRef.current / 160, 1);
        setPullDirection('next');
        setPullProgress(progress);

        if (wheelAccumulatorRef.current >= 160) {
          wheelAccumulatorRef.current = 0;
          goToNextDay();
          return;
        }
      }
      // Scrolling DOWN at Bottom boundary -> Navigate to Past Day
      else if (isAtBottom && e.deltaY > 0 && canGoPast) {
        wheelAccumulatorRef.current += Math.abs(e.deltaY);
        const progress = Math.min(wheelAccumulatorRef.current / 160, 1);
        setPullDirection('past');
        setPullProgress(progress);

        if (wheelAccumulatorRef.current >= 160) {
          wheelAccumulatorRef.current = 0;
          goToPastDay();
          return;
        }
      }

      if (wheelResetTimerRef.current) {
        clearTimeout(wheelResetTimerRef.current);
      }
      wheelResetTimerRef.current = setTimeout(() => {
        wheelAccumulatorRef.current = 0;
        setPullDirection(null);
        setPullProgress(0);
      }, 300);
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
    };
  }, [enabled, canGoNext, canGoPast, goToNextDay, goToPastDay]);

  // Touch overscroll detection for mobile devices
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartYRef.current === null || transitionCooldownRef.current) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartYRef.current;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const isAtTop = scrollY <= 8;
      const isAtBottom =
        window.innerHeight + scrollY >= document.documentElement.scrollHeight - 20;

      if (isAtTop && deltaY > 20 && canGoNext) {
        const pullDist = (deltaY - 20) * 0.45;
        const progress = Math.min(pullDist / 70, 1);
        setPullDirection('next');
        setPullProgress(progress);
      } else if (isAtBottom && deltaY < -20 && canGoPast) {
        const pullDist = (Math.abs(deltaY) - 20) * 0.45;
        const progress = Math.min(pullDist / 70, 1);
        setPullDirection('past');
        setPullProgress(progress);
      }
    };

    const handleTouchEnd = () => {
      if (touchStartYRef.current !== null && !transitionCooldownRef.current) {
        if (pullProgress >= 0.95) {
          if (pullDirection === 'next' && canGoNext) {
            goToNextDay();
          } else if (pullDirection === 'past' && canGoPast) {
            goToPastDay();
          }
        }
      }
      touchStartYRef.current = null;
      setPullDirection(null);
      setPullProgress(0);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, pullProgress, pullDirection, canGoNext, canGoPast, goToNextDay, goToPastDay]);

  return {
    canGoNext,
    canGoPast,
    nextDate,
    pastDate,
    nextDateLabel,
    pastDateLabel,
    goToNextDay,
    goToPastDay,
    pullDirection,
    pullProgress,
    isTransitioning,
  };
};