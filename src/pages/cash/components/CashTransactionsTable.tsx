// src/pages/cash/components/CashTransactionsTable.tsx
import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Search,
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  Receipt,
  User,
} from 'lucide-react';
import type { CashTransaction } from '../../../types/cash';

interface CashTransactionsTableProps {
  transactions: CashTransaction[];
  isLoading: boolean;
}

export const CashTransactionsTable: React.FC<CashTransactionsTableProps> = ({
  transactions,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'cash_in' | 'cash_out' | 'digital_in'>('all');

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (!searchTerm) return true;

      const q = searchTerm.toLowerCase();
      return (
        tx.category.toLowerCase().includes(q) ||
        tx.reason.toLowerCase().includes(q) ||
        tx.performed_by_name.toLowerCase().includes(q) ||
        (tx.reference_number && tx.reference_number.toLowerCase().includes(q))
      );
    });
  }, [transactions, filterType, searchTerm]);

  return (
    <div className="bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-neutral-700'
            }`}
          >
            All Activity ({transactions.length})
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
                ? 'bg-blue-600 text-white'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
            }`}
          >
            Digital In
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search category, reason, staff..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading ledger movements...</div>
      ) : filteredTransactions.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Receipt className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            No cash movements found
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Use the buttons above to record physical Cash In, Cash Out, or Digital collections.
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
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4">Performed By</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                      {format(new Date(tx.created_at), 'h:mm a')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          tx.type === 'cash_in'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : tx.type === 'cash_out'
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {tx.type === 'cash_in' && <ArrowDownRight className="w-3 h-3" />}
                        {tx.type === 'cash_out' && <ArrowUpRight className="w-3 h-3" />}
                        {tx.type === 'digital_in' && <Smartphone className="w-3 h-3" />}
                        {tx.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                      {tx.category}
                      {tx.reference_number && (
                        <span className="block text-[10px] font-mono text-blue-500 font-normal">
                          Ref: {tx.reference_number}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {tx.reason}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-white/5">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        tx.type === 'cash_in'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : tx.type === 'cash_out'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {tx.type === 'cash_in' && <ArrowDownRight className="w-2.5 h-2.5" />}
                      {tx.type === 'cash_out' && <ArrowUpRight className="w-2.5 h-2.5" />}
                      {tx.type === 'digital_in' && <Smartphone className="w-2.5 h-2.5" />}
                      {tx.type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {format(new Date(tx.created_at), 'h:mm a')}
                    </span>
                  </div>
                  <span
                    className={`font-mono font-bold text-sm ${
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

                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {tx.category}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    by {tx.performed_by_name}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tx.reason}
                </p>

                {tx.reference_number && (
                  <p className="text-[10px] font-mono text-blue-500">
                    Ref: {tx.reference_number}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
