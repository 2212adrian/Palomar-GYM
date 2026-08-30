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
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(Boolean(searchQuery));

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, [isSearchOpen]);

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

  const isTabSelectable = useCallback((date: Date) => {
    if (role === 'staff') {
      return isToday(date);
    }
    return startOfDay(date).getTime() <= startOfDay(new Date()).getTime();
  }, [role]);
  
  useEffect(() => {
    const selectedDate = addDays(currentWeekStart, selectedDayIndex);
    const isPastOrToday = startOfDay(selectedDate).getTime() <= startOfDay(new Date()).getTime();

    if (role === 'admin' && isPastOrToday) return;

    if (!isTabSelectable(selectedDate)) {
      const today = new Date();
      const todayStart = startOfDay(today).getTime();
      const weekStart = startOfDay(currentWeekStart).getTime();
      const weekEnd = startOfDay(addDays(currentWeekStart, 6)).getTime();

      if (todayStart >= weekStart && todayStart <= weekEnd) {
        const todayIdx = getDay(today);
        onDayIndexChange(todayIdx);
      } else {
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

  const handleResetToCurrent = useCallback(() => {
    const today = new Date();
    const currentWeek = startOfWeek(today, { weekStartsOn: 0 });
    const todayIndex = getDay(today);

    onWeekStartChange(currentWeek);
    onDayIndexChange(todayIndex);
  }, [onWeekStartChange, onDayIndexChange]);

  const handleNextWeek = () => {
    const nextWeek = addWeeks(currentWeekStart, 1);
    const realWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    if (startOfDay(nextWeek).getTime() <= startOfDay(realWeekStart).getTime()) {
      onWeekStartChange(nextWeek);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;

    // Parse YYYY-MM-DD in local time
    const [year, month, day] = e.target.value.split('-').map(Number);
    const pickedDate = new Date(year, month - 1, day);
    const today = new Date();

    // Lock future dates
    if (startOfDay(pickedDate).getTime() > startOfDay(today).getTime()) {
      return;
    }
    
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

      {/* ─── VISIBLE CONTRASTING CONTAINER ─── */}
      <div className="bg-slate-100 dark:bg-[#161920] border border-slate-200/90 dark:border-white/10 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-xs mb-4 space-y-3">
        
        {/* Top Header Row */}
        <div className="flex items-center justify-between w-full gap-2">
          
          {/* Left Controls: "<" & Mobile Search Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {role === 'admin' ? (
              <button
                onClick={() => onWeekStartChange(subWeeks(currentWeekStart, 1))}
                className="p-2 sm:p-2.5 bg-white dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-[#252b37] transition-all cursor-pointer active:scale-95 shrink-0 shadow-xs"
                aria-label="Previous week"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700 dark:text-slate-200" />
              </button>
            ) : (
              <div className="w-9 h-9 hidden sm:block" />
            )}

            {/* Expandable Search Toggle Button (Mobile Only: hidden on md+) */}
            <button
              onClick={() => setIsSearchOpen((prev) => !prev)}
              className={`md:hidden p-2 sm:p-2.5 border rounded-xl transition-all cursor-pointer active:scale-95 shrink-0 relative shadow-xs ${
                isSearchOpen || searchQuery
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-[#123c73] dark:border-[#bf0202]'
                  : 'bg-white dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#252b37]'
              }`}
              aria-label="Toggle search bar"
              title="Search records"
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              {Boolean(searchQuery) && !isSearchOpen && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
              )}
            </button>
          </div>

          {/* Header Date Display */}
          <div 
            onClick={() => dateInputRef.current?.showPicker()} 
            className="text-center flex-1 cursor-pointer hover:opacity-80 transition-opacity relative py-0.5"
          >
            <span className="text-[9px] font-heading tracking-widest text-[#123c73] dark:text-slate-400 uppercase select-none block font-bold">
              SELECTED WEEK DATE
            </span>
            <span className="font-heading text-xs sm:text-sm text-[#123c73] dark:text-slate-100 tracking-wider block mt-0.5 select-none font-extrabold">
              {role === 'admin' ? (
                `${format(currentWeekStart, 'MMMM d')} — ${format(endOfWeek(currentWeekStart, { weekStartsOn: 0 }), 'MMMM d, yyyy')}`
              ) : (
                format(addDays(currentWeekStart, selectedDayIndex), 'EEEE, MMMM d, yyyy')
              )}
            </span>

            {/* Native Date Picker locked to current and past dates */}
            <input 
              ref={dateInputRef}
              type="date"
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={handleDateChange}
              className="absolute left-1/2 -translate-x-1/2 w-48 h-full opacity-0 cursor-pointer pointer-events-none"
            />
          </div>

          {/* Right Controls: Today & Next Week */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isCurrentWeek && role === 'admin' && (
              <button
                onClick={handleResetToCurrent}
                className="px-2.5 py-2 sm:px-3 text-xs text-[#123c73] bg-[#123c73]/10 dark:text-red-300 dark:bg-red-950/40 border border-[#123c73]/20 dark:border-red-500/30 font-sans tracking-wider rounded-xl flex items-center gap-1.5 font-bold hover:bg-[#123c73]/20 dark:hover:bg-red-950/60 transition-all cursor-pointer active:scale-95 shrink-0 shadow-xs"
                aria-label="Reset to current day"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="uppercase text-[9px] sm:text-[10px] tracking-wider font-heading font-extrabold">Today</span>
              </button>
            )}

            {role === 'admin' ? (
              <button
                onClick={handleNextWeek}
                disabled={isCurrentWeek}
                className="p-2 sm:p-2.5 bg-white dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-[#252b37] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 shrink-0 shadow-xs"
                aria-label="Next week"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700 dark:text-slate-200" />
              </button>
            ) : (
              <div className="w-9 h-9 hidden sm:block" />
            )}
          </div>
        </div>

        {/* Weekly Day Cards */}
        {role === 'admin' && (
          <div className="w-full overflow-hidden px-0.5">
            <div 
              key={currentWeekStart.toISOString()}
              className={`grid grid-cols-7 gap-1.5 sm:gap-2.5 w-full ${
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
                    className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 relative ${
                      active 
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-[#123c73] dark:border-[#bf0202] shadow-md scale-[1.03] z-10 font-bold' 
                        : selectable 
                          ? 'bg-white dark:bg-[#1e232d] border-slate-200/90 dark:border-white/10 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-[#252b37] font-bold shadow-xs active:scale-95' 
                          : 'bg-transparent border-transparent text-slate-400 dark:text-zinc-600 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-[8.5px] sm:text-[9.5px] font-heading tracking-wider">{day}</span>
                    <span className="text-sm sm:text-base font-sans font-black mt-0.5">{format(date, 'd')}</span>
                    {isTodayDate && (
                      <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-[#123c73] dark:bg-red-400'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Filters Row: Always open on Desktop (md:), collapsible on Mobile */}
        <div 
          className={`grid transition-all duration-300 ease-in-out overflow-hidden md:grid-rows-[1fr] md:opacity-100 md:pointer-events-auto md:pt-1 ${
            isSearchOpen 
              ? 'grid-rows-[1fr] opacity-100 pt-1' 
              : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="flex items-center gap-2 w-full pt-1 pb-0.5">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 sm:pl-9 pr-7 sm:pr-8 py-2 bg-white dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#123c73]/30 dark:focus:ring-red-500/30 transition-all shadow-xs placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchQueryChange('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Type Filter */}
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
                    className="bg-white dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-[10px] sm:text-xs font-heading font-bold uppercase tracking-wider py-2 pl-2.5 pr-7 rounded-xl outline-none cursor-pointer hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-xs"
                  >
                    {filterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#1e232d] text-slate-800 dark:text-slate-200">
                        {opt.label === 'All' ? 'Type: All' : opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              {/* Payment Filter */}
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
                    className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[10px] sm:text-xs font-heading font-bold uppercase tracking-wider py-2 pl-2.5 pr-7 rounded-xl outline-none cursor-pointer hover:bg-emerald-500/20 transition-colors shadow-xs"
                  >
                    {paymentOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#1e232d] text-slate-800 dark:text-slate-200">
                        {opt.label === 'All Pay' || opt.label === 'All' ? 'Pay: All' : `Pay: ${opt.label}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};