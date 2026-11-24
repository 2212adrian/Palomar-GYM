// src/components/common/ManilaClock.tsx
import React, { useState, useEffect, memo } from 'react';
import { getServerNow } from '../../lib/serverTime';
import { useBatterySaver } from '../../hooks/useBatterySaver';

const formatManilaClock = (compactSeconds: boolean): string => {
  const databaseNow = getServerNow();
  const timeStr = databaseNow.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    ...(compactSeconds ? {} : { second: '2-digit' as const }),
    hour12: true,
  });

  const dateStr = databaseNow.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return `${dateStr} • ${timeStr}`;
};

/**
 * Self-contained live Manila clock chip.
 * Keeps 1-second updates isolated so surrounding top bar navigation and badges never re-render.
 */
export const ManilaClock: React.FC<{ className?: string }> = memo(
  ({ className = '' }) => {
    const { isBatterySaver } = useBatterySaver();
    const [displayTime, setDisplayTime] = useState<string>(() =>
      formatManilaClock(isBatterySaver)
    );

    useEffect(() => {
      const syncClock = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        setDisplayTime(formatManilaClock(isBatterySaver));
      };

      syncClock();
      const interval = setInterval(syncClock, isBatterySaver ? 15000 : 1000);
      const handleVisibility = () => {
        if (!document.hidden) syncClock();
      };
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }, [isBatterySaver]);

    return (
      <div
        className={`hidden lg:block text-xs xl:text-[13px] font-mono tabular-nums text-slate-600 dark:text-slate-300 select-none whitespace-nowrap ${className}`}
      >
        {displayTime}
      </div>
    );
  }
);

ManilaClock.displayName = 'ManilaClock';
