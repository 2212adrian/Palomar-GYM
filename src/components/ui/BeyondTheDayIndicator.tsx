import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { BeyondTheDayState } from '../../hooks/useBeyondTheDay';

export interface BeyondTheDayIndicatorProps extends BeyondTheDayState {
  className?: string;
}

export const BeyondTheDayIndicator: React.FC<BeyondTheDayIndicatorProps> = ({
  canGoNext,
  canGoPast,
  nextDateLabel,
  pastDateLabel,
  goToNextDay,
  goToPastDay,
  pullDirection,
  pullProgress,
  isTransitioning,
  className = '',
}) => {
  return (
    <>
      {/* ─── 1. TOP OVERSCROLL BANNER (PULL FOR NEXT DAY) ─── */}
      <AnimatePresence>
        {pullDirection === 'next' && canGoNext && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="fixed top-18 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 dark:bg-zinc-800/95 text-white border border-slate-700/80 dark:border-white/20 shadow-xl backdrop-blur-md">
              <div
                className="w-5 h-5 rounded-full border-2 border-emerald-400 flex items-center justify-center transition-transform"
                style={{
                  transform: `scale(${0.8 + pullProgress * 0.3}) rotate(${pullProgress * 180}deg)`,
                }}
              >
                <ArrowUp className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-[11px] font-heading font-black uppercase tracking-wider text-slate-100">
                {pullProgress >= 0.95 ? 'Release to view' : 'Pull for'}{' '}
                <span className="text-emerald-400">{nextDateLabel}</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 2. BOTTOM OVERSCROLL BANNER (PULL FOR PAST DAY) ─── */}
      <AnimatePresence>
        {pullDirection === 'past' && canGoPast && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 dark:bg-zinc-800/95 text-white border border-slate-700/80 dark:border-white/20 shadow-xl backdrop-blur-md">
              <div
                className="w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center transition-transform"
                style={{
                  transform: `scale(${0.8 + pullProgress * 0.3}) rotate(${pullProgress * 180}deg)`,
                }}
              >
                <ArrowDown className="w-3 h-3 text-blue-400" />
              </div>
              <span className="text-[11px] font-heading font-black uppercase tracking-wider text-slate-100">
                {pullProgress >= 0.95 ? 'Release to view' : 'Pull for'}{' '}
                <span className="text-blue-400">{pastDateLabel}</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 3. FLOATING SIDE "BEYOND THE DAY" BUTTONS ─── */}
      <div
        className={`fixed right-2.5 sm:right-4 top-[48%] -translate-y-1/2 z-35 flex flex-col items-end gap-2 pointer-events-none select-none ${className}`}
      >
        {/* Next Day Pill Button */}
        {canGoNext && (
          <motion.button
            whileHover={{ scale: 1.05, x: -2 }}
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={goToNextDay}
            disabled={isTransitioning}
            title={`Go to Next Day (${nextDateLabel})`}
            className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-[#161920]/95 border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-200 shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:border-[#123c73]/40 dark:hover:border-red-500/40 hover:text-[#123c73] dark:hover:text-red-400 backdrop-blur-md transition-all cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:-translate-y-0.5 transition-transform">
              <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col text-left leading-tight pr-0.5 hidden sm:flex">
              <span className="text-[7.5px] font-heading font-black tracking-widest text-slate-400 uppercase">
                NEXT DAY
              </span>
              <span className="text-[10px] font-heading font-black tracking-wide uppercase text-slate-800 dark:text-slate-100">
                {nextDateLabel}
              </span>
            </div>
          </motion.button>
        )}

        {/* Past Day Pill Button */}
        {canGoPast && (
          <motion.button
            whileHover={{ scale: 1.05, x: -2 }}
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={goToPastDay}
            disabled={isTransitioning}
            title={`Go to Past Day (${pastDateLabel})`}
            className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-[#161920]/95 border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-200 shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:border-[#123c73]/40 dark:hover:border-red-500/40 hover:text-[#123c73] dark:hover:text-red-400 backdrop-blur-md transition-all cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:translate-y-0.5 transition-transform">
              <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col text-left leading-tight pr-0.5 hidden sm:flex">
              <span className="text-[7.5px] font-heading font-black tracking-widest text-slate-400 uppercase">
                PAST DAY
              </span>
              <span className="text-[10px] font-heading font-black tracking-wide uppercase text-slate-800 dark:text-slate-100">
                {pastDateLabel}
              </span>
            </div>
          </motion.button>
        )}
      </div>
    </>
  );
};

export default BeyondTheDayIndicator;