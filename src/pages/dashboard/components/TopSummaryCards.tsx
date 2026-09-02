import React from 'react';
import {
  Users,
  UserCheck,
  DollarSign,
  Clock,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import type { DashboardMetrics } from '../types';
import { formatPHP, formatNumber } from '../dashboardService';

interface TopSummaryCardsProps {
  metrics: DashboardMetrics;
  onCardClick?: (
    target: 'members' | 'attendance' | 'sales' | 'expiring' | 'inventory'
  ) => void;
}

export const TopSummaryCards: React.FC<TopSummaryCardsProps> = ({
  metrics,
  onCardClick,
}) => {
  const attendanceDiff =
    metrics.todayAttendanceCount - metrics.yesterdayAttendanceCount;
  const isAttendanceUp = attendanceDiff >= 0;

  const revenueDiff = metrics.todayTotalRevenue - metrics.yesterdayTotalRevenue;
  const isRevenueUp = revenueDiff >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
      {/* 1. ACTIVE MEMBERS */}
      <div
        onClick={() => onCardClick?.('members')}
        className="group col-span-1 bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 hover:border-[#123c73]/50 dark:hover:border-blue-500/50 rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between min-w-0"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#123c73] dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Users className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-md shrink-0">
            +{metrics.newMembersThisMonth} new
          </span>
        </div>

        <div className="mt-3 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
            Active Members
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-heading mt-0.5 truncate">
            {formatNumber(metrics.activeMembersCount)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 gap-1">
            <span className="truncate">
              {metrics.totalMembersCount} registered
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:translate-x-1 group-hover:text-[#123c73] dark:group-hover:text-blue-400 transition-all" />
          </div>
        </div>
      </div>

      {/* 2. TODAY'S ATTENDANCE */}
      <div
        onClick={() => onCardClick?.('attendance')}
        className="group col-span-1 bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between min-w-0"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <UserCheck className="w-4 h-4" />
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 ${
              isAttendanceUp
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
            }`}
          >
            {isAttendanceUp ? `+${attendanceDiff}` : `${attendanceDiff}`} vs
            yest
          </span>
        </div>

        <div className="mt-3 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
            Today's Check-ins
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-heading mt-0.5 truncate">
            {formatNumber(metrics.todayAttendanceCount)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 gap-1">
            <span className="truncate">
              Peak: {metrics.peakHourLabel.split(' - ')[0]}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:translate-x-1 group-hover:text-emerald-500 transition-all" />
          </div>
        </div>
      </div>

      {/* 3. TODAY'S REVENUE (COMBINED) */}
      <div
        onClick={() => onCardClick?.('sales')}
        className="group col-span-1 bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between min-w-0"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <DollarSign className="w-4 h-4" />
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 ${
              isRevenueUp
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <TrendingUp className="w-3 h-3" /> Live
          </span>
        </div>

        <div className="mt-3 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
            Today's Gross Sales
          </span>
          <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 font-heading mt-0.5 truncate">
            {formatPHP(metrics.todayTotalRevenue)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 gap-1">
            <span className="truncate">
              POS: {formatPHP(metrics.todaySalesRevenue)}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:translate-x-1 group-hover:text-indigo-500 transition-all" />
          </div>
        </div>
      </div>

      {/* 4. EXPIRING MEMBERSHIPS */}
      <div
        onClick={() => onCardClick?.('expiring')}
        className="group col-span-1 bg-white dark:bg-[#161920] border border-amber-200/80 dark:border-amber-900/50 hover:border-amber-400 rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between min-w-0"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-md shrink-0">
            Next 7 Days
          </span>
        </div>

        <div className="mt-3 min-w-0">
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block truncate">
            Expiring Soon
          </span>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-heading mt-0.5 truncate">
            {formatNumber(metrics.expiringSoonCount)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 gap-1">
            <span className="truncate">{metrics.expiredCount} expired</span>
            <ArrowRight className="w-3.5 h-3.5 text-amber-500 shrink-0 group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </div>

      {/* 5. LOW STOCK ALERTS */}
      <div
        onClick={() => onCardClick?.('inventory')}
        className="group col-span-1 bg-white dark:bg-[#161920] border border-rose-200/80 dark:border-rose-900/50 hover:border-rose-400 rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between min-w-0"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-2 py-0.5 rounded-md shrink-0">
            {metrics.outOfStockCount > 0
              ? `${metrics.outOfStockCount} Out`
              : 'Restock'}
          </span>
        </div>

        <div className="mt-3 min-w-0">
          <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider block truncate">
            Stock Alerts
          </span>
          <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-heading mt-0.5 truncate">
            {formatNumber(metrics.lowStockCount + metrics.outOfStockCount)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 gap-1">
            <span className="truncate">Need restock</span>
            <ArrowRight className="w-3.5 h-3.5 text-rose-500 shrink-0 group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </div>
    </div>
  );
};
