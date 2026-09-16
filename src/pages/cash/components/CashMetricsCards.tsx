import React from 'react';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  Banknote,
  Coins,
} from 'lucide-react';
import type { CashFlowMetrics } from '../../../types/cash';

interface CashMetricsCardsProps {
  metrics: CashFlowMetrics;
}

export const CashMetricsCards: React.FC<CashMetricsCardsProps> = ({
  metrics,
}) => {
  const manualNet = metrics.cashInTotal - metrics.cashOutTotal;
  const totalCashCollections = metrics.cashSales + metrics.cashLogbook;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 font-body">
      {/* 1. Live Drawer Cash */}
      <div className="p-4 rounded-2xl bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-md relative overflow-hidden flex flex-col justify-between min-h-[115px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
            Physical Drawer Cash
          </span>
          <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center">
            <Wallet className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-heading font-black tracking-tight">
            ₱
            {metrics.expectedDrawerCash.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[10px] font-bold text-white/80 uppercase tracking-wider">
              IN REGISTER NOW
            </p>
          </div>
        </div>
      </div>

      {/* 2. Opening Float */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 flex flex-col justify-between min-h-[115px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Opening Float
          </span>
          <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center">
            <Banknote className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-heading font-black text-slate-900 dark:text-white">
            ₱
            {metrics.openingFloat.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
            Starting drawer float
          </p>
        </div>
      </div>

      {/* 3. Cash Collections (Sales + Check-ins) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 flex flex-col justify-between min-h-[115px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cash Collections
          </span>
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Coins className="w-3.5 h-3.5 text-emerald-500" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-heading font-black text-emerald-600 dark:text-emerald-400">
            ₱
            {totalCashCollections.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
            POS: ₱{metrics.cashSales.toFixed(2)} • Log: ₱
            {metrics.cashLogbook.toFixed(2)}
          </p>
        </div>
      </div>

      {/* 4. Manual Cash In & Out */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 flex flex-col justify-between min-h-[115px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Manual In / Out
          </span>
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <ArrowDownRight className="w-3 h-3" />
            </div>
            <div className="w-5 h-5 rounded bg-rose-500/10 flex items-center justify-center text-rose-500">
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>
        </div>
        <div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400">
              +₱{metrics.cashInTotal.toFixed(2)}
            </span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-rose-600 dark:text-rose-400">
              -₱{metrics.cashOutTotal.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
            Net: {manualNet >= 0 ? '+' : '-'}₱{Math.abs(manualNet).toFixed(2)}
          </p>
        </div>
      </div>

      {/* 5. Digital Collections */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 flex flex-col justify-between min-h-[115px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Digital Collections
          </span>
          <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Smartphone className="w-3.5 h-3.5 text-blue-500" />
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-heading font-black text-blue-600 dark:text-blue-400">
            ₱
            {metrics.totalDigitalCollections.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
            GCash / Maya (Non-Drawer)
          </p>
        </div>
      </div>
    </div>
  );
};
