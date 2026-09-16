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
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import {
  closeCashSession,
  fetchSessionTransactions,
} from '../../../lib/supabase/cashService';
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
  const [denominations, setDenominations] = useState<DenominationCounts>(
    INITIAL_DENOMINATIONS
  );
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    let sum = 0;
    (
      Object.keys(DENOMINATION_VALUES) as Array<keyof DenominationCounts>
    ).forEach((key) => {
      sum += (denominations[key] || 0) * DENOMINATION_VALUES[key].value;
    });
    return Math.round(sum * 100) / 100;
  }, [denominations]);

  const expectedCash = metrics.expectedDrawerCash;
  const discrepancy = Math.round((totalActualCash - expectedCash) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      const actorName =
        profile?.username ||
        user?.user_metadata?.full_name ||
        user?.email ||
        'Admin';

      await closeCashSession({
        sessionId: session.id,
        actualCash: totalActualCash,
        expectedCash,
        discrepancy,
        notes: notes.trim() || undefined,
        denominations,
        closedBy: user?.id || null,
        closedByName: actorName,
      });

      toast.success(
        `Cash Session #${session.session_number} closed successfully.`
      );
      await onSuccess();
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
        <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
            <h4 className="text-xs font-heading uppercase tracking-wider text-slate-900 dark:text-white font-bold">
              PHYSICAL DRAWER DENOMINATIONS
            </h4>
          </div>
          <button
            type="button"
            onClick={() => setDenominations(INITIAL_DENOMINATIONS)}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Banknotes */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
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
                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10"
                >
                  <div className="w-24">
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
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
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
                      className="w-14 text-center py-1 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleIncrement(key, 1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
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
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
            <Coins className="w-3.5 h-3.5" /> Metallic Coins
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              ['coin_20', 'coin_10', 'coin_5', 'coin_1', 'coin_025'] as Array<
                keyof DenominationCounts
              >
            ).map((key) => {
              const meta = DENOMINATION_VALUES[key];
              const count = denominations[key] || 0;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10"
                >
                  <div className="w-24">
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
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
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
                      className="w-14 text-center py-1 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleIncrement(key, 1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Calculation Box */}
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-neutral-900/90 border border-slate-200 dark:border-white/10 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">
              Opening Float:
            </span>
            <span className="font-bold font-mono">
              ₱
              {metrics.openingFloat.toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">
              Cash Collections:
            </span>
            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
              +₱
              {(metrics.cashSales + metrics.cashLogbook).toLocaleString(
                'en-US',
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">
              Manual In / Out Net:
            </span>
            <span className="font-bold font-mono">
              {metrics.cashInTotal - metrics.cashOutTotal >= 0 ? '+' : '-'}₱
              {Math.abs(
                metrics.cashInTotal - metrics.cashOutTotal
              ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-sm">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              Expected Cash:
            </span>
            <span className="font-heading font-black">
              ₱
              {expectedCash.toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              Actual Counted Cash:
            </span>
            <span className="font-heading font-black text-blue-600 dark:text-blue-400">
              ₱
              {totalActualCash.toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>

          <div
            className={`p-2.5 rounded-xl flex items-center justify-between font-bold ${
              discrepancy === 0
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : discrepancy > 0
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {discrepancy === 0 ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>
                {discrepancy === 0
                  ? 'BALANCED'
                  : discrepancy > 0
                    ? 'DRAWER OVERAGE'
                    : 'CASH DISCREPANCY'}
              </span>
            </div>
            <span>
              {discrepancy === 0
                ? '₱0.00'
                : discrepancy > 0
                  ? `+₱${discrepancy.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                  : `-₱${Math.abs(discrepancy).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>

        {/* Single Shift Notes Input */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Closing Shift Notes (Optional)
          </label>
          <textarea
            rows={3}
            placeholder="Handover notes, discrepancy explanation, comments..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
            className="flex-1 py-3 text-xs !bg-slate-900 dark:!bg-white !text-white dark:!text-slate-900"
          >
            <ShieldCheck className="w-4 h-4 mr-1" />
            CONFIRM & CLOSE SESSION
          </Button>
        </div>
      </form>
    </Modal>
  );
};

/* =========================================================================
   2. SESSION DETAILS / REPORT MODAL
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

  useEffect(() => {
    if (session?.id) {
      setLoading(true);
      fetchSessionTransactions(session.id)
        .then(setTransactions)
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [session?.id]);

  if (!session) return null;

  const disc = Number(session.discrepancy || 0);
  const denoms = session.denominations || {};

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CASH SESSION SUMMARY REPORT"
      className="max-w-2xl p-6 text-left"
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-100 dark:bg-neutral-800/80 border border-slate-200 dark:border-white/10 gap-2">
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
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-slate-500 block">Opening Float</span>
            <span className="font-bold text-sm">
              ₱
              {Number(session.opening_float || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-slate-500 block">Expected Drawer</span>
            <span className="font-bold text-sm">
              ₱
              {Number(session.closing_expected_cash || 0).toLocaleString(
                'en-US',
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-slate-500 block">Counted Cash</span>
            <span className="font-bold text-sm text-blue-600 dark:text-blue-400">
              ₱
              {Number(session.closing_actual_cash || 0).toLocaleString(
                'en-US',
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-slate-500 block">Discrepancy</span>
            <span
              className={`font-bold text-sm ${disc === 0 ? 'text-emerald-500' : 'text-rose-500'}`}
            >
              {disc === 0 ? 'Balanced' : `₱${disc.toFixed(2)}`}
            </span>
          </div>
        </div>

        {session.notes && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
              Shift Closing Notes:
            </span>
            <p className="text-slate-600 dark:text-slate-400">
              {session.notes}
            </p>
          </div>
        )}

        {Object.keys(denoms).length > 0 && (
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
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
                      className="p-2 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/5 flex justify-between"
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
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#151515] border border-slate-200 dark:border-white/5 text-xs"
                >
                  <div>
                    <span className="font-bold mr-2 capitalize">
                      {tx.type.replace('_', ' ')}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      ({tx.reason})
                    </span>
                  </div>
                  <span className="font-mono font-bold">
                    {tx.type === 'cash_out' ? '-' : '+'}₱
                    {Number(tx.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1 py-2.5 text-xs"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => window.print()}
            className="flex-1 py-2.5 text-xs flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Print Report
          </Button>
        </div>
      </div>
    </Modal>
  );
};
