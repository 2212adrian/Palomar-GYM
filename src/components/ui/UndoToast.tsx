// src/components/ui/UndoToast.tsx
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw,
  Trash2,
  X,
  ShoppingBag,
  Users,
  Clock,
  CreditCard,
  Pause,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface UndoItemDetail {
  name: string;
  qty?: number;
  price?: number;
}

export interface UndoItem {
  id: string;
  title: string;
  type?: 'sale' | 'logbook' | 'general';
  customerName?: string;
  customerType?: string;
  categoryOrPlan?: string;
  paymentMethod?: string;
  amount?: number;
  items?: UndoItemDetail[];
  timestamp?: string;
  referenceNumber?: string;
  extraInfo?: string;
}

export interface UndoToastProps {
  isOpen?: boolean;
  items: UndoItem[];
  duration?: number; // duration in seconds (default: 5)
  onUndoItem: (id: string) => void;
  onConfirmItem: (id: string) => void;
  onUndoAll: () => void;
  onConfirmAll: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  items,
  duration = 5,
  onUndoItem,
  onConfirmItem,
  onUndoAll,
  onConfirmAll,
}) => {
  const totalMs = duration * 1000;
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [isPaused, setIsPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const prevItemsLength = useRef(items.length);
  const onConfirmAllRef = useRef(onConfirmAll);
  onConfirmAllRef.current = onConfirmAll;

  // Whenever items are added to the stack, refresh timer to give the user full reaction time
  useEffect(() => {
    if (items.length > prevItemsLength.current) {
      setRemainingMs(totalMs);
      setIsProcessing(false);
    }
    prevItemsLength.current = items.length;
  }, [items.length, totalMs]);

  // Reset states when empty
  useEffect(() => {
    if (items.length === 0) {
      setIsProcessing(false);
      setIsExpanded(false);
      setIsPaused(false);
      setRemainingMs(totalMs);
    }
  }, [items.length, totalMs]);

  // High-precision ticker (pauses on hover or touch/expand)
  useEffect(() => {
    if (items.length === 0 || isProcessing || isPaused || isExpanded) return;

    const intervalStep = 50;
    const timer = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= intervalStep) {
          clearInterval(timer);
          setIsProcessing(true);
          onConfirmAllRef.current();
          return 0;
        }
        return prev - intervalStep;
      });
    }, intervalStep);

    return () => clearInterval(timer);
  }, [items.length, isPaused, isExpanded, isProcessing]);

  if (items.length === 0) return null;

  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  const progressPercent = Math.max(
    0,
    Math.min(100, (remainingMs / totalMs) * 100)
  );
  const isDetailsOpen = isHovered || isExpanded;

  const formatTimestamp = (raw?: string) => {
    if (!raw) return null;
    try {
      const d = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
      return format(d, 'hh:mm:ss a');
    } catch {
      return raw;
    }
  };

  const totalAmountSum = items.reduce(
    (acc, it) => acc + (Number(it.amount) || 0),
    0
  );

  return (
    <div className="fixed bottom-32 sm:bottom-28 lg:bottom-8 left-1/2 -translate-x-1/2 z-3000 flex flex-col items-center w-[calc(100vw-1.5rem)] sm:w-auto sm:min-w-[480px] sm:max-w-xl pointer-events-none px-1">
      <motion.div
        layout
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.92 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onMouseEnter={() => {
          setIsHovered(true);
          setIsPaused(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsPaused(false);
        }}
        onTouchStart={() => {
          setIsPaused(true);
        }}
        onTouchEnd={() => {
          if (!isExpanded) {
            setIsPaused(false);
          }
        }}
        className="pointer-events-auto w-full bg-white/95 dark:bg-[#161920]/95 backdrop-blur-2xl text-slate-900 dark:text-slate-100 rounded-3xl shadow-2xl border border-slate-200/90 dark:border-zinc-800/90 overflow-hidden select-none"
      >
        {/* TOP BAR / SUMMARY ROW */}
        <div className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2.5">
            {/* Left badge & summary text */}
            <div
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
            >
              <div className="relative w-9 h-9 rounded-2xl bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/20 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
                {items.length > 1 ? (
                  <Layers className="w-4.5 h-4.5" />
                ) : (
                  <Trash2 className="w-4.5 h-4.5" />
                )}
                {items.length > 1 && (
                  <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-rose-600 text-white text-[10px] font-heading font-black flex items-center justify-center shadow-xs">
                    {items.length}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs sm:text-sm font-bold truncate leading-tight text-slate-900 dark:text-white">
                    {items.length === 1
                      ? `Removing ${items[0].title}`
                      : `Removing ${items.length} items`}
                  </p>

                  {(isPaused || isExpanded) && !isProcessing && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-heading font-black tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                      <Pause className="w-2.5 h-2.5" />
                      PAUSED
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                  {items.length > 1
                    ? `${items[0].title} + ${items.length - 1} more • Tap to inspect`
                    : 'Hover or tap to inspect breakdown before deletion'}
                </p>
              </div>
            </div>

            {/* Right Global Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Expand Drawer Button */}
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="p-1.5 sm:px-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 text-xs font-bold cursor-pointer transition-colors"
                title={isDetailsOpen ? 'Collapse list' : 'View all items'}
              >
                <span className="hidden sm:inline text-[11px]">
                  {isDetailsOpen ? 'Hide' : 'Details'}
                </span>
                {isDetailsOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Global Undo All */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={(e) => {
                  e.stopPropagation();
                  onUndoAll();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 font-heading font-bold text-xs rounded-xl bg-amber-500/10 hover:bg-amber-500/25 active:scale-95 text-amber-700 dark:text-amber-400 border border-amber-500/30 cursor-pointer shadow-xs transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {items.length > 1
                    ? `Undo All (${secondsLeft}s)`
                    : `Undo (${secondsLeft}s)`}
                </span>
              </button>

              {/* Global Dismiss All */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmAll();
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Dismiss and delete all immediately"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* EXPANDABLE HOVER / TOUCH DRAWER (INDIVIDUAL ITEM ROWS) */}
          <AnimatePresence>
            {isDetailsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden border-t border-slate-100 dark:border-zinc-800/80 pt-3 space-y-2.5"
              >
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                  <span>Stacked Items ({items.length})</span>
                  {totalAmountSum > 0 && (
                    <span className="text-slate-700 dark:text-slate-300 font-heading font-black">
                      Total: ₱{totalAmountSum.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Scrollable list of items */}
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {items.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="p-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200/70 dark:border-zinc-800/80 flex flex-col gap-2"
                      >
                        {/* Item Headline & Individual Action Buttons */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {item.type === 'sale' ? (
                              <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            ) : (
                              <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            )}
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {item.title}
                            </span>
                          </div>

                          {/* Individual Item Buttons: UNDO & X */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onUndoItem(item.id)}
                              className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-heading font-bold text-[10px] uppercase flex items-center gap-1 border border-amber-500/20 active:scale-95 transition-all cursor-pointer"
                              title="Undo this item only"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Undo</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onConfirmItem(item.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete this item now"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Breakdown Sub-lines */}
                        {item.type === 'sale' &&
                          item.items &&
                          item.items.length > 0 && (
                            <div className="pl-5 space-y-1">
                              {item.items.map((sub, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 font-medium"
                                >
                                  <span className="truncate">
                                    {sub.name}{' '}
                                    {sub.qty && sub.qty > 1
                                      ? `(${sub.qty}x)`
                                      : ''}
                                  </span>
                                  {sub.price !== undefined && (
                                    <span className="font-mono text-slate-700 dark:text-slate-300 shrink-0">
                                      ₱{(sub.price * (sub.qty || 1)).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                        {/* Logbook / Sale Footer Info */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10px] text-slate-500 dark:text-slate-400 pl-5">
                          <div className="flex items-center gap-2">
                            {item.paymentMethod && (
                              <span className="flex items-center gap-1">
                                <CreditCard className="w-3 h-3 text-slate-400" />
                                {item.paymentMethod}
                              </span>
                            )}
                            {item.timestamp && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {formatTimestamp(item.timestamp)}
                              </span>
                            )}
                          </div>
                          {item.amount !== undefined && (
                            <span className="font-heading font-black text-slate-900 dark:text-white">
                              ₱{Number(item.amount).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress Countdown Line */}
        <div className="relative w-full h-1 bg-slate-100 dark:bg-zinc-800">
          <div
            style={{
              width: `${isProcessing ? 100 : progressPercent}%`,
              transition: isPaused || isExpanded ? 'none' : 'width 50ms linear',
            }}
            className={`h-full ${
              isProcessing
                ? 'bg-slate-400 dark:bg-zinc-600'
                : isPaused || isExpanded
                  ? 'bg-amber-400 dark:bg-amber-500'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600'
            }`}
          />
        </div>
      </motion.div>
    </div>
  );
};
