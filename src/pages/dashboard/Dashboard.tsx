// src/pages/dashboard/Dashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  format 
} from 'date-fns';
import { 
  RotateCcw, 
  Calendar as CalendarIcon, 
  FileSpreadsheet 
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import type { 
  DashboardMetrics, 
  DashboardTab, 
  TimeRangeFilter, 
  RevenueTimelinePoint, 
  TopProductMetric, 
  AttendanceHourData, 
  ExpiringMemberItem, 
  LowStockProductItem, 
  ActivityFeedItem, 
  BirReportItem 
} from './types';
import { fetchDashboardData } from './dashboardService';
import { TopSummaryCards } from './components/TopSummaryCards';
import { QuickActions } from './components/QuickActions';
import { RevenueAnalyticsTab } from './components/RevenueAnalyticsTab';
import { MembershipOverviewSection } from './components/MembershipOverviewSection';
import { InventoryAlertsSection } from './components/InventoryAlertsSection';
import { RecentActivityFeed } from './components/RecentActivityFeed';
import { ReportsExportModal } from './components/ReportsExportModal';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // State Management
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('combined');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('month');
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);

  // Data States
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeMembersCount: 0,
    totalMembersCount: 0,
    todayAttendanceCount: 0,
    yesterdayAttendanceCount: 0,
    peakHourLabel: '5:00 PM - 7:00 PM',
    todayTotalRevenue: 0,
    yesterdayTotalRevenue: 0,
    todaySalesRevenue: 0,
    todayLogbookRevenue: 0,
    monthTotalRevenue: 0,
    lastMonthTotalRevenue: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    newMembersThisMonth: 0,
  });

  const [revenueTimeline, setRevenueTimeline] = useState<RevenueTimelinePoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductMetric[]>([]);
  const [attendanceHourly, setAttendanceHourly] = useState<AttendanceHourData[]>([]);
  const [expiringSoonList, setExpiringSoonList] = useState<ExpiringMemberItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockProductItem[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityFeedItem[]>([]);
  const [birReportItems, setBirReportItems] = useState<BirReportItem[]>([]);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchDashboardData(timeRange);
      setMetrics(data.metrics);
      setRevenueTimeline(data.revenueTimeline);
      setTopProducts(data.topProducts);
      setAttendanceHourly(data.attendanceHourly);
      setExpiringSoonList(data.expiringSoonList);
      setLowStockItems(data.lowStockItems);
      setActivityItems(data.activityItems);
      setBirReportItems(data.birReportItems);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime Supabase Subscription for live attendance and sales
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Quick Navigation Handler from Top Summary Cards
  const handleCardClick = (target: 'members' | 'attendance' | 'sales' | 'expiring' | 'inventory') => {
    switch (target) {
      case 'members':
        navigate('/members/list');
        break;
      case 'attendance':
        navigate('/logbook');
        break;
      case 'sales':
        navigate('/sales');
        break;
      case 'expiring':
        navigate('/members/list');
        break;
      case 'inventory':
        navigate('/sales/products');
        break;
    }
  };

  const currentDateFormatted = format(new Date(), 'EEEE, MMMM dd, yyyy');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto select-none animate-fade-in">
      {/* ─── HEADER / GREETING BAR ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase font-heading">
              Gym Operations Hub
            </h1>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 font-medium">
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{currentDateFormatted}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Logged in as {user?.email || 'Staff Member'}</span>
          </p>
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="btn-open-bir-reports"
            onClick={() => setIsReportsModalOpen(true)}
            className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Reports & BIR</span>
          </button>

          <button
            id="btn-refresh-dashboard"
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            title="Refresh Dashboard"
          >
            <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── 1. TOP SUMMARY CARDS (5 METRICS) ─── */}
      <TopSummaryCards metrics={metrics} onCardClick={handleCardClick} />

      {/* ─── 2. QUICK ACTIONS BAR ─── */}
      <QuickActions
        onScanClick={() => navigate('/scanner')}
        onNewSaleClick={() => navigate('/sales')}
        onAddMemberClick={() => navigate('/members/list')}
        onNewSubscriptionClick={() => navigate('/logbook')}
      />

      {/* ─── 3. BROWSER-TABBED REVENUE & OPERATIONS ANALYTICS ─── */}
      <RevenueAnalyticsTab
        metrics={metrics}
        revenueTimeline={revenueTimeline}
        topProducts={topProducts}
        attendanceHourly={attendanceHourly}
        birReportItems={birReportItems}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />

      {/* ─── 4. TWO-COLUMN SPLIT: MEMBERSHIPS / INVENTORY & RECENT ACTIVITY ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Membership Overview & Inventory Alerts */}
        <div className="lg:col-span-2 space-y-6">
          <MembershipOverviewSection
            metrics={metrics}
            expiringMembers={expiringSoonList}
            onRenewMember={() => navigate('/logbook')}
          />
          <InventoryAlertsSection
            lowStockItems={lowStockItems}
            onViewInventory={() => navigate('/sales/products')}
          />
        </div>

        {/* Right 1 Column: Real-time Chronological Activity Feed */}
        <div className="lg:col-span-1">
          <RecentActivityFeed
            activities={activityItems}
            onRefresh={loadData}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Reports Export Modal */}
      <ReportsExportModal
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        initialType="bir"
        birData={birReportItems}
        topProducts={topProducts}
        revenueTimeline={revenueTimeline}
      />
    </div>
  );
};
