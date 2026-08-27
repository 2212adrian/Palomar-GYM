// src/components/layouts/SidebarProfileFlipper.tsx
import React, { useState, useRef, useEffect, memo } from 'react';
import { motion, animate } from 'framer-motion';
import { 
  Target, 
  RotateCw, 
  Edit3, 
  Check, 
  X, 
  Award,
  Sparkles
} from 'lucide-react';
import { useRevenueGoals, type GoalTimeframe } from '../../stores/useRevenueGoals';

// ─── DYNAMIC BANKNOTE / TARGET POPPING EFFECT ───
const GoalTrendIcon: React.FC<{ trend: 'increasing' | 'decreasing' | 'neutral'; isAchieved: boolean }> = memo(({ trend, isAchieved }) => {
  return (
    <motion.div
      key={`${trend}-${isAchieved}`}
      initial={
        trend === 'increasing'
          ? { scale: 0.4, rotate: -20, opacity: 0 }
          : trend === 'decreasing'
          ? { scale: 0.4, rotate: 20, opacity: 0 }
          : { scale: 1, rotate: 0, opacity: 1 }
      }
      animate={
        trend === 'increasing'
          ? {
              scale: [0.4, 1.45, 0.95, 1],
              rotate: [-20, 8, -3, 0],
              opacity: [0, 1, 1, 1],
              filter: [
                'drop-shadow(0 0 0px rgba(16,185,129,0))',
                'drop-shadow(0 0 12px rgba(16,185,129,0.9))',
                'drop-shadow(0 0 3px rgba(16,185,129,0.4))'
              ]
            }
          : trend === 'decreasing'
          ? {
              scale: [0.4, 1.45, 0.95, 1],
              rotate: [20, -8, 3, 0],
              opacity: [0, 1, 1, 1],
              filter: [
                'drop-shadow(0 0 0px rgba(239,68,68,0))',
                'drop-shadow(0 0 12px rgba(239,68,68,0.9))',
                'drop-shadow(0 0 3px rgba(239,68,68,0.4))'
              ]
            }
          : {
              scale: 1,
              rotate: 0,
              opacity: 1,
              filter: isAchieved ? 'drop-shadow(0 0 6px rgba(234,179,8,0.6))' : 'drop-shadow(0 0 0px rgba(0,0,0,0))'
            }
      }
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className={`shrink-0 flex items-center justify-center ${
        isAchieved
          ? 'text-amber-500 dark:text-amber-400'
          : trend === 'increasing'
          ? 'text-emerald-500 dark:text-emerald-400'
          : trend === 'decreasing'
          ? 'text-rose-500 dark:text-rose-400'
          : 'text-emerald-500 dark:text-emerald-400'
      }`}
    >
      {isAchieved ? (
        <Award className="w-4 h-4 text-amber-500 dark:text-amber-400 animate-bounce" />
      ) : trend === 'increasing' ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5" />
          <circle cx="10" cy="12" r="2" />
          <path d="M6 12h.01" />
          <path d="M19 21v-8" />
          <path d="m16 16 3-3 3 3" />
        </svg>
      ) : trend === 'decreasing' ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5" />
          <circle cx="10" cy="12" r="2" />
          <path d="M6 12h.01" />
          <path d="M19 13v8" />
          <path d="m16 18 3 3 3-3" />
        </svg>
      ) : (
        <Target className="w-4 h-4" />
      )}
    </motion.div>
  );
});

GoalTrendIcon.displayName = 'GoalTrendIcon';

