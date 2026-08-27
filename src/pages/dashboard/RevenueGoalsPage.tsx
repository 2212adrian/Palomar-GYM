// src/pages/dashboard/RevenueGoalsPage.tsx
import React, { useState, useEffect } from 'react';
import { 
  Target, 
  TrendingUp, 
  Sparkles, 
  CheckCircle2, 
  RotateCcw,
  ShoppingBag,
  Ticket,
  ShieldAlert,
  Loader2,
  Zap,
  Shield,
  Flame,
  Crown,
  ArrowUpRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useRevenueGoals, type GoalTimeframe } from '../../stores/useRevenueGoals';
import { formatPHP } from './dashboardService';

// ─── SOLID & CRISP DUAL-THEME TOKENS ───
interface TimeframeTheme {
  id: GoalTimeframe;
  label: string;
  badgeTitle: string;
  icon: React.ReactNode;
  benchmark: string;
  
  // Selector Card States (Crisp & Solid, No Foggy Glares)
  activeCard: string;
  inactiveCard: string;
  topBarColor: string;
  iconContainerActive: string;
  iconContainerInactive: string;
  titleColorActive: string;
  titleColorInactive: string;

  // Hero Container (Deep Rich Solid-Gradients)
  heroContainer: string;
  
  // Progress Bar & Badges
  progressBarFill: string;
  progressTrackBg: string;
  badgeClass: string;
  accentText: string;
  chipBg: string;
  chipBorder: string;
  inputBorderFocus: string;
  inputRingFocus: string;
}

