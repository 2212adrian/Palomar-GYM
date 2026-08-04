// src/components/ui/TimelineBar.tsx
import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { 
  format, 
  addDays, 
  isToday, 
  startOfDay, 
  addWeeks, 
  subWeeks,
  startOfWeek,
  endOfWeek,
  getDay
} from 'date-fns';
import { ChevronLeft, ChevronRight, RotateCcw, Search, X, ChevronDown } from 'lucide-react';

interface FilterOption {
  label: string;
  value: string;
}

interface TimelineBarProps {
  currentWeekStart: Date;
  onWeekStartChange: (date: Date) => void;
  selectedDayIndex: number;
  onDayIndexChange: (index: number) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  activeFilter?: string;
  onFilterChange?: (filter: any) => void;
  filterOptions?: FilterOption[];
  paymentFilter?: string;
  onPaymentFilterChange?: (filter: any) => void;
  paymentOptions?: FilterOption[];
  role?: 'admin' | 'staff';
  searchPlaceholder?: string;
}

const DAYS_OF_WEEK: string[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const TimelineBar: React.FC<TimelineBarProps> = ({
  currentWeekStart,
  onWeekStartChange,
  selectedDayIndex,
  onDayIndexChange,
  searchQuery,
  onSearchQueryChange,
  activeFilter,
  onFilterChange,
  filterOptions = [],
  paymentFilter,
  onPaymentFilterChange,
  paymentOptions = [],
  role = 'admin',
  searchPlaceholder = 'Search records...'
}) => {
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Carousel direction tracking ('right' = forward in time, 'left' = backward in time)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const prevWeekStartRef = useRef<Date>(currentWeekStart);

  useEffect(() => {
    const prevTime = prevWeekStartRef.current.getTime();
    const currentTime = currentWeekStart.getTime();

    if (currentTime > prevTime) {
      setSlideDirection('right');
    } else if (currentTime < prevTime) {
      setSlideDirection('left');
    }

    prevWeekStartRef.current = currentWeekStart;
  }, [currentWeekStart]);

  const isCurrentWeek = useMemo(() => {
    const realWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    return startOfDay(currentWeekStart).getTime() >= startOfDay(realWeekStart).getTime();
  }, [currentWeekStart]);

  // Wrapped in useCallback to prevent unnecessary hook re-runs
  const isTabSelectable = useCallback((date: Date) => {
    if (role === 'staff') {
      return isToday(date);
    }
    return startOfDay(date).getTime() <= startOfDay(new Date()).getTime();
  }, [role]);
  
// Automatically adjust selectedDayIndex if the currently selected day becomes unselectable
  useEffect(() => {
    const selectedDate = addDays(currentWeekStart, selectedDayIndex);
    const isPastOrToday = startOfDay(selectedDate).getTime() <= startOfDay(new Date()).getTime();

    // Do not reset past date views for admins
    if (role === 'admin' && isPastOrToday) return;

    if (!isTabSelectable(selectedDate)) {
      const today = new Date();
      const todayStart = startOfDay(today).getTime();
      const weekStart = startOfDay(currentWeekStart).getTime();
      const weekEnd = startOfDay(addDays(currentWeekStart, 6)).getTime();

      // 1. If today is within the currently selected week, default the selection to today
      if (todayStart >= weekStart && todayStart <= weekEnd) {
        const todayIdx = getDay(today);
        onDayIndexChange(todayIdx);
      } else {
        // 2. Otherwise, scan backwards from the end of the week to find the closest selectable day
        for (let i = 6; i >= 0; i--) {
          const date = addDays(currentWeekStart, i);
          if (isTabSelectable(date)) {
            onDayIndexChange(i);
            break;
          }
        }
      }
    }
  }, [currentWeekStart, selectedDayIndex, isTabSelectable, onDayIndexChange, role]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const pickedDate = new Date(e.target.value);
    
    // Prevent futures in staff boundaries
    if (role === 'staff' && !isToday(pickedDate)) {
      return;
    }
    
    const newWeekStart = startOfWeek(pickedDate, { weekStartsOn: 0 });
    const dayIndex = getDay(pickedDate);

    onWeekStartChange(newWeekStart);
    onDayIndexChange(dayIndex);
  };

  return (
    <>
      {/* ─── CAROUSEL KEYFRAME ANIMATIONS ─── */}
      <style>{`
        @keyframes carouselSlideRight {
          0% {
            transform: translateX(35px);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes carouselSlideLeft {
          0% {
            transform: translateX(-35px);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .animate-carousel-right {
          animation: carouselSlideRight 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .animate-carousel-left {
          animation: carouselSlideLeft 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* ─── WEEKLY TIMELINE SCROLLER (UNBOXED / BORDERLESS FOR MAXIMUM MOBILE SPACE) ─── */}
      <div className="sticky top-0 z-30 py-2.5 px-1 bg-(--bg-page)/95 backdrop-blur-md space-y-2.5 flex flex-col items-center transition-all mb-3 border-b border-(--border-color)/40">
        <div className="flex items-center justify-between w-full">
          {role === 'admin' ? (
            <button
              onClick={() => onWeekStartChange(subWeeks(currentWeekStart, 1))}
              className="p-1.5 border border-(--border-color) rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4 text-(--color-text)" />
            </button>
          ) : (
            <div className="w-7 h-7 hidden sm:block" />
          )}

          {/* Header Date Picker */}
          <div 
            onClick={() => dateInputRef.current?.showPicker()} 
            className="text-center flex-1 cursor-pointer hover:opacity-85 transition-opacity relative"
          >
            <span className="text-[9px] font-heading tracking-widest text-[#1b365d] dark:text-slate-400 uppercase select-none block font-bold">
              SELECTED WEEK DATE
            </span>
            <span className="font-heading text-xs sm:text-sm text-[#193d70] dark:text-slate-100 tracking-wider block mt-0.5 select-none font-extrabold">
              {role === 'admin' ? (
                `${format(currentWeekStart, 'MMMM d')} — ${format(endOfWeek(currentWeekStart, { weekStartsOn: 0 }), 'MMMM d, yyyy')}`
              ) : (
                format(addDays(currentWeekStart, selectedDayIndex), 'EEEE, MMMM d, yyyy')
              )}
            </span>

            <input 
              ref={dateInputRef}
              type="date"
              onChange={handleDateChange}
              className="absolute left-1/2 -translate-x-1/2 w-48 h-full opacity-0 cursor-pointer pointer-events-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {!isCurrentWeek && role === 'admin' && (
              <button
                onClick={() => onWeekStartChange(startOfWeek(new Date(), { weekStartsOn: 0 }))}
                className="p-1.5 text-xs text-(--color-primary) bg-(--color-primary)/10 font-sans tracking-wider rounded-xl flex items-center gap-1 font-bold hover:bg-(--color-primary)/20 transition-all cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline uppercase text-[9px] tracking-wider font-heading">Current</span>
              </button>
            )}

            {role === 'admin' ? (
              <button
                onClick={() => onWeekStartChange(addWeeks(currentWeekStart, 1))}
                disabled={isCurrentWeek}
                className="p-1.5 border border-(--border-color) rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors cursor-pointer active:scale-95"
                aria-label="Next week"
              >
                <ChevronRight className="w-4 h-4 text-(--color-text)" />
              </button>
            ) : (
              <div className="w-7 h-7 hidden sm:block" />
            )}
          </div>
        </div>

        {/* Weekly Day Rails Carousel Viewport */}
        {role === 'admin' && (
          <div className="w-full overflow-hidden px-0.5 py-0.5">
            <div 
              key={currentWeekStart.toISOString()}
              className={`grid grid-cols-7 gap-1 w-full ${
                slideDirection === 'right' 
                  ? 'animate-carousel-right' 
                  : slideDirection === 'left' 
                  ? 'animate-carousel-left' 
                  : ''
              }`}
            >
              {DAYS_OF_WEEK.map((day: string, idx: number) => {
                const date = addDays(currentWeekStart, idx);
                const active = selectedDayIndex === idx;
                const selectable = isTabSelectable(date);
                const isTodayDate = isToday(date);

                // Slight staggered entrance calculation depending on direction
                const staggerDelay = slideDirection === 'right' 
                  ? `${idx * 20}ms` 
                  : slideDirection === 'left' 
                  ? `${(6 - idx) * 20}ms` 
                  : '0ms';

                return (
                  <button
                    key={day}
                    onClick={() => selectable && onDayIndexChange(idx)}
                    disabled={!selectable}
                    style={{ animationDelay: staggerDelay }}
                   className={`py-2 px-0.5 sm:px-1 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 relative ${
  active 
    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-[#123c73] dark:border-[#bf0202] shadow-sm scale-[1.02] z-10 font-bold' 
    : selectable 
      ? 'bg-(--bg-card) border-(--border-color) text-slate-700 dark:text-slate-300 hover:border-slate-350 dark:hover:border-white/10 font-bold active:scale-95' 
      : 'bg-transparent border-transparent text-slate-350 dark:text-zinc-755 opacity-40 cursor-not-allowed'
}`}
                  >
                    <span className="text-[8px] sm:text-[9px] font-heading tracking-wider">{day}</span>
                    <span className="text-s font-sans font-extrabold">{format(date, 'd')}</span>
                    {isTodayDate && (
                      <span className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-(--color-primary)'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

  {/* ─── NON-SCROLLABLE 1-ROW SEARCH & DROPDOWN FILTERS TOOLBAR ─── */}
<div className="flex items-center gap-2 w-full mb-4">
  {/* Flexible Search Input */}
  <div className="relative flex-1 min-w-0">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 pointer-events-none" />
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => onSearchQueryChange(e.target.value)}
      placeholder={searchPlaceholder}
      className="w-full pl-8 sm:pl-9 pr-7 sm:pr-8 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none focus:ring-1 focus:ring-(--color-primary) transition-all shadow-xs"
    />
    {searchQuery && (
      <button
        type="button"
        onClick={() => onSearchQueryChange('')}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-(--color-text) cursor-pointer"
        title="Clear search"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>

{/* Customer Type Dropdown Filter */}
{filterOptions.length > 0 && onFilterChange && (
  <div className="relative shrink-0">
    <select
      value={activeFilter || 'All'}
      onChange={(e) => onFilterChange(e.target.value)}
      style={{ 
        backgroundImage: 'none', 
        WebkitAppearance: 'none', 
        MozAppearance: 'none', 
        appearance: 'none' 
      }}
      className="bg-(--bg-card) border border-(--border-color) text-slate-700 dark:text-slate-200 text-[10px] sm:text-xs font-heading font-bold uppercase tracking-wider py-2 pl-2.5 pr-7 rounded-xl outline-none cursor-pointer hover:border-slate-400 dark:hover:border-zinc-600 transition-colors shadow-xs"
    >
      {filterOptions.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-(--bg-card) text-(--color-text)">
          {opt.label === 'All' ? 'Type: All' : opt.label}
        </option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
)}

{/* Payment Method Dropdown Filter */}
{paymentOptions && paymentOptions.length > 0 && onPaymentFilterChange && (
  <div className="relative shrink-0">
    <select
      value={paymentFilter || 'All'}
      onChange={(e) => onPaymentFilterChange(e.target.value)}
      style={{ 
        backgroundImage: 'none', 
        WebkitAppearance: 'none', 
        MozAppearance: 'none', 
        appearance: 'none' 
      }}
      className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs font-heading font-bold uppercase tracking-wider py-2 pl-2.5 pr-7 rounded-xl outline-none cursor-pointer hover:bg-emerald-500/20 transition-colors shadow-xs"
    >
      {paymentOptions.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-(--bg-card) text-(--color-text)">
          {opt.label === 'All Pay' || opt.label === 'All' ? 'Pay: All' : `Pay: ${opt.label}`}
        </option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 text-emerald-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
)}
</div>
    </>
  );
};