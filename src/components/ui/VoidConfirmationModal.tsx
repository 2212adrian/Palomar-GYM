import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, FileText, Trash2, X } from 'lucide-react';
import { Button } from './Button';

export interface VoidConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  subtitle?: string;
  itemSummary: string;
  amount?: number;
  paymentMethod?: string;
  presetReasons: string[];
  confirmLabel?: string;
  isSubmitting?: boolean;
}

export const VoidConfirmationModal: React.FC<VoidConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle = 'Specify why this entry is being voided. The reason will be recorded permanently in Audit Logs.',
  itemSummary,
  amount,
  paymentMethod,
  presetReasons,
  confirmLabel = 'Confirm Void & Move to Bin',
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setTouched(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const trimmedReason = reason.trim();
  const isReasonValid = trimmedReason.length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isReasonValid || isSubmitting) return;
    await onConfirm(trimmedReason);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!isSubmitting) onClose();
            }}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-confirm-title"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#161920] shadow-2xl overflow-hidden text-slate-900 dark:text-white"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200/80 dark:border-zinc-800 bg-rose-500/5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="void-confirm-title"
                    className="text-sm sm:text-base font-heading font-black tracking-tight uppercase text-slate-900 dark:text-white leading-tight"
                  >
                    {title}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                aria-label="Close confirmation modal"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Target Summary Box */}
              <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/70 p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    Entry to Void
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                    {itemSummary}
                  </div>
                  {paymentMethod && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Method: <span className="font-semibold">{paymentMethod}</span>
                    </div>
                  )}
                </div>
                {typeof amount === 'number' && !Number.isNaN(amount) && (
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                      Amount
                    </div>
                    <div className="text-sm sm:text-base font-heading font-black text-rose-600 dark:text-rose-400 tabular-nums">
                      ₱{amount.toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Preset Reasons */}
              {presetReasons.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Quick Reasons
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {presetReasons.map((preset) => {
                      const isActive = trimmedReason === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => {
                            setReason(preset);
                            setTouched(true);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer disabled:opacity-50 ${
                            isActive
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-rose-400/60 hover:bg-rose-500/10'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Required Reason Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="void-reason-input"
                  className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  <span>
                    Void Reason <span className="text-rose-500">*</span>
                  </span>
                  <span className="text-[10px] font-normal text-slate-400">
                    Logged to Audit Trail
                  </span>
                </label>
                <textarea
                  id="void-reason-input"
                  rows={3}
                  maxLength={240}
                  disabled={isSubmitting}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="Indicate why this item is being voided (e.g., Duplicate entry, Wrong quantity, Cancelled by customer)..."
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm bg-white dark:bg-zinc-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 transition-all resize-none ${
                    touched && !isReasonValid
                      ? 'border-rose-500 focus:ring-rose-500/30'
                      : 'border-slate-200 dark:border-zinc-700 focus:border-rose-500 focus:ring-rose-500/20'
                  }`}
                />
                {touched && !isReasonValid ? (
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    Please indicate a valid reason (at least 3 characters) to continue.
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      Void reason will appear in Audit Logs alongside your username.
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="px-4 h-10 text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={isSubmitting || !isReasonValid}
                  className="px-4 h-10 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Voiding...' : confirmLabel}</span>
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