// ─── SMOOTH NUMBER COUNTER TICKER ───
const AnimatedCurrencyDisplay: React.FC<{ value: number }> = memo(({ value }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const prevValRef = useRef(value);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const controls = animate(prevValRef.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        node.textContent = `₱${Math.round(latest).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      },
      onComplete() {
        prevValRef.current = value;
      }
    });

    return () => controls.stop();
  }, [value]);

  return <span ref={nodeRef} className="tabular-nums">₱{value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
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
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState('');

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
    trend
  } = useRevenueGoals();

  const handleStartEditGoal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempGoalInput(String(currentGoalTarget));
    setIsEditingGoal(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const val = Number(tempGoalInput);
    if (!isNaN(val) && val > 0) {
      updateGoals({
        ...goalsConfig,
        [timeframe]: val
      });
    }
    setIsEditingGoal(false);
  };

  const timeframeLabels: { key: GoalTimeframe; label: string; full: string }[] = [
    { key: 'daily', label: 'Day', full: 'Daily Goal' },
    { key: 'weekly', label: 'Wk', full: 'Weekly Goal' },
    { key: 'monthly', label: 'Mo', full: 'Monthly Goal' },
    { key: 'yearly', label: 'Yr', full: 'Yearly Goal' }
  ];

  return (
    <div className="relative w-full perspective-[1000px] select-none">
      <div 
        className="w-full relative transition-transform duration-500 transform-gpu"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* ══════════════════════════════════════════════
            FRONT FACE: USER PROFILE
        ══════════════════════════════════════════════ */}
        <div 
          className="w-full backface-hidden"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-center justify-between gap-2.5">
            {/* Left: Avatar + Info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-full ring-2 ring-[#123c73]/20 dark:ring-red-500/30 p-0.5 shrink-0 bg-slate-100 dark:bg-neutral-800 shadow-xs relative overflow-hidden">
                {avatarElement}
              </div>

              <div className="flex-1 min-w-0 text-left">
                <h4 className="font-heading text-xs font-extrabold tracking-wider uppercase text-slate-900 dark:text-white truncate leading-tight">
                  {profile?.username || 'Wolf Palomar'}
                </h4>

                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#123c73]/10 dark:bg-red-500/20 text-[#123c73] dark:text-red-300 border border-[#123c73]/20 dark:border-red-500/30 text-[9px] font-heading font-black tracking-widest uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    {profile?.role || 'ADMIN'}
                  </span>
                </div>

                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate mt-1">
                  {user?.email || 'wolf.palomar@gmail.com'}
                </p>
              </div>
            </div>

            {/* Right: Flip Switch Button */}
            <button
              type="button"
              id="btn-flip-to-goals"
              onClick={() => setIsFlipped(true)}
              aria-label="Flip to Revenue Goals"
              title="Flip to View Revenue Goals"
              className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-neutral-800/80 hover:bg-[#123c73]/10 dark:hover:bg-red-500/20 text-slate-600 dark:text-slate-300 hover:text-[#123c73] dark:hover:text-red-400 border border-slate-200/80 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer group shadow-xs shrink-0 active:scale-95"
            >
              <Target className="w-4 h-4 transition-transform group-hover:rotate-45" />
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            BACK FACE: REVENUE GOALS CARD (FLIPPED 180 DEG)
        ══════════════════════════════════════════════ */}
        <div 
          className="absolute inset-0 w-full backface-hidden"
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          <div className="h-full flex flex-col justify-between rounded-xl bg-white/90 dark:bg-[#12151c]/95 border border-slate-200/80 dark:border-white/10 p-2.5 shadow-sm">
            {/* Top Toolbar: Timeframe Pills + Flip Back Button */}
            <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-neutral-900 p-0.5 rounded-lg border border-slate-200/60 dark:border-white/5">
                {timeframeLabels.map((tf) => (
                  <button
                    key={tf.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTimeframe(tf.key);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[9px] font-heading font-black tracking-wider uppercase transition-all cursor-pointer ${
                      timeframe === tf.key
                        ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {/* Flip Back to Profile */}
              <button
                type="button"
                id="btn-flip-to-profile"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(false);
                }}
                aria-label="Flip back to profile"
                title="Return to User Profile"
                className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            </div>

            {/* Middle: Revenue Value + Trend Ticker */}
            <div className="py-1">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <GoalTrendIcon trend={trend} isAchieved={isGoalAchieved} />
                  <div className="font-heading font-black text-sm tracking-tight text-slate-900 dark:text-white truncate">
                    <AnimatedCurrencyDisplay value={totalRevenue} />
                  </div>
                </div>

                {/* Edit Goal Target Button */}
                {!isEditingGoal ? (
                  <button
                    type="button"
                    onClick={handleStartEditGoal}
                    title="Edit Goal Target"
                    className="flex items-center gap-1 text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 hover:text-[#123c73] dark:hover:text-white px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 transition-colors cursor-pointer"
                  >
                    <span>/ ₱{currentGoalTarget >= 1000 ? `${(currentGoalTarget / 1000).toFixed(0)}k` : currentGoalTarget}</span>
                    <Edit3 className="w-2.5 h-2.5 opacity-60" />
                  </button>
                ) : (
                  <form onSubmit={handleSaveGoal} className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tempGoalInput}
                      onChange={(e) => setTempGoalInput(e.target.value)}
                      autoFocus
                      className="w-16 px-1 py-0.5 text-[10px] font-mono bg-white dark:bg-neutral-900 border border-[#123c73] dark:border-red-500 rounded text-slate-900 dark:text-white outline-none"
                    />
                    <button
                      type="submit"
                      className="w-4 h-4 rounded bg-emerald-600 text-white flex items-center justify-center text-[8px]"
                    >
                      <Check className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingGoal(false)}
                      className="w-4 h-4 rounded bg-slate-300 dark:bg-neutral-700 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[8px]"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </form>
                )}
              </div>

              {/* Breakdown subtext: Logbook + Sales */}
              <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 px-0.5">
                <span>Passes: ₱{Math.round(logbookRevenue).toLocaleString()}</span>
                <span>•</span>
                <span>Sales: ₱{Math.round(salesRevenue).toLocaleString()}</span>
              </div>
            </div>

            {/* Bottom: Progress Bar + Status */}
            <div>
              <div className="w-full h-1.5 bg-slate-200 dark:bg-neutral-800 rounded-full overflow-hidden relative">
                <motion.div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isGoalAchieved
                      ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400'
                      : progressPercent > 60
                      ? 'bg-gradient-to-r from-[#123c73] to-emerald-500 dark:from-red-600 dark:to-emerald-500'
                      : 'bg-[#123c73] dark:bg-[#bf0202]'
                  }`}
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, progressPercent)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>

              <div className="flex items-center justify-between text-[8px] font-heading font-black tracking-wider uppercase mt-1">
                <span className={isGoalAchieved ? 'text-amber-500 dark:text-amber-400 flex items-center gap-0.5' : 'text-slate-600 dark:text-slate-400'}>
                  {isGoalAchieved && <Sparkles className="w-2 h-2 animate-spin" />}
                  {progressPercent}% REACHED
                </span>
                <span className="text-slate-400 dark:text-slate-500 font-mono">
                  {isGoalAchieved ? 'GOAL MET!' : `₱${Math.round(remainingAmount).toLocaleString()} left`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
