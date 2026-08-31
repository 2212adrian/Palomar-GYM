// src/pages/dashboard/types.ts

export type TimeRangeFilter = 'today' | 'week' | 'month' | 'year' | 'custom';

export type DashboardTab = 'combined' | 'sales' | 'logbook' | 'reports';

export interface DashboardMetrics {
  activeMembersCount: number;
  totalMembersCount: number;
  todayAttendanceCount: number;
  yesterdayAttendanceCount: number;
  peakHourLabel: string;
  todayTotalRevenue: number;
  yesterdayTotalRevenue: number;
  todaySalesRevenue: number;
  todayLogbookRevenue: number;
  monthTotalRevenue: number;
  lastMonthTotalRevenue: number;
  expiringSoonCount: number;
  expiredCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  newMembersThisMonth: number;
}

export interface AttendanceHourData {
  hour: string; // e.g. "6 AM", "7 AM", etc.
  visits: number;
  walkIns: number;
  members: number;
}

export interface RevenueTimelinePoint {
  date: string; // "2026-08-27" or "08/27" or "Mon"
  label: string;
  salesRevenue: number;
  logbookRevenue: number;
  totalRevenue: number;
  transactionsCount: number;
}

export interface TopProductMetric {
  id: string;
  product_name: string;
  barcode_id: string;
  selling_price: number;
  total_sold: number;
  total_revenue: number;
  current_stock: number;
  low_stock_alert: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

export interface ExpiringMemberItem {
  id: string;
  member_id: string;
  full_name: string;
  phone: string;
  plan_type: string;
  end_date: string;
  daysRemaining: number;
  status: 'Active' | 'Expiring' | 'Expired';
  subscriptionCount?: number;
  activeSubscriptionsCount?: number;
}

export interface SubscriptionBreakdownPoint {
  date: string;
  label: string;
  monthly: number;
  yearly: number;
  total: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
}

export interface SubscriptionPlanBreakdown {
  monthlyCount: number;
  yearlyCount: number;
  otherCount: number;
  totalSubscribers: number;
  activeMonthlyCount: number;
  activeYearlyCount: number;
  activeTotalCount: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  totalRevenue: number;
  monthlyPercentage: number;
  yearlyPercentage: number;
  timeline: SubscriptionBreakdownPoint[];
}

export interface LowStockProductItem {
  id: string;
  barcode_id: string;
  product_name: string;
  stock_quantity: number;
  low_stock_alert: number;
  selling_price: number;
  has_stock_limit: boolean;
}

export interface ActivityFeedItem {
  id: string;
  type: 'checkin' | 'sale' | 'membership_new' | 'membership_renew' | 'report';
  title: string;
  subtitle: string;
  amount?: number;
  timestamp: string; // ISO string
  badgeText: string;
  badgeVariant: 'primary' | 'success' | 'warning' | 'info' | 'purple';
}

export interface BirReportItem {
  receipt_no: string;
  date: string;
  customer_name: string;
  tin_number?: string;
  transaction_type: 'Product Sale' | 'Gym Subscription' | 'Walk-In Entry';
  gross_sales: number;
  vat_exempt_sales: number;
  vatable_sales: number;
  vat_amount: number;
  net_sales: number;
  payment_method: string;
  payment_ref?: string;
  status: 'Valid' | 'Voided';
}
