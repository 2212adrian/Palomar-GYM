// src/pages/cash/components/CashFloatModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Coins, Check, X, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import { useAuthStore } from '../../../stores/authStore';
import { openCashSession } from '../../../lib/supabase/cashService';
import { Button } from '../../../components/ui/Button';

const QUICK_AMOUNTS = [500, 1000, 2000, 3000, 5000];

export const CashFloatModal: React.FC = () => {
  const { user, profile } = useAuthStore();

  // Exclusive for Admin and Superadmin only — Staff never see this
  const isAdminOrSuperAdmin = profile?.role === 'admin';

  const {
    isInitializing,
    isSessionOpen,
    history,
    loadActiveSession,
    loadHistory,
  } = useCashSessionStore();

  const [isDismissed, setIsDismissed] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState('1000');
  const [openingNotes, setOpeningNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Storage key per user to track if prompt has already been shown this login session
  const sessionPromptKey = user?.id
    ? `palomar_cash_float_seen_${user.id}`
    : 'palomar_cash_float_seen';

  // Check if previously dismissed or interacted with during this login.
  // Held in state (not a memo) so it can be refreshed the moment we record it.
  const [hasAlreadySeen, setHasAlreadySeen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem(sessionPromptKey) === 'true';
  });

  // Re-read whenever the signed-in user changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHasAlreadySeen(sessionStorage.getItem(sessionPromptKey) === 'true');
  }, [sessionPromptKey]);

  // 3 seconds countdown before Open Drawer button is enabled
  useEffect(() => {
    if (
      isInitializing ||
      isSessionOpen ||
      isDismissed ||
      hasAlreadySeen ||
      !isAdminOrSuperAdmin
    ) {
      return;
    }
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    isInitializing,
    isSessionOpen,
    isDismissed,
    hasAlreadySeen,
    isAdminOrSuperAdmin,
  ]);

  // Record the prompt as seen for the remainder of this login session.
  const markPromptSeen = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(sessionPromptKey, 'true');
    }
    setHasAlreadySeen(true);
  };

  // A drawer that is already open -- however it was opened -- means the float has
  // been entered for this shift. Crucially this also covers the Cash Management
  // page, which opens sessions directly without touching the modal.
  //
  // Marking it here is what stops the prompt from re-appearing when the session
  // is later ENDED: isSessionOpen flips back to false, but the marker persists.
  useEffect(() => {
    if (!isSessionOpen) return;

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(sessionPromptKey, 'true');
    }
    setHasAlreadySeen(true);
    setIsDismissed(true);
  }, [isSessionOpen, sessionPromptKey]);

  // Previous shift counted cash (leftover change fund from last session)
  const lastCountedCash = useMemo(() => {
    if (!history || history.length === 0) return null;
    const lastSession = history.find(
      (s) => s.status === 'closed' && s.closing_actual_cash !== null
    );
    return lastSession && lastSession.closing_actual_cash !== null
      ? Number(lastSession.closing_actual_cash)
      : null;
  }, [history]);

  // Auto-fill input with yesterday's leftover money if available
  useEffect(() => {
    if (lastCountedCash !== null && !isSessionOpen) {
      setOpeningFloatInput(lastCountedCash.toString());
    }
  }, [lastCountedCash, isSessionOpen]);

  // Handle "Just checking in" (dismiss modal for this login session)
  const handleJustCheckingIn = () => {
    markPromptSeen();
    setIsDismissed(true);
  };

  // Submit Enter Cash Float
  const handleOpenDrawer = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(openingFloatInput);
    if (isNaN(amount) || amount < 0) {
      toast.error('Please enter a valid starting cash amount.');
      return;
    }

    try {
      setIsSubmitting(true);
      const staffName =
        profile?.username ||
        user?.user_metadata?.full_name ||
        user?.email ||
        'Admin';

      await openCashSession({
        openingFloat: amount,
        notes: openingNotes.trim() || undefined,
        openedBy: user?.id || null,
        openedByName: staffName,
      });

      // Mark as seen so it doesn't show again
      markPromptSeen();
      setIsDismissed(true);

      toast.success(
        `Cash drawer ready with ₱${amount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
        })} starting change!`
      );

      await loadActiveSession();
      await loadHistory();
    } catch (err: any) {
      toast.error(
        err?.message || 'Could not open cash drawer. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Never show for staff
  if (!isAdminOrSuperAdmin) return null;

  // 2. Never show if checking status, session already active, or user dismissed for this login
  if (isInitializing || isSessionOpen || isDismissed || hasAlreadySeen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-md bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center relative">
          <button
            type="button"
            onClick={handleJustCheckingIn}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Coins className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-heading font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Enter Cash Float
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
            How much petty cash or change fund is in the cash drawer today?
          </p>
        </div>

        {/* Body */}
        <form onSubmit={handleOpenDrawer} className="p-6 space-y-4 pt-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Starting Cash in Drawer
              </label>
              {lastCountedCash !== null && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Last count:{' '}
                  <strong>₱{lastCountedCash.toLocaleString()}</strong>
                </span>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">
                ₱
              </span>
              <input
                type="number"
                min="0"
                step="1"
                required
                autoFocus
                value={openingFloatInput}
                onChange={(e) => setOpeningFloatInput(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-slate-800/80 rounded-2xl text-2xl font-heading font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {lastCountedCash !== null && (
                <button
                  type="button"
                  onClick={() =>
                    setOpeningFloatInput(lastCountedCash.toString())
                  }
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    openingFloatInput === lastCountedCash.toString()
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                  }`}
                >
                  <RotateCcw className="w-3 h-3" />
                  Yesterday's leftover (₱{lastCountedCash.toLocaleString()})
                </button>
              )}

              {QUICK_AMOUNTS.map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => setOpeningFloatInput(amt.toString())}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    openingFloatInput === amt.toString()
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-[#1e232d] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60'
                  }`}
                >
                  ₱{amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Short note (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Added extra small bills for change"
              value={openingNotes}
              onChange={(e) => setOpeningNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-slate-800/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={countdown > 0 || isSubmitting}
              className="w-full py-3.5 text-sm font-heading font-black tracking-wide !bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800 disabled:!bg-emerald-700 disabled:cursor-not-allowed text-white border-none shadow-md shadow-emerald-600/20 cursor-pointer transition-all"
            >
              <Check className="w-4 h-4 mr-1.5" />
              {countdown > 0
                ? `Please wait in (${countdown}s)`
                : 'Place Cash in Drawer'}
            </Button>

            <button
              type="button"
              onClick={handleJustCheckingIn}
              className="w-full py-2.5 text-xs font-bold text-white-500 hover:text-slate-800 dark:text-white-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              Just checking in (Skip for now)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