const TIMEFRAME_CARDS: TimeframeTheme[] = [
  {
    id: 'daily',
    label: 'Daily Target',
    badgeTitle: 'DAILY BENCHMARK',
    icon: <Zap className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
    benchmark: 'Baseline: ₱5,000 / day',
    activeCard: 'bg-emerald-50/80 dark:bg-[#091f16] border-emerald-500 dark:border-emerald-400 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/30 dark:ring-emerald-400/40',
    inactiveCard: 'bg-white dark:bg-[#161920] border-slate-200 dark:border-white/10 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:shadow-xs',
    topBarColor: 'bg-emerald-500',
    iconContainerActive: 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-300',
    iconContainerInactive: 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-900/40 text-emerald-500/70 dark:text-emerald-400/70',
    titleColorActive: 'text-emerald-700 dark:text-emerald-300',
    titleColorInactive: 'text-slate-700 dark:text-slate-300',
     heroContainer: 'bg-gradient-to-br from-emerald-50/90 to-teal-50/40 dark:from-[#06241a] dark:via-[#041a13] dark:to-[#02130e] border-emerald-300/80 dark:border-emerald-500/40 shadow-lg shadow-emerald-500/5 dark:shadow-[0_8px_32px_rgba(5,150,105,0.2)]',
    progressBarFill: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 dark:from-emerald-400 dark:via-teal-300 dark:to-emerald-200 shadow-sm dark:shadow-[0_0_15px_rgba(52,211,153,0.8)]',
    progressTrackBg: 'bg-slate-200/80 dark:bg-black/60 border border-slate-300/80 dark:border-emerald-500/30',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/40',
    accentText: 'text-emerald-700 dark:text-emerald-400',
    chipBg: 'bg-white/90 dark:bg-[#0a261c]/80',
    chipBorder: 'border-slate-200 dark:border-emerald-500/30',
    inputBorderFocus: 'focus-within:border-emerald-500 dark:focus-within:border-emerald-400',
    inputRingFocus: 'focus-within:ring-emerald-500/20'
  },
  {
    id: 'weekly',
    label: 'Weekly Target',
    badgeTitle: 'WEEKLY BENCHMARK',
    icon: <Shield className="w-5 h-5 text-sky-500 dark:text-sky-400" />,
    benchmark: 'Baseline: ₱35,000 / week',
    activeCard: 'bg-sky-50/80 dark:bg-[#071e2e] border-sky-500 dark:border-sky-400 shadow-md shadow-sky-500/10 ring-1 ring-sky-500/30 dark:ring-sky-400/40',
    inactiveCard: 'bg-white dark:bg-[#161920] border-slate-200 dark:border-white/10 hover:border-sky-300 dark:hover:border-sky-500/40 hover:shadow-xs',
    topBarColor: 'bg-sky-500',
    iconContainerActive: 'bg-sky-100 dark:bg-sky-500/20 border-sky-300 dark:border-sky-500/40 text-sky-600 dark:text-sky-300',
    iconContainerInactive: 'bg-sky-50/60 dark:bg-sky-950/40 border-sky-200/60 dark:border-sky-900/40 text-sky-500/70 dark:text-sky-400/70',
    titleColorActive: 'text-sky-700 dark:text-sky-300',
    titleColorInactive: 'text-slate-700 dark:text-slate-300',
    heroContainer: 'bg-gradient-to-br from-sky-50/90 to-blue-50/40 dark:from-[#071d30] dark:via-[#051524] dark:to-[#030e1a] border-sky-300/80 dark:border-sky-500/40 shadow-lg shadow-sky-500/5 dark:shadow-[0_8px_32px_rgba(14,165,233,0.2)]',
    progressBarFill: 'bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-300 dark:from-sky-400 dark:via-cyan-300 dark:to-blue-200 shadow-sm dark:shadow-[0_0_15px_rgba(56,189,248,0.8)]',
    progressTrackBg: 'bg-slate-200/80 dark:bg-black/60 border border-slate-300/80 dark:border-sky-500/30',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-400/40',
    accentText: 'text-sky-700 dark:text-sky-400',
    chipBg: 'bg-white/90 dark:bg-[#092338]/80',
    chipBorder: 'border-slate-200 dark:border-sky-500/30',
    inputBorderFocus: 'focus-within:border-sky-500 dark:focus-within:border-sky-400',
    inputRingFocus: 'focus-within:ring-sky-500/20'
  },
  {
    id: 'monthly',
    label: 'Monthly Target',
    badgeTitle: 'MONTHLY BENCHMARK',
    icon: <Flame className="w-5 h-5 text-violet-500 dark:text-violet-400" />,
    benchmark: 'Baseline: ₱150,000 / month',
    activeCard: 'bg-violet-50/80 dark:bg-[#1a0a2e] border-violet-500 dark:border-violet-400 shadow-md shadow-violet-500/10 ring-1 ring-violet-500/30 dark:ring-violet-400/40',
    inactiveCard: 'bg-white dark:bg-[#161920] border-slate-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40 hover:shadow-xs',
    topBarColor: 'bg-violet-500',
    iconContainerActive: 'bg-violet-100 dark:bg-violet-500/20 border-violet-300 dark:border-violet-500/40 text-violet-600 dark:text-violet-300',
    iconContainerInactive: 'bg-violet-50/60 dark:bg-violet-950/40 border-violet-200/60 dark:border-violet-900/40 text-violet-500/70 dark:text-violet-400/70',
    titleColorActive: 'text-violet-700 dark:text-violet-300',
    titleColorInactive: 'text-slate-700 dark:text-slate-300',
     heroContainer: 'bg-gradient-to-br from-violet-50/90 to-purple-50/40 dark:from-[#1b0933] dark:via-[#130624] dark:to-[#0c0419] border-violet-300/80 dark:border-violet-500/40 shadow-lg shadow-violet-500/5 dark:shadow-[0_8px_32px_rgba(139,92,246,0.2)]',
    progressBarFill: 'bg-gradient-to-r from-violet-500 via-fuchsia-400 to-purple-300 dark:from-violet-400 dark:via-fuchsia-300 dark:to-purple-200 shadow-sm dark:shadow-[0_0_15px_rgba(167,139,250,0.8)]',
    progressTrackBg: 'bg-slate-200/80 dark:bg-black/60 border border-slate-300/80 dark:border-violet-500/30',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-400/40',
    accentText: 'text-violet-700 dark:text-violet-400',
    chipBg: 'bg-white/90 dark:bg-[#230d42]/80',
    chipBorder: 'border-slate-200 dark:border-violet-500/30',
    inputBorderFocus: 'focus-within:border-violet-500 dark:focus-within:border-violet-400',
    inputRingFocus: 'focus-within:ring-violet-500/20'
  },
  {
    id: 'yearly',
    label: 'Yearly Target',
    badgeTitle: 'ANNUAL BENCHMARK',
    icon: <Crown className="w-5 h-5 text-amber-500 dark:text-amber-400" />,
    benchmark: 'Baseline: ₱1,800,000 / year',
    activeCard: 'bg-amber-50/80 dark:bg-[#241306] border-amber-500 dark:border-amber-400 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30 dark:ring-amber-400/40',
    inactiveCard: 'bg-white dark:bg-[#161920] border-slate-200 dark:border-white/10 hover:border-amber-300 dark:hover:border-amber-500/40 hover:shadow-xs',
    topBarColor: 'bg-amber-500',
    iconContainerActive: 'bg-amber-100 dark:bg-amber-500/20 border-amber-300 dark:border-amber-500/40 text-amber-600 dark:text-amber-300',
    iconContainerInactive: 'bg-amber-50/60 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-900/40 text-amber-500/70 dark:text-amber-400/70',
    titleColorActive: 'text-amber-700 dark:text-amber-300',
    titleColorInactive: 'text-slate-700 dark:text-slate-300',
     heroContainer: 'bg-gradient-to-br from-amber-50/90 to-yellow-50/40 dark:from-[#261304] dark:via-[#1c0d03] dark:to-[#120902] border-amber-300/80 dark:border-amber-500/40 shadow-lg shadow-amber-500/5 dark:shadow-[0_8px_32px_rgba(245,158,11,0.2)]',
    progressBarFill: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 dark:from-amber-400 dark:via-yellow-300 dark:to-amber-100 shadow-sm dark:shadow-[0_0_15px_rgba(251,191,36,0.8)]',
    progressTrackBg: 'bg-slate-200/80 dark:bg-black/60 border border-slate-300/80 dark:border-amber-500/30',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/40',
    accentText: 'text-amber-700 dark:text-amber-400',
    chipBg: 'bg-white/90 dark:bg-[#331a08]/80',
    chipBorder: 'border-slate-200 dark:border-amber-500/30',
    inputBorderFocus: 'focus-within:border-amber-500 dark:focus-within:border-amber-400',
    inputRingFocus: 'focus-within:ring-amber-500/20'
  }
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
    refreshRevenue
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
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-heading font-black uppercase text-slate-900 dark:text-white">
          Access Restricted
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          Revenue targets and financial benchmark analytics are restricted to Administrator and Superadmin accounts.
        </p>
      </div>
    );
  }

  const currentTheme = TIMEFRAME_CARDS.find((c) => c.id === timeframe) || TIMEFRAME_CARDS[0];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto select-none animate-fade-in text-slate-900 dark:text-slate-100 relative">
      
      {/* ─── TOP BANNER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center shadow-md shadow-blue-900/10 dark:shadow-red-900/30 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase font-heading text-[#0b1a30] dark:text-white">
                  Revenue Goals & Targets
                </h1>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Tracker
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Real-time financial benchmark tracker aggregating POS retail sales and logbook attendance entry fees.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={refreshRevenue}
          disabled={isLoading}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-heading font-black tracking-wider uppercase flex items-center gap-2 shadow-xs hover:bg-slate-50 dark:hover:bg-[#1e232d] hover:border-slate-300 dark:hover:border-white/20 active:scale-95 cursor-pointer transition-all"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* ─── CLEAN TIMEFRAME SELECTOR CARDS (NO FOG / NO WHITE GLARE) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TIMEFRAME_CARDS.map((card) => {
          const isSelected = timeframe === card.id;
          const targetVal = goalsConfig[card.id];

          return (
            <button
              key={card.id}
              onClick={() => setTimeframe(card.id)}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group ${
                isSelected ? card.activeCard : card.inactiveCard
              }`}
            >
              {/* Solid Color Top Accent Line */}
              <div
                className={`absolute top-0 left-0 right-0 h-1.5 transition-all ${
                  isSelected ? card.topBarColor : 'bg-transparent group-hover:bg-slate-200 dark:group-hover:bg-white/10'
                }`}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border transition-colors ${
                    isSelected ? card.iconContainerActive : card.iconContainerInactive
                  }`}>
                    {card.icon}
                  </div>
                  <div>
                    <span className={`text-[11px] font-heading font-black tracking-wider uppercase block ${
                      isSelected ? card.titleColorActive : card.titleColorInactive
                    }`}>
                      {card.label}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-400">
                      {card.badgeTitle}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <span className="flex h-2 w-2 relative">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${card.topBarColor} opacity-75`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${card.topBarColor}`} />
                  </span>
                )}
              </div>

              <div className="mt-4">
                <div className="text-2xl font-black font-heading tracking-tight text-[#0b1a30] dark:text-white">
                  {formatPHP(targetVal)}
                </div>
                <div className="flex items-center justify-between text-[10.5px] font-mono font-medium text-slate-400 dark:text-slate-400 mt-1">
                  <span>{card.benchmark}</span>
                  <ArrowUpRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? `${card.accentText} translate-x-0.5 -translate-y-0.5` : 'opacity-0 group-hover:opacity-100'}`} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── MAIN HERO LIVE STATUS TRACKER (HIGH CONTRAST) ─── */}
      <div className={`relative overflow-hidden rounded-3xl border p-6 sm:p-8 transition-all duration-300 ${currentTheme.heroContainer}`}>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          
          {/* Left: Progress Meter */}
          <div className="space-y-4 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-lg text-[10px] font-sans font-black tracking-wider uppercase border backdrop-blur-md ${currentTheme.badgeClass}`}>
                ACTIVE: {timeframe.toUpperCase()} TARGET
              </span>
              {isGoalAchieved ? (
                <span className="px-3 py-1 rounded-lg text-[10px] font-sans font-black tracking-wider uppercase bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  GOAL ACHIEVED
                </span>
              ) : (
                <span className="px-3 py-1 rounded-lg text-[10px] font-sans font-black tracking-wider uppercase bg-slate-200/80 dark:bg-black/50 text-slate-700 dark:text-white/90 border border-slate-300 dark:border-white/20">
                  IN PROGRESS
                </span>
              )}
            </div>

            <div>
              <div className="text-4xl sm:text-6xl font-black font-heading tracking-tight text-[#0b1a30] dark:text-white flex flex-wrap items-baseline gap-3">
                <span>{formatPHP(totalRevenue)}</span>
                <span className="text-xl sm:text-3xl font-bold text-slate-400 dark:text-white/60 font-mono">
                  / {formatPHP(currentGoalTarget)}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium max-w-xl">
                Real-time synchronized revenue combining hardware gate passes and POS checkout register inventory sales.
              </p>
            </div>

            {/* Thick Radiant Progress Bar */}
            <div className="space-y-2 pt-2">
              <div className={`w-full h-4 rounded-full overflow-hidden p-0.5 ${currentTheme.progressTrackBg}`}>
                <motion.div
                  className={`h-full rounded-full ${currentTheme.progressBarFill}`}
                  initial={false}
                  animate={{ width: `${Math.min(100, Math.max(2, progressPercent))}%` }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-heading font-black tracking-wide">
                <span className={currentTheme.accentText}>
                  {progressPercent}% COMPLETED
                </span>
                <span className="text-slate-500 dark:text-slate-300 font-mono text-[11px]">
                  {isGoalAchieved ? '✓ Target Surpassed' : `${formatPHP(remainingAmount)} Remaining`}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Frosted Breakdown Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5 lg:w-84 shrink-0">
            {/* Passes Tile */}
            <div className={`p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between shadow-xs ${currentTheme.chipBg} ${currentTheme.chipBorder}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-300">
                  <Ticket className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="text-[11px] font-sans font-black uppercase tracking-wider">Logbook & Passes</span>
                </div>
                <div className="text-2xl font-black font-mono text-[#0b1a30] dark:text-white">
                  {formatPHP(logbookRevenue)}
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-white/10 text-xs font-mono font-bold text-slate-700 dark:text-white">
                {totalRevenue > 0 ? Math.round((logbookRevenue / totalRevenue) * 100) : 0}%
              </div>
            </div>

            {/* Sales Tile */}
            <div className={`p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between shadow-xs ${currentTheme.chipBg} ${currentTheme.chipBorder}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-300">
                  <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-sans font-black uppercase tracking-wider">POS & Inventory</span>
                </div>
                <div className="text-2xl font-black font-mono text-[#0b1a30] dark:text-white">
                  {formatPHP(salesRevenue)}
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-white/10 text-xs font-mono font-bold text-slate-700 dark:text-white">
                {totalRevenue > 0 ? Math.round((salesRevenue / totalRevenue) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── GOAL CONFIGURATION & TARGET CUSTOMIZER ─── */}
      <div className="bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
          <div>
            <h2 className="text-lg font-black font-heading uppercase text-[#0b1a30] dark:text-white flex items-center gap-2.5">
              <TrendingUp className="w-5 h-5 text-[#123c73] dark:text-red-400" />
              <span>Customize Goal Target Limits</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Adjust benchmark targets for your facility. Updates will save directly to Supabase and immediately sync across all terminals.
            </p>
          </div>
        </div>

        {saveSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Goal targets saved successfully and synced across all dashboard modules.</span>
          </motion.div>
        )}

        {saveError && (
          <div className="p-4 bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold">
            {saveError}
          </div>
        )}

        <form onSubmit={handleSaveAll} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Daily Input */}
          <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#0c0e12] border border-slate-200 dark:border-white/5 focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <Zap className="w-3.5 h-3.5" />
              <label className="text-[11px] font-heading font-black uppercase tracking-wider">
                Daily Target (₱)
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">₱</span>
              <input
                type="number"
                min="100"
                step="100"
                value={editValues.daily}
                onChange={(e) => setEditValues({ ...editValues, daily: Number(e.target.value) || 0 })}
                className="w-full pl-7 pr-3 py-2 text-base font-mono font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-xl text-[#0b1a30] dark:text-white outline-none shadow-xs focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Weekly Input */}
          <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#0c0e12] border border-slate-200 dark:border-white/5 focus-within:border-sky-500 dark:focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all space-y-2">
            <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400">
              <Shield className="w-3.5 h-3.5" />
              <label className="text-[11px] font-heading font-black uppercase tracking-wider">
                Weekly Target (₱)
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">₱</span>
              <input
                type="number"
                min="500"
                step="500"
                value={editValues.weekly}
                onChange={(e) => setEditValues({ ...editValues, weekly: Number(e.target.value) || 0 })}
                className="w-full pl-7 pr-3 py-2 text-base font-mono font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-xl text-[#0b1a30] dark:text-white outline-none shadow-xs focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Monthly Input */}
          <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#0c0e12] border border-slate-200 dark:border-white/5 focus-within:border-violet-500 dark:focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all space-y-2">
            <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-400">
              <Flame className="w-3.5 h-3.5" />
              <label className="text-[11px] font-heading font-black uppercase tracking-wider">
                Monthly Target (₱)
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">₱</span>
              <input
                type="number"
                min="1000"
                step="1000"
                value={editValues.monthly}
                onChange={(e) => setEditValues({ ...editValues, monthly: Number(e.target.value) || 0 })}
                className="w-full pl-7 pr-3 py-2 text-base font-mono font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-xl text-[#0b1a30] dark:text-white outline-none shadow-xs focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Yearly Input */}
          <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#0c0e12] border border-slate-200 dark:border-white/5 focus-within:border-amber-500 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all space-y-2">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Crown className="w-3.5 h-3.5" />
              <label className="text-[11px] font-heading font-black uppercase tracking-wider">
                Yearly Target (₱)
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">₱</span>
              <input
                type="number"
                min="10000"
                step="10000"
                value={editValues.yearly}
                onChange={(e) => setEditValues({ ...editValues, yearly: Number(e.target.value) || 0 })}
                className="w-full pl-7 pr-3 py-2 text-base font-mono font-bold bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-xl text-[#0b1a30] dark:text-white outline-none shadow-xs focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-end gap-2 pt-3">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-2xl bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] text-white text-xs font-heading font-black tracking-wider uppercase transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{isSaving ? 'Saving to Database...' : 'Save All Goal Targets'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};