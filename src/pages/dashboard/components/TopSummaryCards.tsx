// src/pages/dashboard/components/TopSummaryCards.tsx
import React from 'react';
import { Users, UserCheck, Banknote, Clock, AlertTriangle } from 'lucide-react';
import type { DashboardMetrics } from '../types';
import { formatPHP, formatNumber } from '../dashboardService';

interface TopSummaryCardsProps {
  metrics: DashboardMetrics;
  onCardClick?: (target: 'members' | 'attendance' | 'sales' | 'expiring' | 'inventory') => void;
}

export const TopSummaryCards: React.FC<TopSummaryCardsProps> = ({ metrics, onCardClick }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. ACTIVE MEMBERS */}
      <div 
        id="card-active-members"
        onClick={() => onCardClick?.('members')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs hover:border-[#123c73]/40 dark:hover:border-red-500/40 transition-all cursor-pointer flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Active Members
          </span>
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-[#123c73] dark:text-blue-400">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {formatNumber(metrics.activeMembersCount)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 font-medium">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              +{metrics.newMembersThisMonth} new
            </span>
            <span>this month</span>
          </p>
        </div>
      </div>

      {/* 2. TODAY'S ATTENDANCE */}
      <div 
        id="card-today-attendance"
        onClick={() => onCardClick?.('attendance')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs hover:border-[#123c73]/40 dark:hover:border-red-500/40 transition-all cursor-pointer flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Today's Attendance
          </span>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {formatNumber(metrics.todayAttendanceCount)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium truncate" title={metrics.peakHourLabel}>
            Peak: <span className="text-slate-700 dark:text-slate-300 font-semibold">{metrics.peakHourLabel}</span>
          </p>
        </div>
      </div>

      {/* 3. TODAY'S SALES / REVENUE */}
      <div 
        id="card-today-sales"
        onClick={() => onCardClick?.('sales')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs hover:border-[#123c73]/40 dark:hover:border-red-500/40 transition-all cursor-pointer flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Today's Revenue
          </span>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Banknote className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {formatPHP(metrics.todayTotalRevenue)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium truncate">
            POS: {formatPHP(metrics.todaySalesRevenue)} • Passes: {formatPHP(metrics.todayLogbookRevenue)}
          </p>
        </div>
      </div>

      {/* 4. MEMBERSHIPS EXPIRING SOON */}
      <div 
        id="card-expiring-soon"
        onClick={() => onCardClick?.('expiring')}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-5 shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
          metrics.expiringSoonCount > 0 
            ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10 hover:border-amber-400' 
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Expiring Soon
          </span>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            metrics.expiringSoonCount > 0 
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
          }`}>
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {formatNumber(metrics.expiringSoonCount)}
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">
            Within the next 7 days
          </p>
        </div>
      </div>

      {/* 5. LOW STOCK ITEMS */}
      <div 
        id="card-low-stock"
        onClick={() => onCardClick?.('inventory')}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-5 shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
          metrics.lowStockCount > 0 
            ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10 hover:border-rose-400' 
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Low Stock Alerts
          </span>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            metrics.lowStockCount > 0 
              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
          }`}>
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {formatNumber(metrics.lowStockCount)}
          </div>
          <p className="text-xs text-rose-700 dark:text-rose-400 mt-1 font-medium">
            {metrics.outOfStockCount > 0 ? `${metrics.outOfStockCount} out of stock` : 'Items need restocking'}
          </p>
        </div>
      </div>
    </div>
  );
};
