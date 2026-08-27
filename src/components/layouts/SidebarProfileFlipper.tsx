// src/components/layouts/SidebarProfileFlipper.tsx
import React, { useState, useRef, useEffect, memo } from 'react';
import { motion, animate } from 'framer-motion';
import { 
  Target, 
  RotateCw, 
  Zap, 
  Flame, 
  Crown, 
  Shield,
  Ticket,
  ShoppingBag
} from 'lucide-react';
import { useRevenueGoals, type GoalTimeframe } from '../../stores/useRevenueGoals';

// ─── HUD THEMES (No heavy gradient transitions to prevent click lag) ───
interface GameCardTheme {
  label: string;
  badgeTitle: string;
  icon: React.ReactNode;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
  activePillClass: string;
  inactivePillClass: string;
  progressBarBg: string;
  progressBarFill: string;
  percentBadgeBg: string;
  accentSubtext: string;
  chipBg: string;
  chipBorder: string;
}

const GAME_THEMES: Record<GoalTimeframe, GameCardTheme> = {
  daily: {
    label: 'DAY',
    badgeTitle: 'DAILY TARGET',
    icon: <Zap className="w-3 h-3 text-emerald-300 shrink-0 fill-emerald-300/30" />,
    bgGradient: 'from-[#032e22] via-[#064e3b] to-[#021f17]',
    borderColor: 'border-emerald-500/40',
    glowColor: 'shadow-[0_4px_16px_rgba(5,150,105,0.2)]',
    activePillClass: 'bg-emerald-400 text-slate-950 font-black shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    inactivePillClass: 'text-emerald-200/70 hover:text-white hover:bg-emerald-900/50',
    progressBarBg: 'bg-slate-950/70 border border-emerald-500/30',
    progressBarFill: 'bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-200 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
    percentBadgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
    accentSubtext: 'text-emerald-300',
    chipBg: 'bg-emerald-950/70',
    chipBorder: 'border-emerald-500/30'
  },
  weekly: {
    label: 'WK',
    badgeTitle: 'WEEKLY TARGET',
    icon: <Shield className="w-3 h-3 text-sky-300 shrink-0 fill-sky-300/30" />,
    bgGradient: 'from-[#04243a] via-[#0369a1] to-[#031d30]',
    borderColor: 'border-sky-500/40',
    glowColor: 'shadow-[0_4px_16px_rgba(14,165,233,0.2)]',
    activePillClass: 'bg-sky-400 text-slate-950 font-black shadow-[0_0_8px_rgba(56,189,248,0.6)]',
    inactivePillClass: 'text-sky-200/70 hover:text-white hover:bg-sky-900/50',
    progressBarBg: 'bg-slate-950/70 border border-sky-500/30',
    progressBarFill: 'bg-gradient-to-r from-sky-500 via-cyan-300 to-blue-200 shadow-[0_0_8px_rgba(56,189,248,0.8)]',
    percentBadgeBg: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
    accentSubtext: 'text-sky-300',
    chipBg: 'bg-sky-950/70',
    chipBorder: 'border-sky-500/30'
  },
  monthly: {
    label: 'MO',
    badgeTitle: 'MONTHLY TARGET',
    icon: <Flame className="w-3 h-3 text-violet-300 shrink-0 fill-violet-300/30" />,
    bgGradient: 'from-[#230b42] via-[#5b21b6] to-[#180630]',
    borderColor: 'border-violet-500/40',
    glowColor: 'shadow-[0_4px_16px_rgba(139,92,246,0.2)]',
    activePillClass: 'bg-violet-400 text-slate-950 font-black shadow-[0_0_8px_rgba(167,139,250,0.6)]',
    inactivePillClass: 'text-violet-200/70 hover:text-white hover:bg-violet-900/50',
    progressBarBg: 'bg-slate-950/70 border border-violet-500/30',
    progressBarFill: 'bg-gradient-to-r from-violet-500 via-fuchsia-300 to-purple-200 shadow-[0_0_8px_rgba(167,139,250,0.8)]',
    percentBadgeBg: 'bg-violet-500/20 text-violet-300 border-violet-400/40',
    accentSubtext: 'text-violet-300',
    chipBg: 'bg-violet-950/70',
    chipBorder: 'border-violet-500/30'
  },
  yearly: {
    label: 'YR',
    badgeTitle: 'YEARLY TARGET',
    icon: <Crown className="w-3 h-3 text-amber-300 shrink-0 fill-amber-300/30" />,
    bgGradient: 'from-[#331405] via-[#854d0e] to-[#240e04]',
    borderColor: 'border-amber-500/40',
    glowColor: 'shadow-[0_4px_16px_rgba(245,158,11,0.2)]',
    activePillClass: 'bg-amber-400 text-slate-950 font-black shadow-[0_0_8px_rgba(251,191,36,0.6)]',
    inactivePillClass: 'text-amber-200/70 hover:text-white hover:bg-amber-900/50',
    progressBarBg: 'bg-slate-950/70 border border-amber-500/30',
    progressBarFill: 'bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-100 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
    percentBadgeBg: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
    accentSubtext: 'text-amber-300',
    chipBg: 'bg-amber-950/70',
    chipBorder: 'border-amber-500/30'
  }
};

