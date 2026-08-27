// src/pages/dashboard/components/RevenueAnalyticsTab.tsx
import React, { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from 'recharts';
import { 
  ShoppingBag, 
  Clock, 
  FileText, 
  Download, 
  ArrowUpRight, 
  ArrowDownRight,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import type { 
  DashboardTab, 
  TimeRangeFilter, 
  RevenueTimelinePoint, 
  TopProductMetric, 
  AttendanceHourData, 
  BirReportItem,
  DashboardMetrics 
} from '../types';
import { formatPHP } from '../dashboardService';
import { ReportsExportModal } from './ReportsExportModal';

interface RevenueAnalyticsTabProps {
  metrics: DashboardMetrics;
  revenueTimeline: RevenueTimelinePoint[];
  topProducts: TopProductMetric[];
  attendanceHourly: AttendanceHourData[];
  birReportItems: BirReportItem[];
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  timeRange: TimeRangeFilter;
  onTimeRangeChange: (range: TimeRangeFilter) => void;
}

export const RevenueAnalyticsTab: React.FC<RevenueAnalyticsTabProps> = ({
  metrics,
  revenueTimeline,
  topProducts,
  attendanceHourly,
  birReportItems,
  activeTab,
  onTabChange,
  timeRange,
  onTimeRangeChange,
}) => {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<'bir' | 'sales' | 'attendance' | 'inventory' | 'subscriptions'>('bir');

  // Calculate percentage comparison vs last month / previous period
  const revenueGrowthPercent = metrics.lastMonthTotalRevenue > 0
    ? (((metrics.monthTotalRevenue - metrics.lastMonthTotalRevenue) / metrics.lastMonthTotalRevenue) * 100)
    : 0;

  const isPositiveGrowth = revenueGrowthPercent >= 0;

  // Colors for charts
  const THEME_BLUE = '#123c73';
  const THEME_GREEN = '#10b981';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
      {/* ─── BROWSER-TABBED HEADER BAR ─── */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 px-4 pt-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* TAB BUTTONS */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* TAB 1: COMBINED REVENUE */}
          <button
            id="tab-btn-combined"
            onClick={() => onTabChange('combined')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg text-xs font-semibold tracking-wide transition-all select-none border-t border-x relative ${
              activeTab === 'combined'
                ? 'bg-white dark:bg-slate-900 text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Combined Revenue</span>
            {activeTab === 'combined' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>

          {/* TAB 2: SALES & PRODUCTS */}
          <button
            id="tab-btn-sales"
            onClick={() => onTabChange('sales')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg text-xs font-semibold tracking-wide transition-all select-none border-t border-x relative ${
              activeTab === 'sales'
                ? 'bg-white dark:bg-slate-900 text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Sales & Most Sold Products</span>
            {activeTab === 'sales' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>

          {/* TAB 3: LOGBOOK & PEAK HOURS */}
          <button
            id="tab-btn-logbook"
            onClick={() => onTabChange('logbook')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg text-xs font-semibold tracking-wide transition-all select-none border-t border-x relative ${
              activeTab === 'logbook'
                ? 'bg-white dark:bg-slate-900 text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Logbook & Busiest Hours</span>
            {activeTab === 'logbook' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>

          {/* TAB 4: BIR & EXPORTABLE REPORTS */}
          <button
            id="tab-btn-reports"
            onClick={() => onTabChange('reports')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg text-xs font-semibold tracking-wide transition-all select-none border-t border-x relative ${
              activeTab === 'reports'
                ? 'bg-white dark:bg-slate-900 text-[#123c73] dark:text-blue-400 border-slate-200 dark:border-slate-800 border-b-transparent shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Reports & BIR</span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded-sm">
              CSV / PDF
            </span>
            {activeTab === 'reports' && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#123c73] dark:bg-blue-400 rounded-t-sm" />
            )}
          </button>
        </div>

        {/* TIME RANGE FILTER BUTTONS */}
        <div className="flex items-center gap-1 pb-2 md:pb-3 shrink-0">
          <span className="text-[11px] font-medium text-slate-500 mr-1 hidden sm:inline">Range:</span>
          {(['today', 'week', 'month', 'year'] as TimeRangeFilter[]).map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                timeRange === range
                  ? 'bg-[#123c73] text-white shadow-xs font-bold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TAB CONTENT CONTAINER ─── */}
      <div className="p-4 sm:p-6">
        {/* =========================================================
            TAB 1: COMBINED REVENUE & CHARTS
            ========================================================= */}
        {activeTab === 'combined' && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Revenue Stat Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Total Combined Revenue
                </span>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {formatPHP(metrics.monthTotalRevenue)}
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  {isPositiveGrowth ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center">
                      <ArrowUpRight className="w-3.5 h-3.5" /> +{revenueGrowthPercent.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center">
                      <ArrowDownRight className="w-3.5 h-3.5" /> {revenueGrowthPercent.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-slate-500">vs previous period</span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Product Sales (POS)
                </span>
                <div className="text-2xl font-black text-[#123c73] dark:text-blue-400 mt-1">
                  {formatPHP(metrics.todaySalesRevenue * 22)}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Inventory items, refreshments & gear
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Logbook & Subscriptions
                </span>
                <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                  {formatPHP(metrics.todayLogbookRevenue * 24)}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Walk-in guest passes & member plans
                </p>
              </div>
            </div>

            {/* Combined Revenue Chart */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase font-heading">
                    Revenue Velocity (Sales vs Logbook)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dual-stream telemetry tracking product receipts against gym access passes.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-xs bg-[#123c73]" />
                    <span className="text-slate-600 dark:text-slate-300">Product Sales</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-xs bg-[#10b981]" />
                    <span className="text-slate-600 dark:text-slate-300">Logbook / Memberships</span>
                  </div>
                </div>
              </div>

              <div className="h-[280px] sm:h-[320px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTimeline} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={THEME_BLUE} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={THEME_BLUE} stopOpacity={0.0}/>
                      </linearGradient>
                      <linearGradient id="colorLogbook" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={THEME_GREEN} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={THEME_GREEN} stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 11, fill: '#64748b' }} 
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#64748b' }} 
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                    />
                    <Tooltip 
                      formatter={(val: any, name: any) => [
                        formatPHP(Number(val)), 
                        name === 'salesRevenue' ? 'Product Sales' : 'Logbook / Subscriptions'
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '12px'
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
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: SALES & MOST SOLD PRODUCTS
            ========================================================= */}
        {activeTab === 'sales' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase font-heading">
                  Most Sold Out Products & Velocity
                </h3>
                <p className="text-xs text-slate-500">
                  Ranking top performing retail items by units sold and gross sales generation.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Product Bar Chart */}
              <div className="lg:col-span-2 space-y-3">
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={topProducts.slice(0, 5)} 
                      layout="vertical" 
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis 
                        dataKey="product_name" 
                        type="category" 
                        width={140} 
                        tick={{ fontSize: 11, fill: '#334155' }}
                        tickFormatter={(name) => name.length > 18 ? name.slice(0, 18) + '...' : name}
                      />
                      <Tooltip 
                        formatter={(val: any) => [`${val} units sold`, 'Volume']}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          color: '#f8fafc',
                          fontSize: '12px'
                        }}
                      />
                      <Bar dataKey="total_sold" fill="#123c73" radius={[0, 4, 4, 0]}>
                        {topProducts.slice(0, 5).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#123c73' : index === 1 ? '#2563eb' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Seller Ranked List */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/30">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3">
                  Leaderboard Rankings
                </h4>
                <div className="space-y-3">
                  {topProducts.slice(0, 4).map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={p.product_name}>
                            {p.product_name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {p.total_sold} units • {formatPHP(p.total_revenue)}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        p.status === 'Low Stock' 
                          ? 'bg-amber-100 text-amber-800' 
                          : p.status === 'Out of Stock' 
                          ? 'bg-rose-100 text-rose-800' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 3: LOGBOOK & BUSIEST HOURS
            ========================================================= */}
        {activeTab === 'logbook' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase font-heading">
                  Hourly Attendance & Busiest Times
                </h3>
                <p className="text-xs text-slate-500">
                  Gym foot-traffic distribution showing peak workout hours throughout the day.
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1 rounded-md text-xs font-semibold text-[#123c73] dark:text-blue-300">
                Peak Window: {metrics.peakHourLabel}
              </div>
            </div>

            <div className="h-[280px] sm:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceHourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip 
                    formatter={(val: any, name: any) => [
                      `${val} visits`, 
                      name === 'members' ? 'Registered Members' : 'Walk-In Guests'
                    ]}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '12px'
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    formatter={(value) => <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{value === 'members' ? 'Member Visits' : 'Walk-In Guests'}</span>}
                  />
                  <Bar dataKey="members" stackId="a" fill="#123c73" radius={[0, 0, 0, 0]} name="members" />
                  <Bar dataKey="walkIns" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} name="walkIns" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 4: EXPORTABLE REPORTS & BIR COMPLIANCE HUB
            ========================================================= */}
        {activeTab === 'reports' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white uppercase font-heading flex items-center gap-2">
                  Official Reports & Compliance Center
                  <span className="text-xs bg-blue-100 text-[#123c73] dark:bg-blue-900/60 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
                    BIR Ready
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Export structured business intelligence in formatted CSV (Excel style) or printable PDF reports.
                </p>
              </div>

              <button
                id="btn-open-export-hub"
                onClick={() => setIsExportModalOpen(true)}
                className="bg-[#123c73] hover:bg-[#0d2e5a] text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2 active:scale-95 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Export Reports Center</span>
              </button>
            </div>

            {/* Quick Report Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. BIR OFFICIAL SALES JOURNAL */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#123c73] transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                      BIR Tax Compliance
                    </span>
                    <FileText className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Official Sales & Receipts Journal
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Contains OR Numbers, Gross Sales, VAT-Exempt entries, and payment details for BIR book audit.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedReportType('bir');
                    setIsExportModalOpen(true);
                  }}
                  className="mt-4 w-full py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-[#123c73] hover:text-white text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Generate BIR Report</span>
                </button>
              </div>

              {/* 2. COMBINED REVENUE & POS REGISTER */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#123c73] transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                      Financial Summary
                    </span>
                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Product Sales & Inventory Log
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Itemized product movements, stock quantities sold, barcode tracking, and retail gross revenue.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedReportType('sales');
                    setIsExportModalOpen(true);
                  }}
                  className="mt-4 w-full py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-[#123c73] hover:text-white text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Generate Sales Report</span>
                </button>
              </div>

              {/* 3. ATTENDANCE & UTILIZATION LOG */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#123c73] transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded">
                      Operations Log
                    </span>
                    <Clock className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Attendance & Member Utilization
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Daily check-in logs, walk-in collection fees, member passes used, and counter staff names.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedReportType('attendance');
                    setIsExportModalOpen(true);
                  }}
                  className="mt-4 w-full py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-[#123c73] hover:text-white text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Generate Logbook Report</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reports Export Modal Portal */}
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
