// src/pages/cash/components/CashSessionModals.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  Calculator,
  Coins,
  Banknote,
  Printer,
  DollarSign,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import {
  closeCashSession,
  fetchSessionTransactions,
} from '../../../lib/supabase/cashService';
import { supabase } from '../../../lib/supabase/client';
import { useAuthStore } from '../../../stores/authStore';
import { DENOMINATION_VALUES } from '../../../types/cash';
import type {
  DenominationCounts,
  CashFlowMetrics,
  CashSession,
  CashTransaction,
} from '../../../types/cash';

/* =========================================================================
   1. CLOSE CASH SESSION MODAL
   ========================================================================= */
interface CloseSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CashSession;
  metrics: CashFlowMetrics;
  pendingApprovalsCount?: number;
  onSuccess: () => Promise<void> | void;
}

const INITIAL_DENOMINATIONS: DenominationCounts = {
  bill_1000: 0,
  bill_500: 0,
  bill_200: 0,
  bill_100: 0,
  bill_50: 0,
  bill_20: 0,
  coin_20: 0,
  coin_10: 0,
  coin_5: 0,
  coin_1: 0,
  coin_025: 0,
};

export const CloseSessionModal: React.FC<CloseSessionModalProps> = ({
  isOpen,
  onClose,
  session,
  metrics,
  pendingApprovalsCount = 0,
  onSuccess,
}) => {
  const { user, profile } = useAuthStore();
  const [denominations, setDenominations] = useState<DenominationCounts>(
    INITIAL_DENOMINATIONS
  );
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countMode, setCountMode] = useState<'direct' | 'denominations'>(
    'direct'
  );
  const [directCashInput, setDirectCashInput] = useState('');
  const [closeCooldown, setCloseCooldown] = useState(3);

  // 3-second cooldown countdown whenever the modal opens
  useEffect(() => {
    if (!isOpen) {
      setCloseCooldown(3);
      return;
    }

    setCloseCooldown(3);
    const timer = setInterval(() => {
      setCloseCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const handleDenomChange = (key: keyof DenominationCounts, value: number) => {
    setDenominations((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.floor(value || 0)),
    }));
  };

  const handleIncrement = (key: keyof DenominationCounts, delta: number) => {
    setDenominations((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }));
  };

  const totalActualCash = useMemo(() => {
    if (countMode === 'direct') {
      const val = parseFloat(directCashInput);
      return isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100;
    }

    let sum = 0;
    (
      Object.keys(DENOMINATION_VALUES) as Array<keyof DenominationCounts>
    ).forEach((key) => {
      sum += (denominations[key] || 0) * DENOMINATION_VALUES[key].value;
    });
    return Math.round(sum * 100) / 100;
  }, [countMode, directCashInput, denominations]);

  const expectedCash = metrics.expectedDrawerCash;
  const discrepancy = Math.round((totalActualCash - expectedCash) * 100) / 100;

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isOffline) {
      toast.error('Session closure forbidden while offline. Active internet connection required.');
      return;
    }

    if (pendingApprovalsCount > 0) {
      toast.error(
        `Cannot close session: There ${
          pendingApprovalsCount === 1 ? 'is' : 'are'
        } ${pendingApprovalsCount} pending cash request${
          pendingApprovalsCount === 1 ? '' : 's'
        } awaiting approval or rejection.`
      );
      return;
    }

    if (countMode === 'direct' && !directCashInput.trim()) {
      toast.error('Please enter the counted cash amount.');
      return;
    }

    if (discrepancy !== 0 && (!notes.trim() || notes.trim().length < 5)) {
      toast.error(
        `Please provide a note (at least 5 characters) explaining the ${
          discrepancy < 0 ? 'cash shortage' : 'cash overage'
        }.`
      );
      return;
    }

    setShowConfirmClose(true);
  };

  const handleExecuteFinalClose = async () => {
    try {
      setIsSubmitting(true);
      const actorName =
        profile?.username ||
        user?.user_metadata?.full_name ||
        user?.email ||
        'Admin';

      // 1. Close the cash session in DB
      await closeCashSession({
        sessionId: session.id,
        actualCash: totalActualCash,
        expectedCash,
        discrepancy,
        notes: notes.trim() || undefined,
        denominations: countMode === 'denominations' ? denominations : {},
        closedBy: user?.id || null,
        closedByName: actorName,
      });

      // 2. HARD DELETE all remaining soft-deleted items (empties Recycle Bins permanently)
      try {
        const [{ data: deletedSales }, { data: deletedAttendance }] =
          await Promise.all([
            supabase.from('sales').select('id').not('deleted_at', 'is', null),
            supabase
              .from('attendance')
              .select('id')
              .not('deleted_at', 'is', null),
          ]);

        if (deletedSales && deletedSales.length > 0) {
          await supabase
            .from('sales')
            .delete()
            .in(
              'id',
              deletedSales.map((s: any) => s.id)
            );
        }

        if (deletedAttendance && deletedAttendance.length > 0) {
          await supabase
            .from('attendance')
            .delete()
            .in(
              'id',
              deletedAttendance.map((a: any) => a.id)
            );
        }

        await supabase.rpc('purge_old_soft_deleted_sales');
        await supabase.rpc('purge_soft_deleted_attendance');
      } catch (purgeErr) {
        console.warn('Recycle bin purge error:', purgeErr);
      }

      toast.success(
        `Cash Session #${session.session_number} closed successfully.`
      );

      try {
        await onSuccess();
      } catch (refreshErr) {
        console.warn('Post-close refresh warning:', refreshErr);
      }

      setShowConfirmClose(false);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to close cash session in Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CLOSE CASH SESSION & RECONCILE"
      className="max-w-3xl p-4 sm:p-6 text-left max-h-[92vh] flex flex-col"
    >
      {/* Top Fixed Area: Session Summary Header */}
      <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 bg-slate-100 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl mb-2.5 shrink-0">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active Session
          </span>
          <p className="text-xs sm:text-sm font-heading font-bold text-slate-900 dark:text-white">
            {session.session_number}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Opened By
          </span>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {session.opened_by_name}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Fixed Area: Count Mode Selector Tabs (Non-scrollable) */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-[#1e232d] rounded-xl border border-slate-200/80 dark:border-slate-800/80 mb-3 shrink-0">
          <button
            type="button"
            onClick={() => setCountMode('direct')}
            className={`py-2 text-xs font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              countMode === 'direct'
                ? 'bg-white dark:bg-[#161920] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Direct Amount
          </button>
          <button
            type="button"
            onClick={() => setCountMode('denominations')}
            className={`py-2 text-xs font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              countMode === 'denominations'
                ? 'bg-white dark:bg-[#161920] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Count Denominations
          </button>
        </div>

        {/* Scrollable Middle Area: Count Inputs & Notes */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3">
          {/* Mode 1: Direct Amount Input */}
          {countMode === 'direct' ? (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Actual Counted Cash in Drawer (₱) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                  ₱
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  placeholder="0.00"
                  value={directCashInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setDirectCashInput(val);
                  }}
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-50 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80 rounded-xl text-xl sm:text-2xl font-heading font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              {!directCashInput.trim() && (
                <p className="text-[11px] text-rose-500 font-semibold">
                  * Input is required to end the session.
                </p>
              )}
            </div>
          ) : (
            /* Mode 2: Denominations Counter */
            <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-heading uppercase tracking-wider text-slate-900 dark:text-white font-bold">
                    Physical Drawer Denominations
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setDenominations(INITIAL_DENOMINATIONS)}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>

              {/* Banknotes */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                  <Banknote className="w-3.5 h-3.5" /> Banknotes
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    [
                      'bill_1000',
                      'bill_500',
                      'bill_200',
                      'bill_100',
                      'bill_50',
                      'bill_20',
                    ] as Array<keyof DenominationCounts>
                  ).map((key) => {
                    const meta = DENOMINATION_VALUES[key];
                    const count = denominations[key] || 0;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80"
                      >
                        <div className="w-20">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {meta.label}
                          </span>
                          <p className="text-[10px] text-slate-500 font-mono">
                            = ₱
                            {(count * meta.value).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleIncrement(key, -1)}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <MinusCircle className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={count === 0 ? '' : count}
                            placeholder="0"
                            onChange={(e) =>
                              handleDenomChange(
                                key,
                                parseInt(e.target.value, 10)
                              )
                            }
                            className="w-12 text-center py-1 bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-lg text-xs font-bold font-mono text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleIncrement(key, 1)}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Coins */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                  <Coins className="w-3.5 h-3.5" /> Metallic Coins
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    [
                      'coin_20',
                      'coin_10',
                      'coin_5',
                      'coin_1',
                      'coin_025',
                    ] as Array<keyof DenominationCounts>
                  ).map((key) => {
                    const meta = DENOMINATION_VALUES[key];
                    const count = denominations[key] || 0;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80"
                      >
                        <div className="w-20">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {meta.label}
                          </span>
                          <p className="text-[10px] text-slate-500 font-mono">
                            = ₱
                            {(count * meta.value).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleIncrement(key, -1)}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <MinusCircle className="w-4 h-4" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={count === 0 ? '' : count}
                            placeholder="0"
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                handleDenomChange(key, 0);
                                return;
                              }
                              const num = parseInt(val.replace(/\D/g, ''), 10);
                              handleDenomChange(key, isNaN(num) ? 0 : num);
                            }}
                            className="w-12 text-center py-1 bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-lg text-xs font-bold font-mono text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleIncrement(key, 1)}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Breakdown & Shift Notes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
            {/* Calculation Breakdown */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Shift Cash Breakdown
              </span>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span>Opening Float:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    ₱{metrics.openingFloat.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span>Cash Collections:</span>
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    +₱{(metrics.cashSales + metrics.cashLogbook).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span>Manual In / Out Net:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {metrics.cashInTotal - metrics.cashOutTotal >= 0 ? '+' : '-'}₱{Math.abs(metrics.cashInTotal - metrics.cashOutTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Shift Notes */}
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-0.5">
                <label
                  className={`block text-[10px] font-bold uppercase tracking-wider ${
                    discrepancy !== 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {discrepancy !== 0
                    ? `Discrepancy Note (${discrepancy < 0 ? 'Shortage' : 'Overage'}) *`
                    : 'Shift Notes (Optional)'}
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {notes.length}/300
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={300}
                placeholder={
                  discrepancy !== 0
                    ? 'Explain the cause of shortage or overage...'
                    : 'Handover notes, comments...'
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                className={`w-full px-3 py-2 bg-white dark:bg-[#161920] border rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 resize-none ${
                  discrepancy !== 0 && (!notes.trim() || notes.trim().length < 5)
                    ? 'border-rose-400 dark:border-rose-500/50 focus:ring-rose-500'
                    : 'border-slate-200/80 dark:border-slate-800/80 focus:ring-blue-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Bottom Pinned Area: Expected, Counted, Discrepancy & Joined Action Buttons */}
        <div className="pt-2.5 mt-2 border-t border-slate-200/80 dark:border-slate-800/80 shrink-0 space-y-2.5">
          {/* Prominent Non-Scrollable Reconciliation Bar */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <div className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-[#1e232d] text-center sm:text-left">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block truncate">
                Expected Cash
              </span>
              <span className="font-heading font-black text-xs sm:text-base text-slate-900 dark:text-white block mt-0.5 truncate">
                ₱{expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center sm:text-left">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-blue-500 dark:text-blue-400 block truncate">
                Counted Cash
              </span>
              <span className="font-heading font-black text-xs sm:text-base text-blue-600 dark:text-blue-400 block mt-0.5 truncate">
                ₱{totalActualCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div
              className={`p-2 sm:p-2.5 rounded-xl text-center sm:text-left font-bold ${
                discrepancy === 0
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : discrepancy > 0
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              <div className="flex items-center justify-center sm:justify-start gap-1">
                {discrepancy === 0 ? (
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                )}
                <span className="text-[9px] sm:text-[10px] font-heading font-black tracking-wider uppercase truncate">
                  {discrepancy === 0
                    ? 'Balanced'
                    : discrepancy > 0
                      ? 'Overage'
                      : 'Shortage'}
                </span>
              </div>
              <span className="font-mono font-black text-xs sm:text-base block mt-0.5 truncate">
                {discrepancy === 0
                  ? '₱0.00'
                  : discrepancy > 0
                    ? `+₱${discrepancy.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    : `-₱${Math.abs(discrepancy).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

          {pendingApprovalsCount > 0 && (
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Resolve {pendingApprovalsCount} pending request(s) before closing.</span>
            </div>
          )}

          {/* Joined Buttons in One Row */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full py-2.5 sm:py-3 text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={
                isSubmitting ||
                isOffline ||
                closeCooldown > 0 ||
                pendingApprovalsCount > 0 ||
                (countMode === 'direct' && !directCashInput.trim())
              }
              title={
                isOffline
                  ? 'Active internet connection required to reconcile and close session'
                  : pendingApprovalsCount > 0
                  ? 'All pending requests must be approved or rejected before closing'
                  : undefined
              }
              className="w-full py-2.5 sm:py-3 text-xs font-heading font-black tracking-wide !bg-rose-600 hover:!bg-rose-700 active:!bg-rose-800 !text-white border-none shadow-md shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center justify-center truncate"
            >
              <ShieldCheck className="w-4 h-4 mr-1.5 shrink-0" />
              <span className="truncate">
                {isOffline
                  ? 'Offline'
                  : pendingApprovalsCount > 0
                  ? `Pending (${pendingApprovalsCount})`
                  : closeCooldown > 0
                    ? `Close Session Now (${closeCooldown}s)`
                    : 'Close Session Now'}
              </span>
            </Button>
          </div>
        </div>
      </form>

      {/* CONFIRMATION POPUP OVERLAY TO PREVENT ACCIDENTAL CLOSURE */}
      {showConfirmClose && (
        <div className="fixed inset-0 z-500 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-white dark:bg-[#161920] border border-rose-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-heading font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  CONFIRM CLOSE SESSION
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Session #{session.session_number}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Counted Physical Cash:</span>
                <span className="font-heading font-bold text-slate-900 dark:text-white">
                  ₱{totalActualCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Expected Closing Cash:</span>
                <span className="font-heading font-bold text-slate-900 dark:text-white">
                  ₱{expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300">Variance / Discrepancy:</span>
                <span className={`font-mono font-black ${
                  discrepancy === 0 ? 'text-emerald-600 dark:text-emerald-400' : discrepancy > 0 ? 'text-amber-500' : 'text-rose-500'
                }`}>
                  {discrepancy === 0 ? 'Balanced (₱0.00)' : discrepancy > 0 ? `+₱${discrepancy.toFixed(2)} (Overage)` : `-₱${Math.abs(discrepancy).toFixed(2)} (Shortage)`}
                </span>
              </div>
            </div>

            <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold leading-relaxed">
              ⚠️ Warning: Closing this session permanently records drawer totals and reconciles the cash shift. This action cannot be undone.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmClose(false)}
                className="w-full py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel / Back
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteFinalClose}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-heading font-black tracking-wide text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>Yes, Close Session</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

/* =========================================================================
   2. SESSION DETAILS / REPORT MODAL (WITH CLEAN THERMAL RECEIPT PRINTING)
   ========================================================================= */
interface SessionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CashSession | null;
}

export const SessionDetailsModal: React.FC<SessionDetailsModalProps> = ({
  isOpen,
  onClose,
  session,
}) => {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [gymProfile, setGymProfile] = useState<{
    gym_name?: string;
    gym_address?: string;
  } | null>(null);

  useEffect(() => {
    if (!session?.id) return;

    setLoading(true);
    fetchSessionTransactions(session.id)
      .then(setTransactions)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    const fetchGymProfile = async () => {
      try {
        const { data } = await supabase
          .from('gym_profile')
          .select('gym_name, gym_address')
          .eq('id', 1)
          .maybeSingle();

        if (data) setGymProfile(data);
      } catch {}
    };

    fetchGymProfile();
  }, [session?.id]);

  if (!session) return null;

  const disc = Number(session.discrepancy || 0);
  const denoms = session.denominations || {};

  const handlePrintThermalReceipt = () => {
    const gymName = gymProfile?.gym_name || 'PALOMAR FITNESS GYM';
    const gymAddress = gymProfile?.gym_address || 'QUEZON CITY, METRO MANILA';

    const openedStr = format(new Date(session.opened_at), 'MMM d, yyyy h:mm a');
    const closedStr = session.closed_at
      ? format(new Date(session.closed_at), 'MMM d, yyyy h:mm a')
      : 'IN PROGRESS';

    const denomRows = Object.entries(denoms)
      .filter(([_, count]) => Number(count) > 0)
      .map(([key, count]) => {
        const meta = DENOMINATION_VALUES[key as keyof DenominationCounts];
        const label = meta?.label || key;
        const total = Number(count) * (meta?.value || 0);
        return `
          <div class="row">
            <span>${label} (${count}x)</span>
            <span>₱${total.toFixed(2)}</span>
          </div>
        `;
      })
      .join('');

    const validTxs = transactions.filter((tx) => tx.status !== 'rejected');
    const txRows =
      validTxs.length === 0
        ? '<div class="center text-muted">No manual cash movements</div>'
        : validTxs
            .map((tx) => {
              const sign = tx.type === 'cash_out' ? '-' : '+';
              if (tx.is_voided) {
                return `
            <div class="row text-muted" style="text-decoration: line-through;">
              <span>${tx.type.toUpperCase()}: ${tx.reason || 'Movement'} [VOIDED]</span>
              <span>₱0.00</span>
            </div>
          `;
              }
              return `
            <div class="row">
              <span>${tx.type.toUpperCase()}: ${tx.reason || 'Movement'}</span>
              <span>${sign}₱${Number(tx.amount).toFixed(2)}</span>
            </div>
          `;
            })
            .join('');

    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
    });
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cash Session Report - ${session.session_number}</title>
          <style>
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              html, body {
                width: 80mm !important;
                max-width: 80mm !important;
                margin: 0 auto !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-family: 'Courier New', Courier, monospace !important;
                font-size: 11px !important;
                line-height: 1.25 !important;
              }
              .receipt {
                width: 76mm !important;
                margin: 0 auto !important;
                padding: 4mm 2mm !important;
                box-sizing: border-box !important;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .divider {
                border-bottom: 1px dashed #000;
                margin: 2mm 0;
              }
              .row {
                display: flex;
                justify-content: space-between;
                margin: 1mm 0;
              }
              .highlight {
                font-size: 13px;
                font-weight: bold;
              }
              .text-muted { color: #555; }
              .title {
                font-size: 13px;
                font-weight: bold;
                letter-spacing: 0.5px;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center title">${gymName.toUpperCase()}</div>
            <div class="center text-muted" style="font-size: 9px;">${gymAddress.toUpperCase()}</div>
            <div class="divider"></div>

            <div class="center bold" style="font-size: 12px;">CASH SESSION REPORT</div>
            <div class="center bold">${session.session_number}</div>
            <div class="divider"></div>

            <div class="row">
              <span>Opened:</span>
              <span>${openedStr}</span>
            </div>
            <div class="row">
              <span>Opened By:</span>
              <span>${session.opened_by_name || 'Staff'}</span>
            </div>
            <div class="row">
              <span>Closed:</span>
              <span>${closedStr}</span>
            </div>
            <div class="row">
              <span>Closed By:</span>
              <span>${session.closed_by_name || 'Staff'}</span>
            </div>
            <div class="divider"></div>

            <div class="row">
              <span>Opening Float:</span>
              <span class="bold">₱${Number(session.opening_float || 0).toFixed(2)}</span>
            </div>
            <div class="row">
              <span>Expected Drawer:</span>
              <span class="bold">₱${Number(session.closing_expected_cash || 0).toFixed(2)}</span>
            </div>
            <div class="row highlight">
              <span>Counted Cash:</span>
              <span>₱${Number(session.closing_actual_cash || 0).toFixed(2)}</span>
            </div>
            <div class="row bold">
              <span>Discrepancy:</span>
              <span>${disc === 0 ? 'BALANCED' : (disc > 0 ? '+₱' : '-₱') + Math.abs(disc).toFixed(2)}</span>
            </div>

            ${
              denomRows
                ? `
              <div class="divider"></div>
              <div class="bold" style="margin-bottom: 1mm;">DENOMINATIONS:</div>
              ${denomRows}
            `
                : ''
            }

            <div class="divider"></div>
            <div class="bold" style="margin-bottom: 1mm;">SESSION CASH MOVEMENTS:</div>
            ${txRows}

            ${
              session.notes
                ? `
              <div class="divider"></div>
              <div class="bold">SHIFT NOTES:</div>
              <div style="font-size: 9.5px; margin-top: 1mm;">${session.notes}</div>
            `
                : ''
            }

            <div class="divider"></div>
            <div class="center text-muted" style="font-size: 8.5px; margin-top: 3mm;">
              --- END OF CASH REPORT ---
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                try {
                  window.print();
                } catch(e) {
                  console.error(e);
                }
                setTimeout(function() {
                  if (window.frameElement) {
                    window.frameElement.remove();
                  }
                }, 500);
              }, 400);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CASH SESSION SUMMARY REPORT"
      className="max-w-2xl p-6 text-left"
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-100 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80 gap-2">
          <div>
            <span className="text-[10px] font-black uppercase text-slate-500">
              Session Reference
            </span>
            <p className="text-base font-heading font-black text-slate-900 dark:text-white">
              {session.session_number}
            </p>
          </div>
          <div className="text-xs space-y-0.5 sm:text-right text-slate-500">
            <p>
              Opened:{' '}
              {format(new Date(session.opened_at), 'MMM d, yyyy h:mm a')} by{' '}
              {session.opened_by_name}
            </p>
            {session.closed_at && (
              <p>
                Closed:{' '}
                {format(new Date(session.closed_at), 'MMM d, yyyy h:mm a')} by{' '}
                {session.closed_by_name || 'Admin'}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-slate-500 block">Opening Float</span>
            <span className="font-bold text-sm">
              ₱
              {Number(session.opening_float || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-slate-500 block">Expected Drawer</span>
            <span className="font-bold text-sm">
              ₱
              {Number(session.closing_expected_cash || 0).toLocaleString(
                'en-US',
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-slate-500 block">Counted Cash</span>
            <span className="font-bold text-sm text-blue-600 dark:text-blue-400">
              ₱
              {Number(session.closing_actual_cash || 0).toLocaleString(
                'en-US',
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-slate-500 block">Discrepancy</span>
            <span
              className={`font-bold text-sm ${disc === 0 ? 'text-emerald-500' : 'text-rose-500'}`}
            >
              {disc === 0 ? 'Balanced' : `₱${disc.toFixed(2)}`}
            </span>
          </div>
        </div>

        {session.notes && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
              Shift Closing Notes:
            </span>
            <p className="text-slate-600 dark:text-slate-400">
              {session.notes}
            </p>
          </div>
        )}

        {Object.keys(denoms).length > 0 && (
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80">
            <h5 className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-300 mb-2">
              Denominations Breakdown
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(Object.keys(denoms) as Array<keyof DenominationCounts>).map(
                (key) => {
                  const count = denoms[key] || 0;
                  if (count === 0) return null;
                  const meta = DENOMINATION_VALUES[key];
                  return (
                    <div
                      key={key}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80 flex justify-between"
                    >
                      <span className="text-slate-500">
                        {meta?.label || key}:
                      </span>
                      <span className="font-bold font-mono">{count} pcs</span>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Session Cash Transactions ({transactions.length})
          </h5>
          {loading ? (
            <p className="text-xs text-slate-400 py-2">
              Loading transactions...
            </p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">
              No manual cash movements recorded during this session.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {transactions
                .filter((tx) => tx.status !== 'rejected')
                .map((tx) => (
                  <div
                    key={tx.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                      tx.is_voided
                        ? 'opacity-50 line-through bg-slate-100/50 dark:bg-white/[0.02] border-slate-200/50 dark:border-white/5'
                        : 'bg-slate-50 dark:bg-[#1e232d] border border-slate-200/80 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <span className="font-bold shrink-0 capitalize">
                        {tx.type.replace('_', ' ')}
                      </span>
                      {tx.is_voided && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 not-italic shrink-0">
                          VOIDED
                        </span>
                      )}
                      <span className="text-slate-500 text-[11px] truncate" title={tx.reason}>
                        ({tx.reason})
                      </span>
                    </div>
                    <span className="font-mono font-bold shrink-0 ml-2">
                      {tx.is_voided
                        ? '₱0.00'
                        : `${tx.type === 'cash_out' ? '-' : '+'}₱${Number(tx.amount).toFixed(2)}`}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1 py-2.5 text-xs cursor-pointer"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handlePrintThermalReceipt}
            className="flex-1 py-2.5 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print Report
          </Button>
        </div>
      </div>
    </Modal>
  );
};
