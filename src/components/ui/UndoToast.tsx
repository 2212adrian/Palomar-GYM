// src/components/ui/UndoToast.tsx
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

  useEffect(() => {
    if (!isOpen) return;

    setTimeLeft(duration);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onConfirm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, duration]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 15, scale: 0.95 }}
          className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-3000 flex items-center justify-between gap-4 bg-slate-900 dark:bg-neutral-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/10 w-[calc(100vw-24px)] md:w-auto md:min-w-115 md:max-w-lg lg:max-w-2xl"
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs font-medium truncate flex-1 leading-tight text-left">
              {message}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 select-none">
            {/* Undo Button with countdown indicator */}
            <button
              onClick={onUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-semibold rounded-lg transition-all cursor-pointer text-amber-400"
            >
              <RotateCcw className="w-3.5 h-3.5 animate-spin-reverse" />
              <span>Undo ({timeLeft}s)</span>
            </button>

            {/* Force Close / Confirm Deletion */}
            <button
              onClick={onConfirm}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white"
              title="Dismiss and delete immediately"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Countdown progress line */}
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: duration, ease: 'linear' }}
            className="absolute bottom-0 left-0 h-1 bg-amber-500 rounded-b-2xl"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};