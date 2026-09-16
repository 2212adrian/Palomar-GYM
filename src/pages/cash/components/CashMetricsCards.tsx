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
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3.5 font-body">
      {/* 1. Hero Card: Live Drawer Cash (Spans 2 columns on mobile, 1 on desktop) */}
      <div className="col-span-2 sm:col-span-2 lg:col-span-1 p-3.5 sm:p-4 rounded-2xl bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-md relative overflow-hidden flex flex-col justify-between min-h-[105px] sm:min-h-[115px] transition-all hover:shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
            Physical Drawer Cash
          </span>
          <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Wallet className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-2xl sm:text-3xl font-heading font-black tracking-tight truncate">
            ₱
            {metrics.expectedDrawerCash.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
              IN REGISTER NOW
            </p>
          </div>
        </div>
      </div>

      {/* 2. Opening Float */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200/90 dark:border-white/10 shadow-xs flex flex-col justify-between min-h-[105px] sm:min-h-[115px] transition-all hover:border-slate-300 dark:hover:border-white/20">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            Opening Float
          </span>
          <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
            <Banknote className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-base sm:text-xl font-heading font-black text-slate-900 dark:text-white truncate">
            ₱
            {metrics.openingFloat.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
            Starting float
          </p>
        </div>
      </div>

      {/* 3. Cash Collections (POS + Logbook) */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200/90 dark:border-white/10 shadow-xs flex flex-col justify-between min-h-[105px] sm:min-h-[115px] transition-all hover:border-slate-300 dark:hover:border-white/20">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            Collections
          </span>
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Coins className="w-3.5 h-3.5 text-emerald-500" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-base sm:text-xl font-heading font-black text-emerald-600 dark:text-emerald-400 truncate">
            ₱
            {totalCashCollections.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
            POS & Logbook Cash
          </p>
        </div>
      </div>

      {/* 4. Manual Cash In & Out */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200/90 dark:border-white/10 shadow-xs flex flex-col justify-between min-h-[105px] sm:min-h-[115px] transition-all hover:border-slate-300 dark:hover:border-white/20">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            Manual In / Out
          </span>
          <div className="flex items-center gap-0.5">
            <div className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <ArrowDownRight className="w-3 h-3" />
            </div>
            <div className="w-5 h-5 rounded bg-rose-500/10 flex items-center justify-center text-rose-500">
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>
        </div>
        <div className="mt-2">
          <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate">
            <span className="text-emerald-600 dark:text-emerald-400">
              +₱{Math.round(metrics.cashInTotal)}
            </span>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <span className="text-rose-600 dark:text-rose-400">
              -₱{Math.round(metrics.cashOutTotal)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
            Net: {manualNet >= 0 ? '+' : '-'}₱{Math.abs(manualNet).toFixed(2)}
          </p>
        </div>
      </div>

      {/* 5. Digital Collections */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200/90 dark:border-white/10 shadow-xs flex flex-col justify-between min-h-[105px] sm:min-h-[115px] transition-all hover:border-slate-300 dark:hover:border-white/20">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            Digital Non-Drawer
          </span>
          <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-3.5 h-3.5 text-blue-500" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-base sm:text-xl font-heading font-black text-blue-600 dark:text-blue-400 truncate">
            ₱
            {metrics.totalDigitalCollections.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
            GCash / Maya
          </p>
        </div>
      </div>
    </div>
  );
};
