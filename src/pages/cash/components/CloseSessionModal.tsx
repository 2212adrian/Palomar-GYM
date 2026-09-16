// src/pages/cash/components/CloseSessionModal.tsx
import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { closeCashSession } from '../../../lib/supabase/cashService';
import { useAuthStore } from '../../../stores/authStore';
import { DENOMINATION_VALUES } from '../../../types/cash';
import type {
  DenominationCounts,
  CashFlowMetrics,
  CashSession,
} from '../../../types/cash';

interface CloseSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CashSession;
  metrics: CashFlowMetrics;
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
  onSuccess,
}) => {
  const { user, profile } = useAuthStore();
  const [denominations, setDenominations] =
    useState<DenominationCounts>(INITIAL_DENOMINATIONS);
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDenomChange = (key: keyof DenominationCounts, value: number) => {
    const validVal = Math.max(0, Math.floor(value || 0));
    setDenominations((prev) => ({ ...prev, [key]: validVal }));
  };

  const handleIncrement = (key: keyof DenominationCounts, delta: number) => {
    setDenominations((prev) => {
      const current = prev[key] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [key]: next };
    });
  };

  const handleReset = () => {
    setDenominations(INITIAL_DENOMINATIONS);
  };

  // Compute total actual cash counted from denominations
  const totalActualCash = useMemo(() => {
    let sum = 0;
    (Object.keys(DENOMINATION_VALUES) as Array<keyof DenominationCounts>).forEach(
      (key) => {
        const count = denominations[key] || 0;
        const value = DENOMINATION_VALUES[key].value;
        sum += count * value;
      }
    );
    return Math.round(sum * 100) / 100;
  }, [denominations]);

  const expectedCash = metrics.expectedDrawerCash;
  const discrepancy = Math.round((totalActualCash - expectedCash) * 100) / 100;
  const isDiscrepant = Math.abs(discrepancy) > 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isDiscrepant && !discrepancyReason.trim()) {
      toast.error('Discrepancy reason is mandatory when drawer does not balance.');
      return;
    }

    try {
      setIsSubmitting(true);
      const actorName =
        profile?.username || user?.user_metadata?.full_name || user?.email || 'Admin';

      await closeCashSession({
        sessionId: session.id,
        actualCash: totalActualCash,
        expectedCash,
        discrepancy,
        discrepancyReason: isDiscrepant ? discrepancyReason.trim() : undefined,
        notes: notes.trim() || undefined,
        denominations,
        closedBy: user?.id || null,
        closedByName: actorName,
      });

      toast.success(
        `Cash Session #${session.session_number} closed successfully (${
          discrepancy === 0
            ? 'Balanced'
            : discrepancy > 0
              ? `Over ₱${discrepancy.toFixed(2)}`
              : `Short ₱${Math.abs(discrepancy).toFixed(2)}`
        }).`
      );

      await onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to close cash session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CLOSE CASH SESSION & RECONCILE"
      className="max-w-2xl p-6 text-left"
    >
      <div className="flex items-center justify-between p-3.5 bg-slate-100 dark:bg-neutral-800/80 border border-slate-200 dark:border-white/10 rounded-2xl mb-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active Session
          </span>
          <p className="text-sm font-heading font-bold text-slate-900 dark:text-white">
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

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Denomination Counter Header */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
            <h4 className="text-xs font-heading uppercase tracking-wider text-slate-900 dark:text-white font-bold">
              PHYSICAL DRAWER DENOMINATIONS
            </h4>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Bills Section */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
            <Banknote className="w-3.5 h-3.5" />
            Paper Banknotes
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
              const subtotal = count * meta.value;

              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10"
                >
                  <div className="w-24">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {meta.label}
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      = ₱{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleIncrement(key, -1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700"
                    >
                      <MinusCircle className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={count === 0 ? '' : count}
                      placeholder="0"
                      onChange={(e) =>
                        handleDenomChange(key, parseInt(e.target.value, 10))
                      }
                      className="w-14 text-center py-1 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleIncrement(key, 1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coins Section */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
            <Coins className="w-3.5 h-3.5" />
            Metallic Coins
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
              const subtotal = count * meta.value;

              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10"
                >
                  <div className="w-24">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {meta.label}
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      = ₱{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleIncrement(key, -1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700"
                    >
                      <MinusCircle className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={count === 0 ? '' : count}
                      placeholder="0"
                      onChange={(e) =>
                        handleDenomChange(key, parseInt(e.target.value, 10))
                      }
                      className="w-14 text-center py-1 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleIncrement(key, 1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reconciliation Calculation Card */}
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-neutral-900/90 border border-slate-200 dark:border-white/10 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Opening Float:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              ₱{metrics.openingFloat.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Cash Collections (Sales + Logbook):</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              +₱{(metrics.cashSales + metrics.cashLogbook).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Manual Cash Inflows / Outflows:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">
              +₱{metrics.cashInTotal.toFixed(2)} / -₱{metrics.cashOutTotal.toFixed(2)}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-sm">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              Expected Drawer Cash:
            </span>
            <span className="font-heading font-black text-slate-900 dark:text-white">
              ₱{expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              Actual Counted Cash:
            </span>
            <span className="font-heading font-black text-blue-600 dark:text-blue-400">
              ₱{totalActualCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Discrepancy Status Badge */}
          <div
            className={`p-3 rounded-xl flex items-center justify-between ${
              discrepancy === 0
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : discrepancy > 0
                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {discrepancy === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
              <span className="text-xs font-black uppercase tracking-wider">
                {discrepancy === 0
                  ? 'DRAWER BALANCED'
                  : discrepancy > 0
                    ? 'DRAWER OVERAGE'
                    : 'DRAWER SHORTAGE'}
              </span>
            </div>
            <span className="font-heading font-black text-sm">
              {discrepancy === 0
                ? '₱0.00'
                : discrepancy > 0
                  ? `+₱${discrepancy.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                  : `-₱${Math.abs(discrepancy).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>

        {/* Mandatory Discrepancy Reason Input */}
        {isDiscrepant && (
          <div className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-1.5">
            <label className="block text-[11px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Discrepancy Reason (Mandatory) *
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Please explain why the counted physical cash does not match the expected drawer total.
            </p>
            <textarea
              rows={2}
              required
              placeholder="e.g. Unrecorded coin change given, refund voucher pending, counting error..."
              value={discrepancyReason}
              onChange={(e) => setDiscrepancyReason(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111] border border-rose-300 dark:border-rose-500/30 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
            />
          </div>
        )}

        {/* Closing Notes */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Closing Shift Notes (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="e.g. All counter tasks completed, handover to night shift..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3.5 py-2 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            className="flex-1 py-3 text-xs !bg-slate-900 dark:!bg-white !text-white dark:!text-slate-900 hover:!opacity-90"
          >
            <ShieldCheck className="w-4 h-4 mr-1" />
            CONFIRM & CLOSE SESSION
          </Button>
        </div>
      </form>
    </Modal>
  );
};
