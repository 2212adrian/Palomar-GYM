import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Trash2, X } from 'lucide-react';

interface UndoToastProps {
  isOpen: boolean;
  message: string;
  duration?: number; // duration in seconds
  onConfirm: () => void;
  onUndo: () => void;
  onClose: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  isOpen,
  message,
  duration = 5,
  onConfirm,
  onUndo
}) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset internal processing and timer state whenever a new toast opens or message changes
  useEffect(() => {
    if (!isOpen) {
      setIsProcessing(false);
      setTimeLeft(duration);
      return;
    }

    setIsProcessing(false);
    setTimeLeft(duration);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsProcessing(true);
          onConfirm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, duration, message]);

  const handleUndoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessing) return;
    setIsProcessing(true);
    onUndo();
  };

  const handleConfirmClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessing) return;
    setIsProcessing(true);
    onConfirm();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none pb-6 px-4 sm:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto flex items-center justify-between gap-3 sm:gap-4 bg-white dark:bg-zinc-900 text-slate-900 dark:text-slate-100 px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl shadow-xl dark:shadow-2xl border border-slate-200 dark:border-zinc-800 w-full sm:w-auto sm:min-w-[420px] sm:max-w-lg lg:max-w-xl relative overflow-hidden select-none"
          >
            {/* Status Icon & Message Body */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Trash2 className={`w-4 h-4 shrink-0 ${isProcessing ? 'text-slate-400 dark:text-slate-600' : 'text-red-500 dark:text-red-400'}`} />
              <p className={`text-xs font-medium truncate flex-1 leading-tight text-left ${isProcessing ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                {message}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Undo Button with Countdown */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleUndoClick}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs rounded-xl transition-all cursor-pointer select-none border ${
                  isProcessing 
                    ? 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-slate-600 border-transparent cursor-not-allowed' 
                    : 'bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-700 dark:text-amber-400 border-amber-500/20'
                }`}
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isProcessing ? '' : 'animate-spin-reverse'}`} />
                <span>{isProcessing ? 'Processing...' : `Undo (${timeLeft}s)`}</span>
              </button>

              {/* Dismiss / Force Confirm */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmClick}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  isProcessing 
                    ? 'text-slate-300 dark:text-zinc-700 cursor-not-allowed' 
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
                title="Dismiss and reject immediately"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Countdown Progress Line Indicator */}
            <motion.div
              key={message}
              initial={{ width: '100%' }}
              animate={{ width: isProcessing ? '100%' : '0%' }}
              transition={{ duration: isProcessing ? 0 : duration, ease: 'linear' }}
              className={`absolute bottom-0 left-0 h-1 rounded-b-2xl ${
                isProcessing ? 'bg-slate-300 dark:bg-zinc-700' : 'bg-amber-500'
              }`}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};