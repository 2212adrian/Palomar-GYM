import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Search,
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  ShoppingBag,
  Users,
  Receipt,
  User,
  RotateCcw,
  AlertOctagon,
  Clock,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import type { UnifiedActivityItem } from '../../../stores/useCashSessionStore';
import { VirtualWindowList } from '../../../components/common/VirtualWindowList';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { voidCashTransaction } from '../../../lib/supabase/cashService';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';

interface CashTransactionsTableProps {
  transactions: UnifiedActivityItem[];
  isLoading: boolean;
  onRefresh?: () => Promise<void> | void;
}

export const CashTransactionsTable: React.FC<CashTransactionsTableProps> = ({
  transactions,
  isLoading,
  onRefresh,
}) => {
  const { user, profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || isSuperAdmin(user?.email);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'cash_in' | 'cash_out' | 'digital_in'
  >('all');
  const [sourceFilter, setSourceFilter] = useState<
    'all' | 'pos' | 'logbook' | 'manual'
  >('all');

  // Void confirmation state
  const [voidTargetTx, setVoidTargetTx] = useState<UnifiedActivityItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Primary Movement Type Filter
      if (filterType === 'cash_in' && tx.type !== 'cash_in') return false;
      if (filterType === 'cash_out' && tx.type !== 'cash_out') return false;
      if (filterType === 'digital_in' && tx.type !== 'digital_in') return false;

      // 2. Secondary Channel/Source Filter
      if (sourceFilter === 'pos' && tx.source !== 'pos') return false;
      if (
        sourceFilter === 'logbook' &&
        tx.source !== 'logbook' &&
        tx.source !== 'receipt'
      )
        return false;
      if (sourceFilter === 'manual' && tx.source !== 'manual') return false;

      // 3. Search Bar Filter
      if (!searchTerm) return true;

      const q = searchTerm.toLowerCase();
      return (
        tx.reason.toLowerCase().includes(q) ||
        tx.displayType.toLowerCase().includes(q) ||
        tx.performed_by_name.toLowerCase().includes(q) ||
        (tx.reference_number && tx.reference_number.toLowerCase().includes(q))
      );
    });
  }, [transactions, filterType, sourceFilter, searchTerm]);

  const handleConfirmVoid = async () => {
    if (!voidTargetTx) return;
    if (!voidReason.trim()) {
      toast.error('Please enter a reason for voiding this transaction.');
      return;
    }
    if (voidReason.trim().length < 5) {
      toast.error('Please enter a specific reason (at least 5 characters) for voiding this transaction.');
      return;
    }

    try {
      setIsVoiding(true);
      const adminName =
        profile?.username ||
        user?.user_metadata?.full_name ||
        user?.email ||
        'Admin';

      await voidCashTransaction({
        transactionId: voidTargetTx.id,
        reason: voidReason.trim().slice(0, 300),
        adminId: user?.id || null,
        adminName,
        activityDescription: voidTargetTx.reason,
        amount: Number(voidTargetTx.amount),
        type: voidTargetTx.displayType || voidTargetTx.type,
      });

      toast.success(`Transaction voided. Cash drawer balance recalculated.`);
      setVoidTargetTx(null);
      setVoidReason('');
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      console.error('Void error:', err);
      toast.error(err?.message || 'Failed to void cash transaction.');
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Main Movement Pill Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterType === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-neutral-700'
            }`}
          >
            All ({transactions.length})
          </button>
          <button
            onClick={() => setFilterType('cash_in')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterType === 'cash_in'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            Cash In
          </button>
          <button
            onClick={() => setFilterType('cash_out')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterType === 'cash_out'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
            }`}
          >
            Cash Out
          </button>
          <button
            onClick={() => setFilterType('digital_in')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterType === 'digital_in'
                ? 'bg-sky-600 text-white'
                : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20'
            }`}
          >
            Digital In
          </button>
        </div>

        {/* Channel Selector & Search Input */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0 cursor-pointer"
          >
            <option value="all">All Channels</option>
            <option value="pos">POS Sales Only</option>
            <option value="logbook">Logbook / Gym Entry</option>
            <option value="manual">Manual Movements</option>
          </select>

          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search items, ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">
          Loading ledger movements...
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Receipt className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            No activity records found
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Sales, attendance payments, and manual cash movements will appear
            here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Landscape / Desktop Table */}
          <div className="hidden landscape:md:block overflow-x-auto">
            <table className="w-full text-left text-xs table-fixed">
              <thead className="bg-slate-50 dark:bg-neutral-900/60 text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-200 dark:border-white/5">
                <tr>
                  <th className="py-3 px-4 w-24">Time</th>
                  <th className="py-3 px-4 w-44">Type</th>
                  <th className="py-3 px-4">Activity Description</th>
                  <th className="py-3 px-4 w-36">Transacted By</th>
                  <th className="py-3 px-4 w-28 text-right">Amount</th>
                  {isAdmin && <th className="py-3 px-4 w-20 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredTransactions.map((tx) => {
                  const isOutflow = tx.type === 'cash_out';
                  const isVoid = Boolean(tx.is_voided);
                  const isPending = tx.status === 'pending';
                  const isRejected = tx.status === 'rejected';

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors ${
                        isVoid ? 'opacity-50 line-through bg-slate-50/30 dark:bg-white/[0.01]' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {format(new Date(tx.created_at), 'h:mm a')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                              isVoid
                                ? 'bg-slate-500/15 text-slate-500'
                                : isPending
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                : isRejected
                                ? 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400'
                                : tx.source === 'pos'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : tx.source === 'logbook' ||
                                    tx.source === 'receipt'
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                : isOutflow
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                  : tx.type === 'digital_in'
                                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {isPending ? (
                              <Clock className="w-3 h-3 animate-pulse" />
                            ) : isRejected ? (
                              <XCircle className="w-3 h-3" />
                            ) : tx.source === 'pos' ? (
                              <ShoppingBag className="w-3 h-3" />
                            ) : tx.source === 'logbook' ||
                              tx.source === 'receipt' ? (
                              <Users className="w-3 h-3" />
                            ) : tx.source === 'manual' && tx.type === 'cash_in' ? (
                              <ArrowDownRight className="w-3 h-3" />
                            ) : tx.source === 'manual' && tx.type === 'cash_out' ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <Smartphone className="w-3 h-3" />
                            )}
                            {tx.displayType}
                          </span>

                          {isVoid && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              VOIDED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200 overflow-hidden">
                        <span
                          className="font-bold block truncate max-w-full"
                          title={tx.reason}
                        >
                          {tx.reason}
                        </span>
                        {tx.reference_number && (
                          <span
                            className="text-[10px] font-mono text-blue-500 font-normal block truncate max-w-full"
                            title={`Ref: ${tx.reference_number}`}
                          >
                            Ref: {tx.reference_number}
                          </span>
                        )}
                        {isVoid && tx.void_reason && (
                          <span
                            className="text-[10px] text-rose-500 block truncate max-w-full not-italic"
                            title={`Void reason: ${tx.void_reason} (by ${tx.voided_by_name || 'Admin'})`}
                          >
                            Void reason: {tx.void_reason} (by {tx.voided_by_name || 'Admin'})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span
                            className="font-bold text-slate-800 dark:text-slate-200 truncate"
                            title={tx.performed_by_name || 'System'}
                          >
                            {tx.performed_by_name || 'System'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isVoid
                              ? 'text-slate-400'
                              : isOutflow
                              ? 'text-rose-600 dark:text-rose-400'
                              : tx.type === 'digital_in'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isOutflow ? '-' : '+'}₱
                          {Number(tx.amount).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {tx.source === 'manual' && !isVoid && !isRejected && !tx.id.startsWith('offline_') && (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidTargetTx(tx);
                                setVoidReason('');
                              }}
                              title="Void / Revert Transaction"
                              className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all inline-flex items-center gap-1 cursor-pointer border border-rose-500/20"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Void
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile & Portrait Card Layout */}
          <div className="landscape:md:hidden">
            <VirtualWindowList
              items={filteredTransactions}
              estimateItemHeight={82}
              overscan={4}
              className="divide-y divide-slate-100 dark:divide-white/5"
              getItemKey={(tx) => tx.id}
              renderItem={(tx) => {
                const isOutflow = tx.type === 'cash_out';
                const isVoid = Boolean(tx.is_voided);

                return (
                  <div
                    key={tx.id}
                    className={`p-3.5 space-y-1.5 ${
                      isVoid ? 'opacity-50 line-through bg-slate-50/40 dark:bg-white/[0.01]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                            isVoid
                              ? 'bg-slate-500/15 text-slate-500'
                              : tx.source === 'pos'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : tx.source === 'logbook' || tx.source === 'receipt'
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                : isOutflow
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                  : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                          }`}
                        >
                          {tx.displayType}
                        </span>
                        {isVoid && (
                          <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                            VOIDED
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {format(new Date(tx.created_at), 'h:mm a')}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-bold text-sm shrink-0 ${
                          isVoid
                            ? 'text-slate-400'
                            : isOutflow
                            ? 'text-rose-600 dark:text-rose-400'
                            : tx.type === 'digital_in'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isOutflow ? '-' : '+'}₱
                        {Number(tx.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className="text-slate-800 dark:text-slate-200 font-bold truncate flex-1 min-w-0"
                        title={tx.reason}
                      >
                        {tx.reason}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                        by {tx.performed_by_name}
                      </span>
                    </div>

                    {tx.reference_number && (
                      <p className="text-[10px] font-mono text-blue-500 truncate" title={`Ref: ${tx.reference_number}`}>
                        Ref: {tx.reference_number}
                      </p>
                    )}

                    {isAdmin && tx.source === 'manual' && !isVoid && !tx.id.startsWith('offline_') && (
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setVoidTargetTx(tx);
                            setVoidReason('');
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1 cursor-pointer active:scale-95"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Void (Undo)
                        </button>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>
        </>
      )}

      {/* ADMIN VOID / UNDO CONFIRMATION MODAL */}
      {voidTargetTx && (
        <Modal
          isOpen={Boolean(voidTargetTx)}
          onClose={() => setVoidTargetTx(null)}
          title="CONFIRM TRANSACTION VOID"
          className="w-full max-w-md mx-auto my-auto p-6 text-left"
        >
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 mb-4 flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-black uppercase tracking-wider">
                Reversing Transaction
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                Voiding this record will immediately recalculate the session cash drawer balance and remove its impact on financial totals. An audit entry will be permanently logged.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#111] border border-slate-200 dark:border-white/10 space-y-1 mb-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Type:</span>
              <span className="font-bold text-slate-900 dark:text-white uppercase">
                {voidTargetTx.type}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                ₱{Number(voidTargetTx.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Original Reason:</span>
              <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]" title={voidTargetTx.reason}>
                {voidTargetTx.reason}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Transacted By:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {voidTargetTx.performed_by_name}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 mb-5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Reason for Voiding *
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {voidReason.length}/300
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={300}
              placeholder="e.g. Typo in amount, entered by mistake, wrong category..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value.slice(0, 300))}
              className="w-full px-3 py-2 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setVoidTargetTx(null)}
              disabled={isVoiding}
              className="flex-1 py-2.5 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={isVoiding}
              disabled={isVoiding}
              onClick={handleConfirmVoid}
              className="flex-1 py-2.5 text-xs !bg-rose-600 hover:!bg-rose-700 !text-white"
            >
              CONFIRM VOID
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};