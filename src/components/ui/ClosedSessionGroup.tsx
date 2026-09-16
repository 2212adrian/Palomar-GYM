// src/components/ui/ClosedSessionGroup.tsx
import React, { useState, useMemo } from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  ChevronDown,
  Clock,
  ShieldCheck,
  ShoppingBag,
  Users,
  Moon,
} from 'lucide-react';

export interface SessionSummaryInfo {
  id: string;
  session_number?: string;
  opened_at?: string;
  closed_at?: string | null;
  opened_by_name?: string;
  closed_by_name?: string | null;
  status?: string;
}

interface ClosedSessionGroupProps {
  session: SessionSummaryInfo;
  mode: 'sale' | 'attendance';
  totalRevenue: number;
  itemCount: number;
  children: React.ReactNode;
}

export const ClosedSessionGroup: React.FC<ClosedSessionGroupProps> = ({
  session,
  mode,
  totalRevenue,
  itemCount,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const { isOvernight, timeLabel } = useMemo(() => {
    if (!session.opened_at) {
      return { isOvernight: false, timeLabel: '' };
    }

    try {
      const openDate = parseISO(session.opened_at);
      const closeDate = session.closed_at ? parseISO(session.closed_at) : null;

      if (!closeDate) {
        return {
          isOvernight: false,
          timeLabel: `Opened ${format(openDate, 'h:mm a')}`,
        };
      }

      const overnight = !isSameDay(openDate, closeDate);

      if (overnight) {
        return {
          isOvernight: true,
          timeLabel: `${format(openDate, 'MMM d, h:mm a')} → ${format(closeDate, 'MMM d, h:mm a')}`,
        };
      }

      return {
        isOvernight: false,
        timeLabel: `${format(openDate, 'h:mm a')} → ${format(closeDate, 'h:mm a')}`,
      };
    } catch {
      return { isOvernight: false, timeLabel: '' };
    }
  }, [session.opened_at, session.closed_at]);

  return (
    <div className="rounded-2xl border border-blue-200/90 dark:border-blue-900/60 bg-blue-50/30 dark:bg-[#0d1624] overflow-hidden transition-all duration-200 shadow-xs hover:border-blue-300 dark:hover:border-blue-800">
      {/* Session Container Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors bg-blue-50/50 hover:bg-blue-100/50 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Blue Lock Icon */}
          <div className="w-10 h-10 rounded-xl bg-blue-600 dark:bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Lock className="w-5 h-5 stroke-[2.2]" />
          </div>

          {/* Session Metadata */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-heading font-black text-blue-900 dark:text-blue-100 tracking-wide uppercase">
                {session.session_number || 'CLOSED SESSION'}
              </span>

              <span className="text-[9px] font-heading font-black uppercase px-2 py-0.5 rounded-md bg-blue-200/70 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700/50 tracking-wider">
                ENDED
              </span>

              {isOvernight && (
                <span className="text-[9px] font-heading font-black uppercase px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-400/30 tracking-wider inline-flex items-center gap-1">
                  <Moon className="w-2.5 h-2.5" />
                  OVERNIGHT
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-blue-700/80 dark:text-blue-300/80 font-medium mt-0.5 flex-wrap">
              {timeLabel && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-500 shrink-0" />
                  {timeLabel}
                </span>
              )}
              {session.closed_by_name && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-blue-500 shrink-0" />
                    Closed by {session.closed_by_name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Summary Pointers & Chevron */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs sm:text-sm font-mono font-black text-blue-700 dark:text-blue-300 tracking-tight">
              ₱{totalRevenue.toFixed(2)}
            </div>
            <div className="text-[10px] font-heading font-bold uppercase tracking-wider text-blue-600/80 dark:text-blue-400/80 flex items-center justify-end gap-1">
              {mode === 'sale' ? (
                <>
                  <ShoppingBag className="w-3 h-3" />
                  <span>
                    {itemCount} {itemCount === 1 ? 'Sale' : 'Sales'}
                  </span>
                </>
              ) : (
                <>
                  <Users className="w-3 h-3" />
                  <span>
                    {itemCount} {itemCount === 1 ? 'Entry' : 'Entries'}
                  </span>
                </>
              )}
            </div>
          </div>

          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </div>
      </button>

      {/* Contained Cards List (Default Collapsed) */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="p-3 sm:p-4 space-y-2.5 border-t border-blue-200/70 dark:border-blue-900/50 bg-slate-50/50 dark:bg-[#0a111a]/40">
              <div className="text-[10px] font-heading font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 pl-1">
                Contained Records on this day ({itemCount})
              </div>
              <div className="space-y-2.5">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
