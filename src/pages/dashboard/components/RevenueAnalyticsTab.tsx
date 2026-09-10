import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  ShoppingBag,
  Clock,
  FileText,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  FileSpreadsheet,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart2,
  CreditCard,
  Calendar,
  Users,
  Frown,
} from 'lucide-react';
import type {
  DashboardTab,
  TimeRangeFilter,
  RevenueTimelinePoint,
  TopProductMetric,
  AttendanceHourData,
  BirReportItem,
  DashboardMetrics,
  SubscriptionPlanBreakdown,
} from '../types';
import { formatPHP } from '../dashboardService';
import { ReportsExportModal } from './ReportsExportModal';

interface RevenueAnalyticsTabProps {
  metrics: DashboardMetrics;
  revenueTimeline: RevenueTimelinePoint[];
  topProducts: TopProductMetric[];
  attendanceHourly: AttendanceHourData[];
  birReportItems: BirReportItem[];
  subscriptionBreakdown?: SubscriptionPlanBreakdown;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  timeRange: TimeRangeFilter;
  onTimeRangeChange: (range: TimeRangeFilter) => void;
}

/**
 * Empty state placeholder displaying a big frowning face
 * when no statistics or graph datapoints are available.
 */
const EmptyChartPlaceholder: React.FC<{
  title: string;
  description: string;
  className?: string;
}> = ({ title, description, className = 'h-[260px] sm:h-[300px]' }) => (
  <div
    className={`w-full flex flex-col items-center justify-center text-center p-6 sm:p-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1e232d]/30 select-none ${className}`}
  >
    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3.5 text-slate-400 dark:text-slate-500 shadow-inner">
      <Frown className="w-9 h-9 sm:w-11 sm:h-11 stroke-[1.5]" />
    </div>
    <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200">
      {title}
    </h4>
    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 leading-relaxed">
      {description}
    </p>
  </div>
);