// ─── INSTANT NUMBER COUNTER (FAST 200ms EASING) ───
const AnimatedCurrencyDisplay: React.FC<{ value: number }> = memo(({ value }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const prevValRef = useRef(value);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const controls = animate(prevValRef.current, value, {
      duration: 0.2, // Ultra fast & responsive
      ease: 'easeOut',
      onUpdate(latest) {
        node.textContent = `₱${Math.round(latest).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      },
      onComplete() {
        prevValRef.current = value;
      }
    });

    return () => controls.stop();
  }, [value]);

  return (
    <span ref={nodeRef} className="font-sans font-black tabular-nums tracking-tight">
      ₱{value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
});

AnimatedCurrencyDisplay.displayName = 'AnimatedCurrencyDisplay';

interface SidebarProfileFlipperProps {
  profile: any;
  user: any;
  fallbackCharacter: string;
  avatarElement: React.ReactNode;
}

export const SidebarProfileFlipper: React.FC<SidebarProfileFlipperProps> = ({
  profile,
  user,
  avatarElement
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const {
    timeframe,
    setTimeframe,
    logbookRevenue,
    salesRevenue,
    totalRevenue,
    currentGoalTarget,
    progressPercent,
    remainingAmount,
    isGoalAchieved
  } = useRevenueGoals();

  const activeTheme = GAME_THEMES[timeframe] || GAME_THEMES.daily;
  const timeframeKeys: GoalTimeframe[] = ['daily', 'weekly', 'monthly', 'yearly'];

  return (
    // Dynamic height animation container (92px for Profile, 148px for Goals)
    <motion.div 
      className="relative w-full perspective-[1000px] select-none"
      animate={{ height: isFlipped ? 148 : 92 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div 
        className="w-full h-full relative transition-transform duration-500 transform-gpu"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* ══════════════════════════════════════════════
            FRONT FACE: COMPACT PROFILE CARD (NO DEAD SPACE)
        ══════════════════════════════════════════════ */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/90 dark:border-white/10 p-2.5 shadow-xs flex flex-col justify-between"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Top Row: Avatar + Name + Goals Button */}
          <div className="flex items-center justify-between gap-2.5">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full ring-2 ring-[#123c73]/20 dark:ring-red-500/30 p-0.5 bg-slate-100 dark:bg-neutral-800 overflow-hidden">
                {avatarElement}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#161920]" />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-heading text-xs font-black tracking-wider uppercase text-slate-900 dark:text-white truncate leading-none">
                {profile?.username || 'Wolf Palomar'}
              </h4>

              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-[9px] font-sans font-extrabold uppercase tracking-wide">
                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                  {profile?.role || 'ADMIN'}
                </span>
              </div>
            </div>

            <button
              type="button"
              id="btn-flip-to-goals"
              onClick={() => setIsFlipped(true)}
              aria-label="Flip to Revenue Goals"
              title="View Revenue Goals Card"
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-[#123c73] dark:bg-neutral-800 dark:hover:bg-[#bf0202] text-slate-700 hover:text-white dark:text-slate-200 dark:hover:text-white border border-slate-200/80 dark:border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95 group shrink-0"
            >
              <Target className="w-3.5 h-3.5 text-[#123c73] group-hover:text-white dark:text-red-400 transition-transform group-hover:rotate-45" />
              <span className="text-[10px] font-sans font-black tracking-wider uppercase">GOALS</span>
            </button>
          </div>

          {/* Bottom Row: User Email & Status (Sits closely below) */}
          <div className="pt-1.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px]">
            <span className="font-mono font-medium text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {user?.email || 'admin@wolfpalomar.com'}
            </span>
            <span className="text-[8.5px] font-sans font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            BACK FACE: INSTANT REVENUE GOALS HUD
        ══════════════════════════════════════════════ */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden"
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          <div 
            className={`w-full h-full relative overflow-hidden rounded-2xl border p-2.5 text-white ${activeTheme.borderColor} ${activeTheme.glowColor} bg-gradient-to-br ${activeTheme.bgGradient} flex flex-col justify-between`}
          >
            {/* Subtle background glow */}
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-1.5">
              {/* Row 1: Timeframe Switcher & Profile Flip Button */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/15">
                  {timeframeKeys.map((key) => {
                    const cfg = GAME_THEMES[key];
                    const isSelected = timeframe === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTimeframe(key);
                        }}
                        className={`px-2 py-0.5 rounded text-[8.5px] font-sans font-extrabold tracking-wider uppercase cursor-pointer ${
                          isSelected
                            ? cfg.activePillClass
                            : cfg.inactivePillClass
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  id="btn-flip-to-profile"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFlipped(false);
                  }}
                  aria-label="Flip back to profile"
                  title="Return to User Profile"
                  className="px-2 py-1 rounded-lg bg-black/40 hover:bg-black/70 text-white/90 hover:text-white border border-white/20 flex items-center gap-1 transition-colors cursor-pointer shrink-0 active:scale-95 shadow-xs"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-sans font-black tracking-wider uppercase">PROFILE</span>
                </button>
              </div>

              {/* Row 2: Target Badge + Big Currency & Progress Percent */}
              <div>
                <div className="flex items-center justify-between text-white/90">
                  <div className="flex items-center gap-1">
                    {activeTheme.icon}
                    <span className="text-[9.5px] font-sans font-black tracking-wider uppercase drop-shadow-xs">
                      {activeTheme.badgeTitle}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-white/90">
                    TARGET: ₱{currentGoalTarget >= 1000 ? `${(currentGoalTarget / 1000).toLocaleString()}k` : currentGoalTarget}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
                  <div className="text-base leading-tight text-white drop-shadow-md font-sans font-black tracking-tight">
                    <AnimatedCurrencyDisplay value={totalRevenue} />
                  </div>

                  <div className={`px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-black tracking-tight shrink-0 ${
                    isGoalAchieved
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]'
                      : activeTheme.percentBadgeBg
                  }`}>
                    {progressPercent}%
                  </div>
                </div>
              </div>

              {/* Row 3: Thick Instant Progress Bar */}
              <div className="space-y-0.5">
                <div className={`w-full h-2.5 rounded-full overflow-hidden p-0.5 ${activeTheme.progressBarBg}`}>
                  <motion.div
                    className={`h-full rounded-full ${activeTheme.progressBarFill}`}
                    initial={false}
                    animate={{ width: `${Math.min(100, Math.max(3, progressPercent))}%` }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>

                <div className="flex items-center justify-between text-[8px] font-mono font-bold leading-none">
                  <span className={activeTheme.accentSubtext}>
                    {isGoalAchieved ? '✓ Goal Achieved' : `₱${Math.round(remainingAmount).toLocaleString()} left`}
                  </span>
                  <span className="text-white/80 font-sans tracking-wider">
                    {isGoalAchieved ? 'COMPLETED' : 'ACTIVE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Row 4: Clean Passes & Sales Breakdown Footer */}
            <div className="grid grid-cols-2 gap-1.5 relative z-10 pt-1 border-t border-white/15">
              <div className={`px-2 py-0.5 rounded-lg border backdrop-blur-md flex items-center justify-between ${activeTheme.chipBg} ${activeTheme.chipBorder}`}>
                <div className="flex items-center gap-1 text-white/80">
                  <Ticket className="w-2.5 h-2.5 shrink-0" />
                  <span className="text-[8px] font-sans font-bold uppercase tracking-wider">PASSES</span>
                </div>
                <span className="text-[9px] font-mono font-bold text-white">₱{Math.round(logbookRevenue).toLocaleString()}</span>
              </div>

              <div className={`px-2 py-0.5 rounded-lg border backdrop-blur-md flex items-center justify-between ${activeTheme.chipBg} ${activeTheme.chipBorder}`}>
                <div className="flex items-center gap-1 text-white/80">
                  <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                  <span className="text-[8px] font-sans font-bold uppercase tracking-wider">SALES</span>
                </div>
                <span className="text-[9px] font-mono font-bold text-white">₱{Math.round(salesRevenue).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};