// src/pages/dashboard/RevenueGoalsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  WifiOff,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
} from 'date-fns';
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
    dateRange,
    isLoading,
    isAdmin,
    refreshRevenue,
  } = useRevenueGoals();

  const timeframeThemes = useMemo<TimeframeTheme[]>(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    return [
      {
        id: 'daily',
        label: 'Daily Target',
        sublabel: format(now, 'EEE, MMM d'),
        helperText: 'Today (12:00 AM – 11:59 PM)',
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
        sublabel: `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`,
        helperText: 'Calendar Week (Mon – Sun)',
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
        sublabel: format(now, 'MMMM yyyy'),
        helperText: `${format(monthStart, 'MMM 1')} – ${format(monthEnd, 'MMM d')}`,
        icon: Calendar,
        activeCard:
          'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 dark:border-blue-400 ring-1 ring-blue-500/20 dark:ring-blue-400/30',
        inactiveCard:
          'bg-white dark:bg-[#161920] border-slate-200/80 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700/60',
        topBarColor: 'bg-blue-500',
        iconContainerActive: 'bg-blue-500 text-white dark:bg-blue-500',
        iconContainerInactive:
          'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/40',
        titleColorActive: 'text-blue-800 dark:text-blue-300',
        indicatorColor: 'bg-blue-500',
        heroContainer:
          'border-blue-200/90 dark:border-blue-900/60 bg-gradient-to-br from-blue-50/40 via-white to-sky-50/20 dark:from-[#09152c] dark:via-[#161920] dark:to-[#071022]',
        progressBarFill:
          'bg-gradient-to-r from-blue-600 via-blue-400 to-sky-300',
        badgeClass:
          'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800',
        accentText: 'text-blue-600 dark:text-blue-400',
        inputBorderFocus:
          'focus-within:border-blue-500 dark:focus-within:border-blue-400',
        inputRingFocus: 'focus-within:ring-blue-500/20',
        inputIconColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        id: 'yearly',
        label: 'Yearly Target',
        sublabel: `Year ${format(now, 'yyyy')}`,
        helperText: `Jan 1 – Dec 31, ${format(now, 'yyyy')}`,
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
  }, []);

  // Reactive Network Connection State
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [editValues, setEditValues] = useState(goalsConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditValues(goalsConfig);
  }, [goalsConfig]);

  // Dirty check: compares current input values against persisted targets
  const isDirty = Boolean(
    editValues.daily !== goalsConfig.daily ||
    editValues.weekly !== goalsConfig.weekly ||
    editValues.monthly !== goalsConfig.monthly ||
    editValues.yearly !== goalsConfig.yearly
  );

  const handleCancel = () => {
    setEditValues(goalsConfig);
    setSaveError(null);
    toast.info('Changes discarded.');
  };

  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isOffline) {
      setSaveError('Cannot save revenue targets: No internet connection.');
      toast.error('Cannot save revenue targets: No internet connection.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await updateGoals(editValues);
      setSaveSuccess(true);
      toast.success('Revenue targets updated successfully.');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to save goals to database';
      setSaveError(errorMsg);
      toast.error(errorMsg);
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
    timeframeThemes.find((c) => c.id === timeframe) || timeframeThemes[0];
  const CurrentIcon = currentTheme.icon;

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none text-slate-900 dark:text-slate-100 pb-28 sm:pb-32">
      {/* ─── SLEEK ACTION TOOLBAR (Eliminates redundant double header) ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2"></div>

        <button
          onClick={refreshRevenue}
          disabled={isLoading || isOffline}
          className={`self-start sm:self-auto px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-2xs transition-all ${
            isOffline
              ? 'bg-slate-100 dark:bg-[#12151c] text-slate-400 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
              : 'bg-white dark:bg-[#161920] border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1e232d] hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 cursor-pointer disabled:opacity-60'
          }`}
          title={isOffline ? 'Offline - Totals sync restricted' : 'Refresh Totals'}
        >
          <RotateCcw
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          <span>Refresh Totals</span>
        </button>
      </div>

      {/* ─── 4-COLOR TIMEFRAME SELECTOR CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {timeframeThemes.map((theme) => {
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

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 font-mono shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>{dateRange.detailedLabel}</span>
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
                    Logbook Via Members
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
                    Sales via Products
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
        {isOffline && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs select-none">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Offline Mode: Targets are in view-only mode. Editing and updating benchmarks are disabled.</span>
            </div>
            <span className="text-[10px] uppercase font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded-md">
              View Only
            </span>
          </div>
        )}

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
          id="revenue-goals-form"
          onSubmit={handleSaveAll}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Daily Input (Emerald) */}
          <div className={`p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all space-y-2 ${isOffline ? 'opacity-70' : ''}`}>
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
                disabled={isOffline}
                value={editValues.daily}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    daily: Number(e.target.value) || 0,
                  }))
                }
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:dark:bg-[#12151c] disabled:text-slate-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Weekly Input (Sky) */}
          <div className={`p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-sky-500 dark:focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all space-y-2 ${isOffline ? 'opacity-70' : ''}`}>
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
                disabled={isOffline}
                value={editValues.weekly}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    weekly: Number(e.target.value) || 0,
                  }))
                }
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:dark:bg-[#12151c] disabled:text-slate-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Monthly Input (Blue) */}
          <div className={`p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all space-y-2 ${isOffline ? 'opacity-70' : ''}`}>
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
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
                disabled={isOffline}
                value={editValues.monthly}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    monthly: Number(e.target.value) || 0,
                  }))
                }
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:dark:bg-[#12151c] disabled:text-slate-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Yearly Input (Amber) */}
          <div className={`p-4 rounded-2xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 focus-within:border-amber-500 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all space-y-2 ${isOffline ? 'opacity-70' : ''}`}>
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
                disabled={isOffline}
                value={editValues.yearly}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    yearly: Number(e.target.value) || 0,
                  }))
                }
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                className="w-full pl-7 pr-3 py-2 text-base font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none shadow-2xs focus:ring-1 focus:ring-amber-500 disabled:bg-slate-100 disabled:dark:bg-[#12151c] disabled:text-slate-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </form>
      </div>

      {/* ─── FLOATING ACTION BAR VIA PORTAL (Unbothered by scrolling, appears only when changes exist) ─── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isDirty && (
              <motion.div
                key="floating-revenue-actions"
                initial={{ opacity: 0, y: 24, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="fixed bottom-[calc(4.85rem+env(safe-area-inset-bottom,0px))] md:bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-[250] pointer-events-auto select-none"
              >
                <div className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-2xl bg-white/95 dark:bg-[#12151c]/95 backdrop-blur-xl border border-slate-200/90 dark:border-zinc-700/80 shadow-[0_12px_36px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/5">
                  <div className="hidden sm:flex items-center gap-2 pl-2.5 pr-1 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Unsaved target changes</span>
                  </div>

                  {/* Cancel Button */}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCancel}
                    className="px-4 py-2 sm:py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>

                  {/* Save Changes Button */}
                  <button
                    type="button"
                    disabled={isSaving || isOffline}
                    onClick={() => handleSaveAll()}
                    className={`px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center gap-2 ${
                      isOffline
                        ? 'bg-slate-400 dark:bg-zinc-700 opacity-50 cursor-not-allowed'
                        : 'bg-(--color-primary) hover:bg-(--color-primary-hover) cursor-pointer active:scale-95 disabled:opacity-50'
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};