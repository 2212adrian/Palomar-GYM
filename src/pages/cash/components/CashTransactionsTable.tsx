// src/pages/cash/components/CashTransactionsTable.tsx
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
} from 'lucide-react';
import type { UnifiedActivityItem } from '../../../stores/useCashSessionStore';

interface CashTransactionsTableProps {
  transactions: UnifiedActivityItem[];
  isLoading: boolean;
}

export const CashTransactionsTable: React.FC<CashTransactionsTableProps> = ({
  transactions,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'cash_in' | 'cash_out' | 'digital_in'
  >('all');
  const [sourceFilter, setSourceFilter] = useState<
    'all' | 'pos' | 'logbook' | 'manual'
  >('all');

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

  return (
    <div className="bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Main Movement Pill Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-neutral-700'
            }`}
          >
            All ({transactions.length})
          </button>
          <button
            onClick={() => setFilterType('cash_in')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === 'cash_in'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            Cash In
          </button>
          <button
            onClick={() => setFilterType('cash_out')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === 'cash_out'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
            }`}
          >
            Cash Out
          </button>
          <button
            onClick={() => setFilterType('digital_in')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === 'digital_in'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20'
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
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
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
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-900/60 text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-200 dark:border-white/5">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Activity Description</th>
                  <th className="py-3 px-4">Staff / Source</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredTransactions.map((tx) => {
                  const isOutflow = tx.type === 'cash_out';

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {format(new Date(tx.created_at), 'h:mm a')}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                            tx.source === 'pos'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : tx.source === 'logbook' ||
                                  tx.source === 'receipt'
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                : isOutflow
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                  : tx.type === 'digital_in'
                                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {tx.source === 'pos' && (
                            <ShoppingBag className="w-3 h-3" />
                          )}
                          {(tx.source === 'logbook' ||
                            tx.source === 'receipt') && (
                            <Users className="w-3 h-3" />
                          )}
                          {tx.source === 'manual' && tx.type === 'cash_in' && (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {tx.source === 'manual' && tx.type === 'cash_out' && (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          {tx.source === 'manual' &&
                            tx.type === 'digital_in' && (
                              <Smartphone className="w-3 h-3" />
                            )}
                          {tx.displayType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                        <span className="font-bold block">{tx.reason}</span>
                        {tx.reference_number && (
                          <span className="text-[10px] font-mono text-blue-500 font-normal">
                            Ref: {tx.reference_number}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{tx.performed_by_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isOutflow
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-white/5">
            {filteredTransactions.map((tx) => {
              const isOutflow = tx.type === 'cash_out';

              return (
                <div key={tx.id} className="p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          tx.source === 'pos'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : tx.source === 'logbook' || tx.source === 'receipt'
                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                              : isOutflow
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                        }`}
                      >
                        {tx.source === 'pos' && (
                          <ShoppingBag className="w-2.5 h-2.5" />
                        )}
                        {(tx.source === 'logbook' ||
                          tx.source === 'receipt') && (
                          <Users className="w-2.5 h-2.5" />
                        )}
                        {tx.source === 'manual' && tx.type === 'cash_in' && (
                          <ArrowDownRight className="w-2.5 h-2.5" />
                        )}
                        {tx.source === 'manual' && tx.type === 'cash_out' && (
                          <ArrowUpRight className="w-2.5 h-2.5" />
                        )}
                        {tx.source === 'manual' && tx.type === 'digital_in' && (
                          <Smartphone className="w-2.5 h-2.5" />
                        )}
                        {tx.displayType}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {format(new Date(tx.created_at), 'h:mm a')}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-bold text-sm ${
                        isOutflow
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

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-800 dark:text-slate-200 font-bold">
                      {tx.reason}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      by {tx.performed_by_name}
                    </span>
                  </div>

                  {tx.reference_number && (
                    <p className="text-[10px] font-mono text-blue-500">
                      Ref: {tx.reference_number}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
