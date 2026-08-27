// src/pages/dashboard/RevenueGoalsPage.tsx
import React, { useState } from 'react';
import { 
  Target, 
  TrendingUp, 
  Sparkles, 
  CheckCircle2, 
  RotateCcw,
  ShoppingBag,
  Users
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useRevenueGoals, type GoalTimeframe } from '../../stores/useRevenueGoals';
import { formatPHP } from './dashboardService';

export const RevenueGoalsPage: React.FC = () => {
  const {
    timeframe,
    setTimeframe,
    goalsConfig,
    updateGoals,
    logbookRevenue,
    salesRevenue,
    totalRevenue,
    currentGoalTarget,
    progressPercent,
    remainingAmount,
    isGoalAchieved,
    isLoading,
    refreshRevenue
  } = useRevenueGoals();

  const [editValues, setEditValues] = useState(goalsConfig);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    updateGoals(editValues);
    setTimeout(() => setIsSaving(false), 400);
  };

  const timeframeCards: { id: GoalTimeframe; label: string; periodLabel: string; benchmark: string }[] = [
    { id: 'daily', label: 'Daily Target', periodLabel: "Today's Revenue", benchmark: 'Baseline: ₱5,000 / day' },
    { id: 'weekly', label: 'Weekly Target', periodLabel: 'This Week', benchmark: 'Baseline: ₱35,000 / week' },
    { id: 'monthly', label: 'Monthly Target', periodLabel: 'This Month', benchmark: 'Baseline: ₱150,000 / month' },
    { id: 'yearly', label: 'Yearly Target', periodLabel: 'Annual Total', benchmark: 'Baseline: ₱1,800,000 / year' }
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto select-none animate-fade-in text-slate-900 dark:text-slate-100">
      {/* ─── TOP BANNER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#123c73]/10 dark:bg-red-500/20 text-[#123c73] dark:text-red-400 flex items-center justify-center border border-[#123c73]/20 dark:border-red-500/30">
              <Target className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase font-heading">
              Revenue Goals & Targets
            </h1>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Tracker
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time financial benchmark tracker aggregating POS retail sales and logbook attendance entry fees.
          </p>
        </div>

        <button
          onClick={refreshRevenue}
          disabled={isLoading}
          className="self-start sm:self-auto px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-2 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* ─── TIMEFRAME SELECTOR BUTTONS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {timeframeCards.map((card) => {
          const isSelected = timeframe === card.id;
          const targetVal = goalsConfig[card.id];

          return (
            <button
              key={card.id}
              onClick={() => setTimeframe(card.id)}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'bg-white dark:bg-slate-900 border-[#123c73] dark:border-red-500 shadow-md ring-2 ring-[#123c73]/20 dark:ring-red-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-80 hover:opacity-100 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-heading font-black tracking-wider uppercase text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-[#123c73] dark:bg-red-500 animate-pulse" />
                )}
              </div>
              <div className="text-lg font-extrabold font-heading mt-2">
                {formatPHP(targetVal)}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
                {card.benchmark}
              </p>
            </button>
          );
        })}
      </div>

      {/* ─── MAIN HERO LIVE STATUS TRACKER ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Big Progress Display */}
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-heading font-black tracking-wider uppercase bg-[#123c73]/10 text-[#123c73] dark:bg-red-500/20 dark:text-red-300 border border-[#123c73]/20 dark:border-red-500/30">
                ACTIVE TIMEFRAME: {timeframe.toUpperCase()}
              </span>
              {isGoalAchieved && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-heading font-black tracking-wider uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  GOAL COMPLETED!
                </span>
              )}
            </div>

            <div>
              <div className="text-3xl sm:text-5xl font-black font-heading tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                <span>{formatPHP(totalRevenue)}</span>
                <span className="text-xl sm:text-2xl font-bold text-slate-400 dark:text-slate-500 font-mono">
                  / {formatPHP(currentGoalTarget)}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                Combined financial intake across POS inventory sales and member check-in gate passes.
              </p>
            </div>

            {/* Large Progress Bar */}
            <div className="space-y-1.5 pt-2">
              <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
                <motion.div
                  className={`h-full rounded-full transition-all duration-700 ${
                    isGoalAchieved
                      ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400'
                      : 'bg-gradient-to-r from-[#123c73] to-emerald-500 dark:from-red-600 dark:to-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, progressPercent)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-heading font-black uppercase">
                <span className="text-slate-700 dark:text-slate-300">
                  {progressPercent}% TARGET REACHED
                </span>
                <span className="text-slate-500 dark:text-slate-400 font-mono">
                  {isGoalAchieved ? 'Goal Surpassed' : `${formatPHP(remainingAmount)} Remaining`}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Revenue Breakdown Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-80 shrink-0">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Logbook & Passes</span>
              </div>
              <div className="text-xl font-extrabold font-heading text-slate-900 dark:text-white">
                {formatPHP(logbookRevenue)}
              </div>
              <div className="text-[10px] text-slate-400">
                {totalRevenue > 0 ? Math.round((logbookRevenue / totalRevenue) * 100) : 0}% of combined
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>POS & Inventory</span>
              </div>
              <div className="text-xl font-extrabold font-heading text-slate-900 dark:text-white">
                {formatPHP(salesRevenue)}
              </div>
              <div className="text-[10px] text-slate-400">
                {totalRevenue > 0 ? Math.round((salesRevenue / totalRevenue) * 100) : 0}% of combined
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── GOAL CONFIGURATION & TARGET CUSTOMIZER ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-base font-extrabold font-heading uppercase text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#123c73] dark:text-red-400" />
            <span>Customize Goal Target Limits</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Adjust threshold limits for your facility. Updates will immediately reflect in the sidebar flipper card and all dashboard widgets.
          </p>
        </div>

        <form onSubmit={handleSaveAll} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-heading font-black uppercase text-slate-600 dark:text-slate-400">
              Daily Target (₱)
            </label>
            <input
              type="number"
              min="100"
              step="100"
              value={editValues.daily}
              onChange={(e) => setEditValues({ ...editValues, daily: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-[#123c73] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-heading font-black uppercase text-slate-600 dark:text-slate-400">
              Weekly Target (₱)
            </label>
            <input
              type="number"
              min="500"
              step="500"
              value={editValues.weekly}
              onChange={(e) => setEditValues({ ...editValues, weekly: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-[#123c73] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-heading font-black uppercase text-slate-600 dark:text-slate-400">
              Monthly Target (₱)
            </label>
            <input
              type="number"
              min="1000"
              step="1000"
              value={editValues.monthly}
              onChange={(e) => setEditValues({ ...editValues, monthly: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-[#123c73] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-heading font-black uppercase text-slate-600 dark:text-slate-400">
              Yearly Target (₱)
            </label>
            <input
              type="number"
              min="10000"
              step="10000"
              value={editValues.yearly}
              onChange={(e) => setEditValues({ ...editValues, yearly: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-[#123c73] outline-none"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a00202] text-white text-xs font-heading font-black tracking-wider uppercase transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save All Goal Targets'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