export const RevenueAnalyticsTab: React.FC<RevenueAnalyticsTabProps> = ({
  metrics,
  revenueTimeline,
  topProducts,
  attendanceHourly,
  birReportItems,
  subscriptionBreakdown,
  activeTab,
  onTabChange,
  timeRange,
  onTimeRangeChange,
}) => {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<
    'bir' | 'sales' | 'attendance' | 'inventory' | 'subscriptions'
  >('bir');
  const [salesChartView, setSalesChartView] = useState<'pie' | 'bar'>('pie');
  const [logbookViewMode, setLogbookViewMode] = useState<
    'traffic' | 'subscriptions'
  >('traffic');
  const [subscriptionChartView, setSubscriptionChartView] = useState<
    'timeline' | 'distribution'
  >('timeline');

  const PIE_COLORS = [
    '#123c73',
    '#2563eb',
    '#38bdf8',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
  ];

  const pieProductData = useMemo(() => {
    const soldOnly = topProducts.filter((p) => (p.total_sold || 0) > 0);
    if (soldOnly.length === 0) {
      return [];
    }
    return soldOnly.slice(0, 6).map((p) => ({
      name: p.product_name,
      value: p.total_sold,
      revenue: p.total_revenue,
    }));
  }, [topProducts]);

  const rangeSalesRevenue = useMemo(() => {
    return revenueTimeline.reduce((acc, curr) => acc + curr.salesRevenue, 0);
  }, [revenueTimeline]);

  const rangeLogbookRevenue = useMemo(() => {
    return revenueTimeline.reduce((acc, curr) => acc + curr.logbookRevenue, 0);
  }, [revenueTimeline]);

  const rangeTotalRevenue = useMemo(() => {
    return revenueTimeline.reduce((acc, curr) => acc + curr.totalRevenue, 0);
  }, [revenueTimeline]);

  const rangeLabel = useMemo(() => {
    switch (timeRange) {
      case 'today':
        return "Today's";
      case 'week':
        return 'Past 7 Days';
      case 'year':
        return 'Past 12 Months';
      case 'month':
      default:
        return 'Past 30 Days';
    }
  }, [timeRange]);

  // ─── Data Availability Checks ───
  const hasCombinedData = useMemo(() => {
    return (
      revenueTimeline.length > 0 &&
      revenueTimeline.some(
        (pt) => (pt.salesRevenue || 0) > 0 || (pt.logbookRevenue || 0) > 0
      )
    );
  }, [revenueTimeline]);

  const hasSalesData = useMemo(() => {
    return (
      topProducts.length > 0 &&
      topProducts.some(
        (p) => (p.total_sold || 0) > 0 || (p.total_revenue || 0) > 0
      )
    );
  }, [topProducts]);

  const hasTrafficData = useMemo(() => {
    return (
      attendanceHourly.length > 0 &&
      attendanceHourly.some((h) => (h.members || 0) > 0 || (h.walkIns || 0) > 0)
    );
  }, [attendanceHourly]);

  const hasSubscriptionData = useMemo(() => {
    const totalSubs = subscriptionBreakdown?.totalSubscribers || 0;
    const timelineHasData =
      subscriptionBreakdown?.timeline &&
      subscriptionBreakdown.timeline.some(
        (t) => (t.monthly || 0) > 0 || (t.yearly || 0) > 0
      );
    return totalSubs > 0 || Boolean(timelineHasData);
  }, [subscriptionBreakdown]);

  const revenueGrowthPercent =
    metrics.lastMonthTotalRevenue > 0
      ? ((metrics.monthTotalRevenue - metrics.lastMonthTotalRevenue) /
          metrics.lastMonthTotalRevenue) *
        100
      : 0;

  const isPositiveGrowth = revenueGrowthPercent >= 0;

  const THEME_BLUE = '#123c73';
  const THEME_GREEN = '#10b981';

  return (
    <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden transition-all">
      {/* ─── ADAPTIVE BROWSER-TABBED HEADER BAR ─── */}
      <div className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/90 dark:bg-[#0c0e12]/60 px-3 sm:px-5 pt-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* TAB BUTTONS */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0 -mx-1 px-1">
          {/* TAB 1: COMBINED */}
          <button
            id="tab-btn-combined"
            onClick={() => onTabChange('combined')}
            className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-t-xl text-xs font-bold transition-all select-none border-t border-x shrink-0 relative cursor-pointer ${
              activeTab === 'combined'
                ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-2xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="sm:hidden">Combined</span>
            <span className="hidden sm:inline">Combined Revenue</span>
            {activeTab === 'combined' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>

          {/* TAB 2: SALES & PRODUCTS */}
          <button
            id="tab-btn-sales"
            onClick={() => onTabChange('sales')}
            className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-t-xl text-xs font-bold transition-all select-none border-t border-x shrink-0 relative cursor-pointer ${
              activeTab === 'sales'
                ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-2xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="sm:hidden">Products</span>
            <span className="hidden sm:inline">Sales & Top Products</span>
            {activeTab === 'sales' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>

          {/* TAB 3: LOGBOOK & PEAK */}
          <button
            id="tab-btn-logbook"
            onClick={() => onTabChange('logbook')}
            className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-t-xl text-xs font-bold transition-all select-none border-t border-x shrink-0 relative cursor-pointer ${
              activeTab === 'logbook'
                ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-2xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="sm:hidden">Traffic</span>
            <span className="hidden sm:inline">Logbook & Peak Times</span>
            {activeTab === 'logbook' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>

          {/* TAB 4: REPORTS & BIR */}
          <button
            id="tab-btn-reports"
            onClick={() => onTabChange('reports')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-t-xl text-xs font-bold transition-all select-none border-t border-x shrink-0 relative cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-2xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Reports & BIR</span>
            <span className="text-[9px] sm:text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold px-1.5 py-0.2 rounded-md">
              CSV/PDF
            </span>
            {activeTab === 'reports' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>
        </div>

        {/* TIME RANGE FILTER */}
        <div className="flex items-center bg-slate-200/60 dark:bg-[#1e232d] p-1 rounded-xl shrink-0 self-stretch sm:self-auto mb-2 md:mb-2.5">
          {(['today', 'week', 'month', 'year'] as TimeRangeFilter[]).map(
            (range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`flex-1 sm:flex-initial px-3 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                  timeRange === range
                    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {/* ─── TAB CONTENT BODY ─── */}
      <div className="p-4 sm:p-6">
        {/* =========================================================
            TAB 1: COMBINED REVENUE & VELOCITY
            ========================================================= */}
        {activeTab === 'combined' && (
          <div className="space-y-6">
            {/* Top 3 Revenue Split Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
              {/* Total Combined */}
              <div className="p-4 bg-slate-50 dark:bg-[#1e232d]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {rangeLabel} - Total Combined
                </span>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-heading mt-1">
                  {formatPHP(rangeTotalRevenue)}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-xs">
                  {isPositiveGrowth ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center">
                      <ArrowUpRight className="w-3.5 h-3.5" /> +
                      {revenueGrowthPercent.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold flex items-center">
                      <ArrowDownRight className="w-3.5 h-3.5" />{' '}
                      {revenueGrowthPercent.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                    monthly trend
                  </span>
                </div>
              </div>

              {/* Product POS Sales */}
              <div className="p-4 bg-slate-50 dark:bg-[#1e232d]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {rangeLabel} - SALES
                </span>
                <div className="text-2xl sm:text-3xl font-black text-[#123c73] dark:text-blue-400 font-heading mt-1">
                  {formatPHP(rangeSalesRevenue)}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2.5">
                  Product that has been sold
                </p>
              </div>

              {/* Passes & Subscriptions */}
              <div className="p-4 bg-slate-50 dark:bg-[#1e232d]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {rangeLabel} - Logbook
                </span>
                <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-heading mt-1">
                  {formatPHP(rangeLogbookRevenue)}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2.5">
                  Walk-in Guest, Memberships, and Passes
                </p>
              </div>
            </div>

            {/* Dual Stream Chart Area */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase font-heading">
                    Revenue Velocity Telemetry • {rangeLabel}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    Dual-stream tracking of product sales vs logbook revenue
                    over time.
                  </p>
                </div>

                {hasCombinedData && (
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-xs bg-[#123c73] dark:bg-blue-400" />
                      <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                        Product - Sales
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-xs bg-[#10b981]" />
                      <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                        Member - Logbook
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chart OR Empty Placeholder */}
              {!hasCombinedData ? (
                <EmptyChartPlaceholder
                  title="No Revenue Activity Recorded"
                  description={`There are no sales transactions or membership entries logged for ${rangeLabel.toLowerCase()}. Check back once activity is recorded.`}
                  className="h-[240px] sm:h-[300px] lg:h-[320px]"
                />
              ) : (
                <div className="h-[240px] sm:h-[300px] lg:h-[320px] w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={revenueTimeline}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorSales"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={THEME_BLUE}
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor={THEME_BLUE}
                            stopOpacity={0.0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorLogbook"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={THEME_GREEN}
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor={THEME_GREEN}
                            stopOpacity={0.0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#94a3b8"
                        strokeOpacity={0.2}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.2 }}
                        tickLine={false}
                      />
                      <YAxis
                        width={45}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) =>
                          `₱${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`
                        }
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [
                          formatPHP(Number(val)),
                          name === 'salesRevenue'
                            ? 'Product POS'
                            : 'Passes & Plans',
                        ]}
                        labelFormatter={(label) => `${label}`}
                        contentStyle={{
                          backgroundColor: '#161920',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#f8fafc',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="salesRevenue"
                        stroke={THEME_BLUE}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorSales)"
                        name="salesRevenue"
                      />
                      <Area
                        type="monotone"
                        dataKey="logbookRevenue"
                        stroke={THEME_GREEN}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorLogbook)"
                        name="logbookRevenue"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: SALES & MOST SOLD PRODUCTS
            ========================================================= */}
        {activeTab === 'sales' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase font-heading">
                  Most Sold Products ({rangeLabel})
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  Ranking retail items by total quantity sold, revenue share,
                  and gross sales generation.
                </p>
              </div>

              {/* Chart Format Toggle: Pie Chart vs Bar Chart */}
              {hasSalesData && (
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setSalesChartView('pie')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      salesChartView === 'pie'
                        ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <PieChartIcon className="w-3.5 h-3.5" />
                    <span>Pie Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesChartView('bar')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      salesChartView === 'bar'
                        ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Ranking Bar</span>
                  </button>
                </div>
              )}
            </div>

            {!hasSalesData ? (
              <EmptyChartPlaceholder
                title="No Product Sales Yet"
                description={`No products have been sold or logged for ${rangeLabel.toLowerCase()}. When POS sales occur, ranking breakdowns will appear here.`}
                className="h-[300px] sm:h-[340px]"
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Product Visual Chart (Pie or Bar) */}
                <div className="lg:col-span-2 space-y-3">
                  {salesChartView === 'pie' ? (
                    <div className="h-[280px] sm:h-[320px] w-full flex items-center justify-center p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieProductData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={95}
                            paddingAngle={4}
                            dataKey="value"
                            nameKey="name"
                          >
                            {pieProductData.map((_, index) => (
                              <Cell
                                key={`pie-cell-${index}`}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(val: any, name: any, item: any) => [
                              `${val} units sold (${formatPHP(item.payload.revenue || 0)})`,
                              name,
                            ]}
                            contentStyle={{
                              backgroundColor: '#161920',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={40}
                            iconType="circle"
                            formatter={(val) => (
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                {val.length > 18
                                  ? val.slice(0, 18) + '...'
                                  : val}
                              </span>
                            )}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[280px] sm:h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topProducts.slice(0, 5)}
                          layout="vertical"
                          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                            stroke="#94a3b8"
                            strokeOpacity={0.2}
                          />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            allowDecimals={false}
                          />
                          <YAxis
                            dataKey="product_name"
                            type="category"
                            width={100}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            tickFormatter={(name) =>
                              name.length > 14
                                ? name.slice(0, 14) + '...'
                                : name
                            }
                          />
                          <Tooltip
                            formatter={(val: any) => [
                              `${val} units sold`,
                              'Volume Sold',
                            ]}
                            contentStyle={{
                              backgroundColor: '#161920',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: 'bold',
                            }}
                          />
                          <Bar
                            dataKey="total_sold"
                            fill="#123c73"
                            radius={[0, 6, 6, 0]}
                          >
                            {topProducts.slice(0, 5).map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  index === 0
                                    ? '#123c73'
                                    : index === 1
                                      ? '#2563eb'
                                      : '#3b82f6'
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Top Seller Ranked List */}
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-[#1e232d]/40 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 mb-3 font-heading flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-[#123c73] dark:text-blue-400" />
                      Top Seller Leaderboard
                    </h4>
                    <div className="space-y-3">
                      {topProducts.slice(0, 4).map((p, idx) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60 dark:border-slate-800 last:border-0 last:pb-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                                idx === 0
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p
                                className="text-xs font-bold text-slate-900 dark:text-white truncate"
                                title={p.product_name}
                              >
                                {p.product_name}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                {p.total_sold} units •{' '}
                                {formatPHP(p.total_revenue)}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                              p.status === 'Low Stock'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : p.status === 'Out of Stock'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 3: LOGBOOK & PEAK TIMES + SUBSCRIPTION BREAKDOWN
            ========================================================= */}
        {activeTab === 'logbook' && (
          <div className="space-y-6">
            {/* Header & Sub-View Switcher Tab Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-slate-800">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase font-heading">
                  {logbookViewMode === 'traffic'
                    ? 'Hourly Attendance & Foot Traffic'
                    : 'Subscription Breakdown (Monthly vs Yearly)'}{' '}
                  ({rangeLabel})
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  {logbookViewMode === 'traffic'
                    ? 'Visitor distribution showing counter check-ins and peak gym hours.'
                    : 'Compare membership acquisition, subscriber counts, and revenue between Monthly and Yearly plans.'}
                </p>
              </div>

              {/* Option Tab Buttons */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  id="btn-logbook-traffic-view"
                  onClick={() => setLogbookViewMode('traffic')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    logbookViewMode === 'traffic'
                      ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Peak Times</span>
                </button>
                <button
                  type="button"
                  id="btn-logbook-subscriptions-view"
                  onClick={() => setLogbookViewMode('subscriptions')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    logbookViewMode === 'subscriptions'
                      ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Monthly vs Yearly</span>
                </button>
              </div>
            </div>

            {/* VIEW 1: HOURLY FOOT TRAFFIC & PEAK TIMES */}
            {logbookViewMode === 'traffic' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Hourly check-in volume aggregated by member type.
                  </div>
                  {hasTrafficData && (
                    <div className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1 rounded-xl text-xs font-bold text-[#123c73] dark:text-blue-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Peak Hour: {metrics.peakHourLabel}</span>
                    </div>
                  )}
                </div>

                {!hasTrafficData ? (
                  <EmptyChartPlaceholder
                    title="No Foot Traffic Recorded"
                    description={`No member or guest check-ins recorded for ${rangeLabel.toLowerCase()}. Turnstile or counter logs will plot peak hours here.`}
                    className="h-[260px] sm:h-[300px]"
                  />
                ) : (
                  <div className="h-[260px] sm:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={attendanceHourly}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#94a3b8"
                          strokeOpacity={0.2}
                        />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickFormatter={(val) => val.replace(':00', '')}
                        />
                        <YAxis
                          width={40}
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          allowDecimals={false}
                          domain={[0, 'auto']}
                        />
                        <Tooltip
                          formatter={(val: any, name: any) => [
                            `${val} visits`,
                            name === 'members'
                              ? 'Registered Members'
                              : 'Walk-In Guests',
                          ]}
                          labelFormatter={(label) => `${label}`}
                          contentStyle={{
                            backgroundColor: '#161920',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            color: '#f8fafc',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        />
                        <Bar
                          dataKey="members"
                          stackId="a"
                          fill="#123c73"
                          radius={[0, 0, 0, 0]}
                          name="members"
                        />
                        <Bar
                          dataKey="walkIns"
                          stackId="a"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                          name="walkIns"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 2: MONTHLY VS YEARLY SUBSCRIPTION BREAKDOWN CHART & STATS */}
            {logbookViewMode === 'subscriptions' && (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Total Subscribers */}
                  <div className="p-4 bg-slate-50 dark:bg-[#1e232d]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        New Subscriptions
                      </span>
                      <Users className="w-4 h-4 text-[#123c73] dark:text-blue-400" />
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-heading">
                        {subscriptionBreakdown?.totalSubscribers || 0}
                      </div>
                      <div className="text-[11px] font-bold text-[#123c73] dark:text-blue-400 mt-0.5">
                        {formatPHP(subscriptionBreakdown?.totalRevenue || 0)}{' '}
                        gross
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Total plan signups in {rangeLabel}
                    </p>
                  </div>

                  {/* Monthly Subscribers */}
                  <div className="p-4 bg-slate-50 dark:bg-[#1e232d]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        Monthly Plan
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-[#123c73] dark:bg-blue-950 dark:text-blue-300">
                        {subscriptionBreakdown?.monthlyPercentage || 0}% share
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl sm:text-3xl font-black text-[#123c73] dark:text-blue-400 font-heading">
                        {subscriptionBreakdown?.monthlyCount || 0}
                      </div>
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                        {formatPHP(subscriptionBreakdown?.monthlyRevenue || 0)}{' '}
                        revenue
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      {subscriptionBreakdown?.activeMonthlyCount || 0} currently
                      active contracts
                    </p>
                  </div>

                  {/* Yearly Subscribers */}
                  <div className="p-4 bg-slate-50 dark:bg-[#1e232d]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                        Yearly Plan
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {subscriptionBreakdown?.yearlyPercentage || 0}% share
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-heading">
                        {subscriptionBreakdown?.yearlyCount || 0}
                      </div>
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                        {formatPHP(subscriptionBreakdown?.yearlyRevenue || 0)}{' '}
                        revenue
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      {subscriptionBreakdown?.activeYearlyCount || 0} currently
                      active contracts
                    </p>
                  </div>

                  {/* Active Contract Pool */}
                  <div className="p-4 bg-slate-50 dark:bg-[#1e232d]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                        Active Contracts
                      </span>
                      <Calendar className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 font-heading">
                        {subscriptionBreakdown?.activeTotalCount ||
                          metrics.activeMembersCount ||
                          0}
                      </div>
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                        Active paying member pool
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Includes ongoing valid memberships
                    </p>
                  </div>
                </div>

                {/* Sub-Chart View Switcher: Bar Timeline vs Donut Distribution */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase font-heading">
                      Subscription Volume & Plan Ratio ({rangeLabel})
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Visual distribution of monthly renewals and annual
                      subscriptions.
                    </p>
                  </div>

                  {hasSubscriptionData && (
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 shrink-0 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setSubscriptionChartView('timeline')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          subscriptionChartView === 'timeline'
                            ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <BarChart2 className="w-3.5 h-3.5" />
                        <span>Timeline Bar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubscriptionChartView('distribution')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          subscriptionChartView === 'distribution'
                            ? 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <PieChartIcon className="w-3.5 h-3.5" />
                        <span>Donut Ratio</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Render Selected Chart Format OR Empty Placeholder */}
                {!hasSubscriptionData ? (
                  <EmptyChartPlaceholder
                    title="No Subscription Data"
                    description={`No monthly or yearly membership acquisitions were recorded for ${rangeLabel.toLowerCase()}.`}
                    className="h-[260px] sm:h-[300px]"
                  />
                ) : subscriptionChartView === 'timeline' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-end gap-4 text-xs font-bold">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-xs bg-[#123c73] dark:bg-blue-500" />
                        <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                          Monthly Subscriptions
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-xs bg-[#10b981]" />
                        <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                          Yearly Subscriptions
                        </span>
                      </div>
                    </div>

                    <div className="h-[260px] sm:h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={subscriptionBreakdown?.timeline || []}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#94a3b8"
                            strokeOpacity={0.2}
                          />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                          />
                          <YAxis
                            width={35}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            allowDecimals={false}
                            domain={[0, 'auto']}
                          />
                          <Tooltip
                            formatter={(val: any, name: any, item: any) => [
                              `${val} subscribers (${formatPHP(name === 'monthly' ? item.payload.monthlyRevenue : item.payload.yearlyRevenue)})`,
                              name === 'monthly'
                                ? 'Monthly Plan'
                                : 'Yearly Plan',
                            ]}
                            labelFormatter={(label) => `${label}`}
                            contentStyle={{
                              backgroundColor: '#161920',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: 'bold',
                            }}
                          />
                          <Bar
                            dataKey="monthly"
                            fill="#123c73"
                            radius={[0, 0, 0, 0]}
                            name="monthly"
                          />
                          <Bar
                            dataKey="yearly"
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                            name="yearly"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="h-[260px] sm:h-[280px] w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              {
                                name: 'Monthly Membership',
                                value: subscriptionBreakdown?.monthlyCount || 1,
                                revenue:
                                  subscriptionBreakdown?.monthlyRevenue || 0,
                                color: '#123c73',
                              },
                              {
                                name: 'Yearly Membership',
                                value: subscriptionBreakdown?.yearlyCount || 1,
                                revenue:
                                  subscriptionBreakdown?.yearlyRevenue || 0,
                                color: '#10b981',
                              },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            nameKey="name"
                          >
                            <Cell fill="#123c73" />
                            <Cell fill="#10b981" />
                          </Pie>
                          <Tooltip
                            formatter={(val: any, name: any, item: any) => [
                              `${val} members (${formatPHP(item.payload.revenue)})`,
                              name,
                            ]}
                            contentStyle={{
                              backgroundColor: '#161920',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: 'bold',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Ratio Breakdown Highlights */}
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1e232d]/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-3.5 h-3.5 rounded-full bg-[#123c73] shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              Monthly Memberships
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Standard flexible monthly access
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-slate-900 dark:text-white font-heading">
                            {subscriptionBreakdown?.monthlyPercentage || 0}%
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            {subscriptionBreakdown?.monthlyCount || 0} signups
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1e232d]/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-3.5 h-3.5 rounded-full bg-[#10b981] shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              Yearly Memberships
                            </div>
                            <div className="text-[10px] text-slate-500">
                              High-retention 365-day pass
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-heading">
                            {subscriptionBreakdown?.yearlyPercentage || 0}%
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            {subscriptionBreakdown?.yearlyCount || 0} signups
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 4: EXPORTABLE REPORTS & BIR COMPLIANCE HUB
            ========================================================= */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase font-heading flex items-center gap-2">
                  Official Reports & BIR Center
                  <span className="text-[10px] bg-blue-100 text-[#123c73] dark:bg-blue-900/60 dark:text-blue-300 px-2 py-0.5 rounded-full font-extrabold">
                    BIR Ready
                  </span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Generate official sales journals, inventory logs, and
                  subscription reports for BIR compliance and internal audits.
                </p>
              </div>

              <button
                id="btn-open-export-hub"
                onClick={() => {
                  setSelectedReportType('bir');
                  setIsExportModalOpen(true);
                }}
                className="bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Open Full Export Center</span>
              </button>
            </div>

            {/* Quick Report Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
              {/* 1. BIR REPORT */}
              <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161920] hover:border-[#123c73] dark:hover:border-blue-500 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                      BIR Tax Compliance
                    </span>
                    <FileText className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Official Sales & Receipts Journal
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    OR Numbers, Gross Sales, VAT-Exempt entries, and payment
                    details for BIR book audit.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedReportType('bir');
                    setIsExportModalOpen(true);
                  }}
                  className="mt-4 w-full py-2 bg-slate-100 dark:bg-[#1e232d] hover:bg-[#123c73] hover:text-white dark:hover:bg-[#bf0202] text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Generate BIR Journal</span>
                </button>
              </div>

              {/* 2. SALES REPORT */}
              <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161920] hover:border-[#123c73] dark:hover:border-blue-500 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                      Inventory Sales
                    </span>
                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Product Movement & Retail Log
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Itemized sales receipts, quantity sold, stock movements, and
                    gross profit generation.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedReportType('sales');
                    setIsExportModalOpen(true);
                  }}
                  className="mt-4 w-full py-2 bg-slate-100 dark:bg-[#1e232d] hover:bg-[#123c73] hover:text-white dark:hover:bg-[#bf0202] text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Generate Sales Log</span>
                </button>
              </div>

              {/* 3. LOGBOOK REPORT */}
              <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161920] hover:border-[#123c73] dark:hover:border-blue-500 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded">
                      Logbook Registry
                    </span>
                    <Clock className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Attendance & Member Utilization
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Daily check-in logs, walk-in admission fees, pass
                    redemptions, and staff signatures.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedReportType('attendance');
                    setIsExportModalOpen(true);
                  }}
                  className="mt-4 w-full py-2 bg-slate-100 dark:bg-[#1e232d] hover:bg-[#123c73] hover:text-white dark:hover:bg-[#bf0202] text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Generate Access Log</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reports Export Modal */}
      <ReportsExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        initialType={selectedReportType}
        birData={birReportItems}
        topProducts={topProducts}
        revenueTimeline={revenueTimeline}
      />
    </div>
  );
};
