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
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isOpen || isProcessing) return;

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
  }, [isOpen, duration, isProcessing]);

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
        <motion.div
          initial={{ opacity: 0, y: 15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto flex items-center justify-between gap-4 bg-slate-900 dark:bg-neutral-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/10 w-[calc(100vw-24px)] md:w-auto md:min-w-115 md:max-w-lg lg:max-w-2xl relative overflow-hidden select-none"
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Trash2 className={`w-4 h-4 shrink-0 ${isProcessing ? 'text-slate-500' : 'text-red-400'}`} />
            <p className={`text-xs font-medium truncate flex-1 leading-tight text-left ${isProcessing ? 'text-slate-400' : 'text-white'}`}>
              {message}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Undo Button with countdown indicator */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleUndoClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold text-xs rounded-lg transition-all cursor-pointer select-none ${
                isProcessing 
                  ? 'bg-white/5 text-slate-500 cursor-not-allowed' 
                  : 'bg-white/10 hover:bg-white/20 active:scale-95 text-amber-400'
              }`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isProcessing ? '' : 'animate-spin-reverse'}`} />
              <span>{isProcessing ? 'Processing' : `Undo (${timeLeft}s)`}</span>
            </button>

            {/* Force Close / Confirm Deletion */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleConfirmClick}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isProcessing 
                  ? 'text-slate-600 cursor-not-allowed' 
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title="Dismiss and delete immediately"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Countdown progress line */}
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: isProcessing ? '100%' : '0%' }}
            transition={{ duration: isProcessing ? 0 : duration, ease: 'linear' }}
            className={`absolute bottom-0 left-0 h-1 rounded-b-2xl ${isProcessing ? 'bg-slate-700' : 'bg-amber-500'}`}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};