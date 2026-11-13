import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  RotateCcw,
  Calendar as CalendarIcon,
  FileSpreadsheet,
  Dumbbell,
  WifiOff,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { supabase } from '../../lib/supabase/client';
import { useBatterySaver } from '../../hooks/useBatterySaver';
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
  BirReportItem,
  SubscriptionPlanBreakdown,
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
  const { isBatterySaver } = useBatterySaver();
  const { loadActiveSession } = useCashSessionStore();

  // State Management
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('combined');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('month');
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);

  // Pull-to-refresh state for Dashboard cards container
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);

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

  const [revenueTimeline, setRevenueTimeline] = useState<
    RevenueTimelinePoint[]
  >([]);
  const [topProducts, setTopProducts] = useState<TopProductMetric[]>([]);
  const [attendanceHourly, setAttendanceHourly] = useState<
    AttendanceHourData[]
  >([]);
  const [expiringSoonList, setExpiringSoonList] = useState<
    ExpiringMemberItem[]
  >([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockProductItem[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityFeedItem[]>([]);
  const [birReportItems, setBirReportItems] = useState<BirReportItem[]>([]);
  const [subscriptionBreakdown, setSubscriptionBreakdown] = useState<
    SubscriptionPlanBreakdown | undefined
  >(undefined);

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
      setSubscriptionBreakdown(data.subscriptionBreakdown);
} catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
      setHasInitialLoaded(true);
    }
  }, [timeRange]);

  // Unified Refresh: Re-validates cash session and updates all Supabase data
  const handleRefreshDashboard = useCallback(async () => {
    if (isOffline) return;
    try {
      setIsLoading(true);
      await Promise.allSettled([
        loadActiveSession(),
        loadData(),
      ]);
    } catch (error) {
      console.error('Failed to re-validate session and refresh dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isOffline, loadActiveSession, loadData]);

  // Pull-to-refresh touch handlers for Dashboard cards container
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 15 && !isPullRefreshing && !isLoading && !isOffline) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || isPullRefreshing || isLoading || isOffline) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;
    if (deltaY > 0 && window.scrollY <= 15) {
      // Elastic rubber-band resistance
      const distance = Math.min(Math.pow(deltaY, 0.82) * 1.8, 80);
      setPullDistance(distance);
    } else if (deltaY <= 0) {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (touchStartY.current === null) return;
    touchStartY.current = null;
    if (pullDistance >= 48 && !isPullRefreshing && !isOffline) {
      setIsPullRefreshing(true);
      setPullDistance(48); // Pin during re-validation & refresh
      await handleRefreshDashboard();
      setIsPullRefreshing(false);
      setPullDistance(0);
    } else {
      setPullDistance(0);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

// Realtime Supabase Subscription with Debounce
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoadData = () => {
      if (isBatterySaver && document.hidden) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(
        () => {
          loadData();
        },
        isBatterySaver ? 10000 : 1500
      );
    };

    const channel = supabase
      .channel('dashboard-realtime-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        scheduleLoadData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        scheduleLoadData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        scheduleLoadData
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadData, isBatterySaver]);

  // Quick Navigation Handler
  const handleCardClick = (
    target: 'members' | 'attendance' | 'sales' | 'expiring' | 'inventory'
  ) => {
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
    <div className="min-h-screen text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Container with responsive bottom padding to clear mobile navigation bars */}
      <div className="p-3.5 sm:p-5 lg:p-7 pb-28 sm:pb-20 lg:pb-12 space-y-4 sm:space-y-6 max-w-7xl mx-auto select-none">
        {/* ─── HEADER / GREETING BAR ─── */}
        <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-(--color-primary) text-white flex items-center justify-center shadow-xs">
                <Dumbbell className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight uppercase font-heading text-slate-900 dark:text-white truncate">
                GYM Analytics Dashboard
              </h1>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap font-medium">
              <span className="flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>{currentDateFormatted}</span>
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">
                •
              </span>
              <span className="truncate">
                Logged In Email:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {user?.email || 'Active Staff'}
                </span>
              </span>
            </p>
          </div>

        {/* Quick Toolbar */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            {isOffline && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold">
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span>Offline Telemetry</span>
              </span>
            )}

            <button
              id="btn-open-bir-reports"
              onClick={() => setIsReportsModalOpen(true)}
              className="flex-1 sm:flex-none justify-center bg-white dark:bg-[#1e232d] hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Export & BIR</span>
            </button>

            <button
              id="btn-refresh-dashboard"
              onClick={handleRefreshDashboard}
              disabled={isLoading || isOffline}
              className={`p-2.5 rounded-xl border transition-all shadow-2xs ${
                isOffline
                  ? 'bg-slate-100 dark:bg-zinc-800/50 text-slate-400 border-slate-200 dark:border-zinc-700/50 opacity-50 cursor-not-allowed'
                  : 'bg-white dark:bg-[#1e232d] border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/60 active:scale-95 disabled:opacity-60 cursor-pointer'
              }`}
              title={isOffline ? 'Offline - Refresh disabled' : 'Re-validate session & refresh telemetry'}
              aria-label="Refresh dashboard data and session"
            >
              <RotateCcw
                className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* ─── 1. TOP SUMMARY CARDS CONTAINER (WITH PULL-TO-REFRESH & SKELETON PLACEHOLDERS) ─── */}
        <div
          className="relative touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Animated Pull-To-Refresh Indicator */}
          {(pullDistance > 0 || isPullRefreshing) && (
            <div
              className="overflow-hidden transition-[height,opacity] duration-150 flex justify-center items-center py-1 select-none"
              style={{
                height: `${Math.max(pullDistance, isPullRefreshing ? 48 : 0)}px`,
                opacity: Math.min(pullDistance / 35, 1),
              }}
            >
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#161920] border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs">
                <RotateCcw
                  className={`w-3.5 h-3.5 ${
                    isPullRefreshing || isLoading
                      ? 'animate-spin text-[#123c73] dark:text-blue-400'
                      : 'text-slate-500 transition-transform duration-100'
                  }`}
                  style={{
                    transform:
                      !isPullRefreshing && !isLoading
                        ? `rotate(${Math.min(pullDistance * 4, 360)}deg)`
                        : undefined,
                  }}
                />
                <span>
                  {isPullRefreshing || isLoading
                    ? 'Re-validating session & refreshing...'
                    : pullDistance >= 48
                    ? 'Release to refresh'
                    : 'Pull down to refresh'}
                </span>
              </div>
            </div>
          )}

          <TopSummaryCards
            metrics={metrics}
            isLoading={isLoading || !hasInitialLoaded}
            onCardClick={handleCardClick}
          />
        </div>

        {/* ─── 2. QUICK ACTIONS BAR (HIDDEN ON MOBILE TO PREVENT LONG SCROLLING) ─── */}
        <div className="hidden sm:block">
          <QuickActions
            onScanClick={() => navigate('/scanner')}
            onNewSaleClick={() => navigate('/sales')}
            onAddMemberClick={() => navigate('/members/list')}
            onNewSubscriptionClick={() => navigate('/logbook')}
          />
        </div>

        {/* ─── 3. REVENUE & OPERATIONS ANALYTICS ─── */}
        <RevenueAnalyticsTab
          metrics={metrics}
          revenueTimeline={revenueTimeline}
          topProducts={topProducts}
          attendanceHourly={attendanceHourly}
          birReportItems={birReportItems}
          subscriptionBreakdown={subscriptionBreakdown}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />

        {/* ─── 4. TWO-COLUMN SPLIT: MEMBERSHIPS / INVENTORY & ACTIVITY FEED ─── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column (Span 2 on Desktop): Membership Overview & Inventory Alerts */}
          <div className="xl:col-span-2 space-y-4 sm:space-y-6">
            <MembershipOverviewSection
              metrics={metrics}
              expiringMembers={expiringSoonList}
              onRenewMember={(member) => {
                navigate(
                  `/members/list?renewMemberId=${encodeURIComponent(member.member_id)}&memberName=${encodeURIComponent(member.full_name)}`,
                  {
                    state: {
                      renewMemberId: member.member_id,
                      memberName: member.full_name,
                      triggerRenew: true,
                    },
                  }
                );
              }}
            />
            <InventoryAlertsSection
              lowStockItems={lowStockItems}
              onViewInventory={() => navigate('/sales/products')}
            />
          </div>

          {/* Right Column (Span 1 on Desktop): Real-time Chronological Activity Feed */}
          <div className="xl:col-span-1">
            <RecentActivityFeed
              activities={activityItems}
              onRefresh={loadData}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Reports Export Modal Portal */}
        <ReportsExportModal
          isOpen={isReportsModalOpen}
          onClose={() => setIsReportsModalOpen(false)}
          initialType="bir"
          birData={birReportItems}
          topProducts={topProducts}
          revenueTimeline={revenueTimeline}
        />
      </div>
    </div>
  );
};
