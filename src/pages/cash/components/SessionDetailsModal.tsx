// src/pages/cash/components/SessionDetailsModal.tsx
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { fetchSessionTransactions } from '../../../lib/supabase/cashService';
import { DENOMINATION_VALUES } from '../../../types/cash';
import type {
  CashSession,
  CashTransaction,
  DenominationCounts,
} from '../../../types/cash';

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
        .then((txs) => setTransactions(txs))
        .finally(() => setLoading(false));
    }
  }, [session?.id]);

  if (!session) return null;

  const handlePrint = () => {
    window.print();
  };

  const disc = session.discrepancy || 0;
  const denoms = session.denominations || {};

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CASH SESSION SUMMARY REPORT"
      className="max-w-2xl p-6 text-left"
    >
      <div className="printable-report space-y-4">
        {/* Header Badge & Session Details */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-100 dark:bg-neutral-800/80 border border-slate-200 dark:border-white/10 gap-2">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Session Reference
            </span>
            <p className="text-base font-heading font-black text-slate-900 dark:text-white">
              {session.session_number}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Status:{' '}
              <span
                className={`font-bold uppercase ${
                  session.status === 'open' ? 'text-emerald-500' : 'text-slate-500'
                }`}
              >
                {session.status}
              </span>
            </p>
          </div>

          <div className="text-left sm:text-right text-xs space-y-0.5">
            <p className="text-slate-500 dark:text-slate-400">
              Opened:{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {format(new Date(session.opened_at), 'MMM d, yyyy h:mm a')}
              </span>{' '}
              by {session.opened_by_name}
            </p>
            {session.closed_at && (
              <p className="text-slate-500 dark:text-slate-400">
                Closed:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {format(new Date(session.closed_at), 'MMM d, yyyy h:mm a')}
                </span>{' '}
                by {session.closed_by_name || 'Admin'}
              </p>
            )}
          </div>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Opening Float
            </span>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              ₱{Number(session.opening_float || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Expected Drawer
            </span>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              ₱{Number(session.closing_expected_cash || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Counted Cash
            </span>
            <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
              ₱{Number(session.closing_actual_cash || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Discrepancy
            </span>
            <p
              className={`text-sm font-bold mt-0.5 ${
                disc === 0
                  ? 'text-emerald-500'
                  : disc > 0
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }`}
            >
              {disc === 0
                ? 'Balanced'
                : disc > 0
                  ? `+₱${disc.toFixed(2)}`
                  : `-₱${Math.abs(disc).toFixed(2)}`}
            </p>
          </div>
        </div>

        {/* Discrepancy Reason Warning */}
        {session.discrepancy_reason && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs">
            <span className="font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block mb-1">
              Discrepancy Explanation Note:
            </span>
            <p className="text-slate-700 dark:text-slate-300">
              {session.discrepancy_reason}
            </p>
          </div>
        )}

        {/* Denominations Breakdown (If present) */}
        {Object.keys(denoms).length > 0 && (
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10">
            <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2.5">
              Closing Denominations Count
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
                      className="p-2 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/5 flex items-center justify-between"
                    >
                      <span className="text-slate-500 dark:text-slate-400 font-semibold">
                        {meta?.label || key}:
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white">
                        {count} pcs
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* Transaction History for this session */}
        <div className="space-y-2">
          <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Session Cash Transactions ({transactions.length})
          </h5>
          {loading ? (
            <p className="text-xs text-slate-500 italic py-2">Loading transactions...</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No manual cash movements recorded during this session.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#151515] border border-slate-200 dark:border-white/5 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                          tx.type === 'cash_in'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : tx.type === 'cash_out'
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {tx.type.replace('_', ' ')}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {tx.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {tx.reason} • by {tx.performed_by_name} at{' '}
                      {format(new Date(tx.created_at), 'h:mm a')}
                    </p>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      tx.type === 'cash_in'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : tx.type === 'cash_out'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {tx.type === 'cash_out' ? '-' : '+'}₱
                    {Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
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
            onClick={handlePrint}
            className="flex-1 py-2.5 text-xs !bg-slate-800 hover:!bg-slate-900 text-white flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </Button>
        </div>
      </div>
    </Modal>
  );
};
