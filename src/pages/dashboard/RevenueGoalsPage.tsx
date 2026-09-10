// src/pages/dashboard/RevenueGoalsPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Target,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  ShoppingBag,
  Ticket,
  ShieldAlert,
  Loader2,
  Clock,
  CalendarDays,
  Calendar,
  Trophy,
  Save,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  useRevenueGoals,
  type GoalTimeframe,
} from '../../stores/useRevenueGoals';
import { formatPHP } from './dashboardService';

interface TimeframeTheme {
  id: GoalTimeframe;
  label: string;
  sublabel: string;
  helperText: string;
  icon: React.ComponentType<{ className?: string }>;

  // Card selector tokens
  activeCard: string;
  inactiveCard: string;
  topBarColor: string;
  iconContainerActive: string;
  iconContainerInactive: string;
  titleColorActive: string;
  indicatorColor: string;

  // Hero progress section tokens
  heroContainer: string;
  progressBarFill: string;
  badgeClass: string;
  accentText: string;

  // Form customizer tokens
  inputBorderFocus: string;
  inputRingFocus: string;
  inputIconColor: string;
}

const TIMEFRAME_THEMES: TimeframeTheme[] = [
  {
    id: 'daily',
    label: 'Daily Target',
    sublabel: 'Today',
    helperText: "Today's revenue goal",
    icon: Clock,
    activeCard:
      'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-400 ring-1 ring-emerald-500/20 dark:ring-emerald-400/30',
    inactiveCard:
      'bg-white dark:bg-[#161920] border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/60',
    topBarColor: 'bg-emerald-500',
    iconContainerActive: 'bg-emerald-500 text-white dark:bg-emerald-500',
    iconContainerInactive:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/40',
    titleColorActive: 'text-emerald-800 dark:text-emerald-300',
    indicatorColor: 'bg-emerald-500',
    heroContainer:
      'border-emerald-200/90 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/20 dark:from-[#061d15] dark:via-[#161920] dark:to-[#04140e]',
    progressBarFill:
      'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300',
    badgeClass:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    accentText: 'text-emerald-600 dark:text-emerald-400',
    inputBorderFocus:
      'focus-within:border-emerald-500 dark:focus-within:border-emerald-400',
    inputRingFocus: 'focus-within:ring-emerald-500/20',
    inputIconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'weekly',
    label: 'Weekly Target',
    sublabel: '7 Days',
    helperText: '7-day revenue goal',
    icon: CalendarDays,
    activeCard:
      'bg-sky-50/70 dark:bg-sky-950/30 border-sky-500 dark:border-sky-400 ring-1 ring-sky-500/20 dark:ring-sky-400/30',
    inactiveCard:
      'bg-white dark:bg-[#161920] border-slate-200/80 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700/60',
    topBarColor: 'bg-sky-500',
    iconContainerActive: 'bg-sky-500 text-white dark:bg-sky-500',
    iconContainerInactive:
      'bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200/60 dark:border-sky-900/40',
    titleColorActive: 'text-sky-800 dark:text-sky-300',
    indicatorColor: 'bg-sky-500',
    heroContainer:
      'border-sky-200/90 dark:border-sky-900/60 bg-gradient-to-br from-sky-50/40 via-white to-blue-50/20 dark:from-[#061828] dark:via-[#161920] dark:to-[#04111d]',
    progressBarFill: 'bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-400',
    badgeClass:
      'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border-sky-300 dark:border-sky-800',
    accentText: 'text-sky-600 dark:text-sky-400',
    inputBorderFocus:
      'focus-within:border-sky-500 dark:focus-within:border-sky-400',
    inputRingFocus: 'focus-within:ring-sky-500/20',
    inputIconColor: 'text-sky-600 dark:text-sky-400',
  },
  {
    id: 'monthly',
    label: 'Monthly Target',
    sublabel: '30 Days',
    helperText: 'Calendar month goal',
    icon: Calendar,
    activeCard:
      'bg-violet-50/70 dark:bg-violet-950/30 border-violet-500 dark:border-violet-400 ring-1 ring-violet-500/20 dark:ring-violet-400/30',
    inactiveCard:
      'bg-white dark:bg-[#161920] border-slate-200/80 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700/60',
    topBarColor: 'bg-violet-500',
    iconContainerActive: 'bg-violet-500 text-white dark:bg-violet-500',
    iconContainerInactive:
      'bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-200/60 dark:border-violet-900/40',
    titleColorActive: 'text-violet-800 dark:text-violet-300',
    indicatorColor: 'bg-violet-500',
    heroContainer:
      'border-violet-200/90 dark:border-violet-900/60 bg-gradient-to-br from-violet-50/40 via-white to-purple-50/20 dark:from-[#19092c] dark:via-[#161920] dark:to-[#10051e]',
    progressBarFill:
      'bg-gradient-to-r from-violet-500 via-fuchsia-400 to-purple-400',
    badgeClass:
      'bg-violet-100 text-violet-800 dark:bg-violet-950/80 dark:text-violet-300 border-violet-300 dark:border-violet-800',
    accentText: 'text-violet-600 dark:text-violet-400',
    inputBorderFocus:
      'focus-within:border-violet-500 dark:focus-within:border-violet-400',
    inputRingFocus: 'focus-within:ring-violet-500/20',
    inputIconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    id: 'yearly',
    label: 'Yearly Target',
    sublabel: '12 Months',
    helperText: 'Annual revenue goal',
    icon: Trophy,
    activeCard:
      'bg-amber-50/70 dark:bg-amber-950/30 border-amber-500 dark:border-amber-400 ring-1 ring-amber-500/20 dark:ring-amber-400/30',
    inactiveCard:
      'bg-white dark:bg-[#161920] border-slate-200/80 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/60',
    topBarColor: 'bg-amber-500',
    iconContainerActive: 'bg-amber-500 text-white dark:bg-amber-500',
    iconContainerInactive:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40',
    titleColorActive: 'text-amber-800 dark:text-amber-300',
    indicatorColor: 'bg-amber-500',
    heroContainer:
      'border-amber-200/90 dark:border-amber-900/60 bg-gradient-to-br from-amber-50/40 via-white to-yellow-50/20 dark:from-[#241304] dark:via-[#161920] dark:to-[#170a02]',
    progressBarFill:
      'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300',
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    accentText: 'text-amber-600 dark:text-amber-400',
    inputBorderFocus:
      'focus-within:border-amber-500 dark:focus-within:border-amber-400',
    inputRingFocus: 'focus-within:ring-amber-500/20',
    inputIconColor: 'text-amber-600 dark:text-amber-400',
  },
];

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
    isAdmin,
    refreshRevenue,
  } = useRevenueGoals();

  const [editValues, setEditValues] = useState(goalsConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditValues(goalsConfig);
  }, [goalsConfig]);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await updateGoals(editValues);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save goals to database');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-heading font-black uppercase text-slate-900 dark:text-white">
          Access Restricted
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          Revenue targets and financial benchmark analytics are restricted to
          Administrator and Superadmin accounts.
        </p>
      </div>
    );
  }

  const currentTheme =
    TIMEFRAME_THEMES.find((c) => c.id === timeframe) || TIMEFRAME_THEMES[0];
  const CurrentIcon = currentTheme.icon;

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none text-slate-900 dark:text-slate-100">
      {/* ─── SLEEK ACTION TOOLBAR (Eliminates redundant double header) ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2"></div>

        <button
          onClick={refreshRevenue}
          disabled={isLoading}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-2 shadow-2xs hover:bg-slate-50 dark:hover:bg-[#1e232d] hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 cursor-pointer transition-all disabled:opacity-60"
        >
          <RotateCcw
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          <span>Refresh Totals</span>
        </button>
      </div>

      {/* ─── 4-COLOR TIMEFRAME SELECTOR CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {TIMEFRAME_THEMES.map((theme) => {
          const isSelected = timeframe === theme.id;
          const targetVal = goalsConfig[theme.id];
          const CardIcon = theme.icon;

          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setTimeframe(theme.id)}
              className={`p-4 rounded-2xl border text-left transition-all duration-150 cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                isSelected ? theme.activeCard : theme.inactiveCard
              }`}
            >
              {/* Solid Color Top Bar Accent */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 transition-all ${
                  isSelected ? theme.topBarColor : 'bg-transparent'
                }`}
              />

              <div className="flex items-center justify-between w-full mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                      isSelected
                        ? theme.iconContainerActive
                        : theme.iconContainerInactive
                    }`}
                  >
                    <CardIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <span
                      className={`text-xs font-bold uppercase tracking-wider block ${
                        isSelected
                          ? theme.titleColorActive
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {theme.label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {theme.sublabel}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <span className="flex h-2 w-2 relative">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full ${theme.indicatorColor} opacity-75`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${theme.indicatorColor}`}
                    />
                  </span>
                )}
              </div>

              <div>
                <div className="text-xl sm:text-2xl font-black font-heading tracking-tight text-slate-900 dark:text-white">
                  {formatPHP(targetVal)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {theme.helperText}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── DYNAMIC THEMED LIVE PROGRESS TRACKER ─── */}
      <div
        className={`rounded-3xl border p-5 sm:p-7 shadow-xs transition-colors duration-200 ${currentTheme.heroContainer}`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Side: Progress Gauge & Context */}
          <div className="space-y-4 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${currentTheme.badgeClass}`}
              >
                <CurrentIcon className="w-3.5 h-3.5" />
                {currentTheme.label.toUpperCase()} PROGRESS
              </span>

              {isGoalAchieved ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Goal Reached!
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  In Progress
                </span>
              )}
            </div>

            <div>
              <div className="text-3xl sm:text-5xl font-black font-heading tracking-tight text-slate-900 dark:text-white flex flex-wrap items-baseline gap-2 sm:gap-3">
                <span>{formatPHP(totalRevenue)}</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-400 dark:text-slate-500 font-mono">
                  / {formatPHP(currentGoalTarget)}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {isGoalAchieved
                  ? `Target achieved! You have surpassed your ${currentTheme.label.toLowerCase()} by ${formatPHP(Math.max(0, totalRevenue - currentGoalTarget))}.`
                  : `You need ${formatPHP(remainingAmount)} more to reach your ${currentTheme.label.toLowerCase()}.`}
              </p>
            </div>

            {/* High-Contrast Dynamic Themed Progress Bar */}
            <div className="space-y-2 pt-1">
              <div className="w-full h-3.5 sm:h-4 rounded-full bg-slate-100 dark:bg-[#0c0e12] border border-slate-200 dark:border-slate-800 overflow-hidden p-0.5">
                <motion.div
                  className={`h-full rounded-full transition-all ${currentTheme.progressBarFill}`}
                  initial={false}
                  animate={{
                    width: `${Math.min(100, Math.max(totalRevenue > 0 ? 3 : 0, progressPercent))}%`,
                  }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-bold">
                <span className={`${currentTheme.accentText} font-black`}>
                  {progressPercent}% Completed
                </span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {isGoalAchieved
                    ? '✓ Target Reached'
                    : `${formatPHP(remainingAmount)} Remaining`}
                </span>
              </div>
            </div>
          </div>

          {/* Right Side: Revenue Source Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 lg:w-80 shrink-0">
            {/* Logbook & Passes */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-[#1e232d]/60 backdrop-blur-xs flex items-center justify-between shadow-2xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Ticket className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Passes & Members
                  </span>
                </div>
                <div className="text-xl font-black font-heading text-slate-900 dark:text-white">
                  {formatPHP(logbookRevenue)}
                </div>
                <p className="text-[10px] text-slate-400">
                  Walk-in admission & member plans
                </p>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">
                {totalRevenue > 0
                  ? Math.round((logbookRevenue / totalRevenue) * 100)
                  : 0}
                %
              </div>
            </div>

            {/* POS & Retail Sales */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-[#1e232d]/60 backdrop-blur-xs flex items-center justify-between shadow-2xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Store & Retail
                  </span>
                </div>
                <div className="text-xl font-black font-heading text-slate-900 dark:text-white">
                  {formatPHP(salesRevenue)}
                </div>
                <p className="text-[10px] text-slate-400">
                  Drinks, snacks & merchandise
                </p>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">
                {totalRevenue > 0
                  ? Math.round((salesRevenue / totalRevenue) * 100)
                  : 0}
                %
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SET TARGET AMOUNTS (CLEAN & 4-COLOR THEMED EDITOR) ─── */}
      <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-black font-heading uppercase text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-[#123c73] dark:text-blue-400" />
              <span>Set Your Revenue Targets</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enter target amounts for each period. Updated goals apply
              immediately to live progress tracking.
            </p>
          </div>
        </div>

        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-bold flex items-center gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Target goals saved successfully and updated in real-time.
            </span>
          </motion.div>
        )}

        {saveError && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 rounded-2xl text-xs font-bold">
            {saveError}
          </div>
        )}

        <form
          onSubmit={handleSaveAll}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Daily Input (Emerald) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all space-y-2">
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Clock className="w-3.5 h-3.5" />
                <label className="text-xs font-bold uppercase tracking-wider">
                  Daily Target
                </label>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                Per Day
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">
                ₱
              </span>
              <input
                type="number"
                min="100"
                step="100"
                value={editValues.daily}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    daily: Number(e.target.value) || 0,
                  })
                }
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Weekly Input (Sky) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-sky-500 dark:focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all space-y-2">
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400">
                <CalendarDays className="w-3.5 h-3.5" />
                <label className="text-xs font-bold uppercase tracking-wider">
                  Weekly Target
                </label>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                7 Days
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">
                ₱
              </span>
              <input
                type="number"
                min="500"
                step="500"
                value={editValues.weekly}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    weekly: Number(e.target.value) || 0,
                  })
                }
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Monthly Input (Violet) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-violet-500 dark:focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all space-y-2">
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-400">
                <Calendar className="w-3.5 h-3.5" />
                <label className="text-xs font-bold uppercase tracking-wider">
                  Monthly Target
                </label>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                Month
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">
                ₱
              </span>
              <input
                type="number"
                min="1000"
                step="1000"
                value={editValues.monthly}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    monthly: Number(e.target.value) || 0,
                  })
                }
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Yearly Input (Amber) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-amber-500 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all space-y-2">
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <Trophy className="w-3.5 h-3.5" />
                <label className="text-xs font-bold uppercase tracking-wider">
                  Yearly Target
                </label>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                Full Year
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">
                ₱
              </span>
              <input
                type="number"
                min="10000"
                step="10000"
                value={editValues.yearly}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    yearly: Number(e.target.value) || 0,
                  })
                }
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] text-white text-xs font-bold tracking-wider uppercase transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isSaving ? 'Saving Changes...' : 'Save Targets'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
