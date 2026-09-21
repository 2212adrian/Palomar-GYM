// src/pages/dashboard/dashboardService.ts
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  parseISO,
  differenceInDays,
  isSameDay,
} from 'date-fns';
import { supabase } from '../../lib/supabase/client';
import type {
  DashboardMetrics,
  AttendanceHourData,
  RevenueTimelinePoint,
  TopProductMetric,
  ExpiringMemberItem,
  LowStockProductItem,
  ActivityFeedItem,
  BirReportItem,
  TimeRangeFilter,
  SubscriptionPlanBreakdown,
  SubscriptionBreakdownPoint,
} from './types';

export const formatPHP = (amount: number): string => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

export const formatNumber = (val: number): string => {
  return new Intl.NumberFormat('en-PH').format(val || 0);
};

// Helper: Determine if a receipt record is for a physical or RFID card
const isCardReceipt = (r: any): boolean => {
  const type = String(r.receipt_type || r.customer_type || '').toLowerCase();
  const desc = String(
    r.item_description || r.category_or_plan || r.plan_name || ''
  ).toLowerCase();
  return (
    type === 'card' ||
    type.includes('card') ||
    desc.includes('card')
  );
};

// Helper: Extract total fee from attendance (accounting for card_fee & amount_paid)
const getAttendanceFee = (a: any): number => {
  const entryFee = Number(a.entry_fee || 0);
  const amountPaid = Number(a.amount_paid || 0);
  const cardFee = Number(a.card_fee || 0);

  if (amountPaid > 0) return amountPaid;
  return entryFee + cardFee;
};

// Helper: Extract total fee from card / receipts
const getReceiptFee = (r: any): number => {
  return Number(r.amount || r.amount_paid || r.total_amount || r.card_fee || 0);
};

export async function fetchDashboardData(timeRange: TimeRangeFilter = 'month') {
  const now = new Date();
  const nowMs = now.getTime();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterdayStart = startOfDay(subDays(now, 1));
  const yesterdayEnd = endOfDay(subDays(now, 1));
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  let rangeStartDate: Date;
  switch (timeRange) {
    case 'today':
      rangeStartDate = startOfDay(now);
      break;
    case 'week':
      rangeStartDate = subDays(now, 7);
      break;
    case 'year':
      rangeStartDate = subDays(now, 365);
      break;
    case 'month':
    default:
      rangeStartDate = subDays(now, 30);
      break;
  }

  try {
    const [
      membersRes,
      attendanceRes,
      salesRes,
      productsRes,
      subscriptionsRes,
      receiptsRes,
    ] = await Promise.all([
      supabase
        .from('members')
        .select('id, member_id, status, created_at')
        .is('deleted_at', null),
      supabase
        .from('attendance')
        .select(
          'id, check_in_time, entry_fee, base_price, gcash_fee, card_fee, receipt_number, customer_type, customer_name, plan_name, payment_method, gcash_ref_no, deleted_at, member_id'
        )
        .is('deleted_at', null)
        .order('check_in_time', { ascending: false })
        .limit(1500),
      supabase
        .from('sales')
        .select(
          'id, receipt_no, items, product_name, payment_method, amount_received, change_calculated, total_amount, reference_number, created_at, deleted_at, cash_session_id, gcash_fee_applied'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1500),
      supabase
        .from('products')
        .select(
          'id, barcode_id, product_name, image_url, selling_price, has_stock_limit, stock_quantity, low_stock_alert, status, created_at'
        )
        .is('deleted_at', null),
      supabase
        .from('subscriptions')
        .select(
          'id, member_id, plan_type, price, start_date, end_date, created_at, receipt_number, status, payment_status, voided_at, payment_method, gcash_ref_no, members(full_name, phone)'
        )
        .is('voided_at', null)
        .order('created_at', { ascending: false })
        .limit(1500),
      supabase
        .from('receipts')
        .select(
          'id, member_id, customer_name, customer_type, amount, base_price, gcash_fee, card_fee, gcash_ref_no, payment_method, payment_status, item_description, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(1500),
    ]);

    const members = membersRes.data || [];
    const attendance = attendanceRes.data || [];
    const sales = salesRes.data || [];
    const products = productsRes.data || [];
    const subscriptions = subscriptionsRes.data || [];
    const receipts = receiptsRes.data || [];

    // Filter standalone card receipts (avoid duplicate counting with attendance & subscriptions)
    const attendanceReceiptNos = new Set(
      attendance
        .map((a) => String(a.receipt_number || a.id || ''))
        .filter(Boolean)
    );
    const subscriptionReceiptNos = new Set(
      subscriptions
        .map((s) => String(s.receipt_number || s.id || ''))
        .filter(Boolean)
    );

    const standaloneCardReceipts = receipts.filter((r) => {
      if (r.payment_status && r.payment_status !== 'Paid') return false;

      const rId = String(r.id || '');
      if (attendanceReceiptNos.has(rId) || subscriptionReceiptNos.has(rId)) {
        return false;
      }

      return (
        isCardReceipt(r) ||
        r.customer_type === 'Card'
      );
    });

    // --- Metrics (strictly driven by real database records) ---
    const activeMembersCount = members.filter((m) => m.status === 'Active').length;
    const totalMembersCount = members.length;

    const todayAttendanceList = attendance.filter((a) => {
      const d = new Date(a.check_in_time);
      return d >= todayStart && d <= todayEnd;
    });
    const todayAttendanceCount = todayAttendanceList.length;

    const yesterdayAttendanceList = attendance.filter((a) => {
      const d = new Date(a.check_in_time);
      return d >= yesterdayStart && d <= yesterdayEnd;
    });
    const yesterdayAttendanceCount = yesterdayAttendanceList.length;

    const todaySalesList = sales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= todayStart && d <= todayEnd;
    });
    const todaySalesRevenue = todaySalesList.reduce(
      (acc, s) => acc + Number(s.total_amount || 0),
      0
    );

    const todaySubsList = subscriptions.filter((sub) => {
      const d = new Date(sub.created_at);
      return d >= todayStart && d <= todayEnd;
    });
    const todaySubsRevenue = todaySubsList.reduce(
      (acc, sub) => acc + Number(sub.price || 0),
      0
    );

    const todayCardList = standaloneCardReceipts.filter((r) => {
      const d = new Date(r.created_at);
      return d >= todayStart && d <= todayEnd;
    });
    const todayCardRevenue = todayCardList.reduce(
      (acc, r) => acc + getReceiptFee(r),
      0
    );

    const todayAttendanceRev = todayAttendanceList.reduce(
      (acc, a) => acc + getAttendanceFee(a),
      0
    );

    // Combines Walk-ins, Subscriptions, and Physical Card purchases to align with Logbook
    const todayLogbookRevenue =
      todayAttendanceRev + todaySubsRevenue + todayCardRevenue;

    const todayTotalRevenue = todaySalesRevenue + todayLogbookRevenue;

    const yesterdaySalesList = sales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= yesterdayStart && d <= yesterdayEnd;
    });
    const yesterdaySalesRevenue = yesterdaySalesList.reduce(
      (acc, s) => acc + Number(s.total_amount || 0),
      0
    );

    const yesterdaySubsList = subscriptions.filter((sub) => {
      const d = new Date(sub.created_at);
      return d >= yesterdayStart && d <= yesterdayEnd;
    });
    const yesterdayCardList = standaloneCardReceipts.filter((r) => {
      const d = new Date(r.created_at);
      return d >= yesterdayStart && d <= yesterdayEnd;
    });

    const yesterdayLogbookRevenue =
      yesterdayAttendanceList.reduce(
        (acc, a) => acc + getAttendanceFee(a),
        0
      ) +
      yesterdaySubsList.reduce(
        (acc, sub) => acc + Number(sub.price || 0),
        0
      ) +
      yesterdayCardList.reduce((acc, r) => acc + getReceiptFee(r), 0);

    const yesterdayTotalRevenue =
      yesterdaySalesRevenue + yesterdayLogbookRevenue;

    const monthSales = sales
      .filter((s) => {
        const d = new Date(s.created_at);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);

    const monthAttendance = attendance
      .filter((a) => {
        const d = new Date(a.check_in_time);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((acc, a) => acc + getAttendanceFee(a), 0);

    const monthSubs = subscriptions
      .filter((sub) => {
        const d = new Date(sub.created_at);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((acc, sub) => acc + Number(sub.price || 0), 0);

    const monthCards = standaloneCardReceipts
      .filter((r) => {
        const d = new Date(r.created_at);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((acc, r) => acc + getReceiptFee(r), 0);

    const monthTotalRevenue =
      monthSales + monthAttendance + monthSubs + monthCards;

    // Previous month total calculated from actual records
    const lastMonthStart = startOfMonth(subDays(monthStart, 1));
    const lastMonthEnd = endOfMonth(subDays(monthStart, 1));
    const prevMonthSales = sales
      .filter((s) => {
        const d = new Date(s.created_at);
        return d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
    const prevMonthAttendance = attendance
      .filter((a) => {
        const d = new Date(a.check_in_time);
        return d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((acc, a) => acc + getAttendanceFee(a), 0);
    const prevMonthSubs = subscriptions
      .filter((sub) => {
        const d = new Date(sub.created_at);
        return d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((acc, sub) => acc + Number(sub.price || 0), 0);
    const prevMonthCards = standaloneCardReceipts
      .filter((r) => {
        const d = new Date(r.created_at);
        return d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((acc, r) => acc + getReceiptFee(r), 0);
    const lastMonthTotalRevenue =
      prevMonthSales + prevMonthAttendance + prevMonthSubs + prevMonthCards;

    // --- Expiring Memberships & Expired Count (With 7-Day Rule Applied) ---
    const expiringSoonList: ExpiringMemberItem[] = [];
    const processedExpiringMemberIds = new Set<string>();
    let expiredCount = 0;

    // Group valid subscriptions by member_id
    const subsByMember = new Map<string, any[]>();
    subscriptions.forEach((sub) => {
      if (sub.voided_at || sub.status === 'Voided' || !sub.member_id) return;
      if (!subsByMember.has(sub.member_id)) {
        subsByMember.set(sub.member_id, []);
      }
      subsByMember.get(sub.member_id)!.push(sub);
    });

    // Evaluate each member once
    subsByMember.forEach((memberSubs) => {
      // Sort newest to oldest
      memberSubs.sort((a, b) => {
        const timeA = new Date(a.end_date || a.created_at).getTime();
        const timeB = new Date(b.end_date || b.created_at).getTime();
        return timeB - timeA;
      });

      // Find active subscriptions
      const activeSubs = memberSubs.filter((s) => {
        if (!s.end_date) return false;
        const startMs = new Date(s.start_date || s.created_at).getTime();
        const endMs = new Date(s.end_date).getTime();
        return startMs <= nowMs && endMs >= nowMs;
      });

      // 1. Expiring soon: Active subscriptions expiring in 0-7 days
      activeSubs.forEach((sub) => {
        if (!sub.end_date) return;
        const end = parseISO(sub.end_date);
        const diff = differenceInDays(end, now);

        if (diff >= 0 && diff <= 7 && !processedExpiringMemberIds.has(sub.member_id)) {
          processedExpiringMemberIds.add(sub.member_id);
          const memberObj: any = Array.isArray(sub.members) ? sub.members[0] : sub.members;
          const memberName = memberObj?.full_name || sub.member_id || 'Member';
          const memberPhone = memberObj?.phone || 'N/A';

          expiringSoonList.push({
            id: sub.id,
            member_id: sub.member_id,
            full_name: memberName,
            phone: memberPhone,
            plan_type: sub.plan_type
              ? `${sub.plan_type.toUpperCase()} PLAN`
              : 'MONTHLY PASS',
            end_date: format(end, 'MMM dd, yyyy'),
            daysRemaining: diff,
            status: 'Expiring',
            subscriptionCount: memberSubs.length,
            activeSubscriptionsCount: activeSubs.length,
          });
        }
      });

      // 2. Expired: Has NO active subscription, and latest subscription ended <= 7 days ago
      if (activeSubs.length === 0) {
        const latestSub = memberSubs[0];
        if (latestSub && latestSub.end_date) {
          const endMs = new Date(latestSub.end_date).getTime();
          if (!isNaN(endMs) && endMs < nowMs) {
            const daysSinceExpired = Math.floor((nowMs - endMs) / (1000 * 60 * 60 * 24));
            // Only count as Expired if 7 days or less have elapsed
            if (daysSinceExpired <= 7) {
              expiredCount++;
            }
          }
        }
      }
    });

    const expiringSoonCount = expiringSoonList.length;

    // Inventory Alerts (FILTER: Only Active products)
    const lowStockItems: LowStockProductItem[] = [];
    let outOfStockCount = 0;

    products.forEach((p) => {
      if (p.status !== 'Active') return;

      const stock = Number(p.stock_quantity || 0);
      const threshold = Number(p.low_stock_alert ?? 5);

      if (p.has_stock_limit) {
        if (stock <= 0) {
          outOfStockCount++;
          lowStockItems.push({
            id: p.id,
            barcode_id: p.barcode_id || 'PR-0000',
            product_name: p.product_name,
            stock_quantity: stock,
            low_stock_alert: threshold,
            selling_price: Number(p.selling_price || 0),
            has_stock_limit: true,
          });
        } else if (stock <= threshold) {
          lowStockItems.push({
            id: p.id,
            barcode_id: p.barcode_id || 'PR-0000',
            product_name: p.product_name,
            stock_quantity: stock,
            low_stock_alert: threshold,
            selling_price: Number(p.selling_price || 0),
            has_stock_limit: true,
          });
        }
      }
    });

    const lowStockCount = lowStockItems.length;

    const newMembersThisMonth = members.filter((m) => {
      const d = new Date(m.created_at || now);
      return d >= monthStart && d <= monthEnd;
    }).length;

    // --- Context-Aware Attendance Distribution & Peak Metric ---
    const attendanceHourly: AttendanceHourData[] = [];
    let peakHourDisplay = '5:00 PM - 6:00 PM';

    if (timeRange === 'today') {
      const hourBuckets: Record<
        number,
        { visits: number; walkIns: number; members: number }
      > = {};
      for (let h = 6; h <= 22; h++) {
        hourBuckets[h] = { visits: 0, walkIns: 0, members: 0 };
      }

      todayAttendanceList.forEach((a) => {
        const d = new Date(a.check_in_time);
        const h = d.getHours();
        if (hourBuckets[h]) {
          hourBuckets[h].visits++;
          if (a.customer_type === 'Walk-In') hourBuckets[h].walkIns++;
          else hourBuckets[h].members++;
        }
      });

      Object.entries(hourBuckets).forEach(([hourStr, val]) => {
        const h = Number(hourStr);
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        attendanceHourly.push({
          hour: `${displayH} ${period}`,
          visits: val.visits,
          walkIns: val.walkIns,
          members: val.members,
        });
      });

      let maxH = 17;
      let maxV = -1;
      Object.entries(hourBuckets).forEach(([h, val]) => {
        if (val.visits > maxV) {
          maxV = val.visits;
          maxH = Number(h);
        }
      });
      peakHourDisplay =
        maxH >= 12
          ? `${maxH % 12 || 12}:00 PM - ${(maxH + 1) % 12 || 12}:00 PM`
          : `${maxH}:00 AM - ${maxH + 1}:00 AM`;
    } else if (timeRange === 'year') {
      let maxMonthLabel = '';
      let maxMonthVisits = -1;

      for (let m = 11; m >= 0; m--) {
        const monthDate = subDays(now, m * 30);
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const label = format(monthDate, 'MMM yyyy');

        const mAtt = attendance.filter((a) => {
          const d = new Date(a.check_in_time);
          return d >= mStart && d <= mEnd;
        });

        const walkIns = mAtt.filter(
          (a) => a.customer_type === 'Walk-In'
        ).length;
        const mems = mAtt.length - walkIns;

        attendanceHourly.push({
          hour: label,
          visits: mAtt.length,
          walkIns,
          members: mems,
        });

        if (mAtt.length > maxMonthVisits) {
          maxMonthVisits = mAtt.length;
          maxMonthLabel = label;
        }
      }
      peakHourDisplay = maxMonthLabel
        ? `Busiest Month: ${maxMonthLabel}`
        : 'Busiest Month: July';
    } else {
      const daysCount = timeRange === 'week' ? 7 : 30;
      let maxDayLabel = '';
      let maxDayVisits = -1;

      for (let i = daysCount - 1; i >= 0; i--) {
        const targetDate = subDays(now, i);
        const label =
          daysCount <= 7
            ? format(targetDate, 'EEE (MMM d)')
            : format(targetDate, 'MMM d');

        const dAtt = attendance.filter((a) =>
          isSameDay(new Date(a.check_in_time), targetDate)
        );
        const walkIns = dAtt.filter(
          (a) => a.customer_type === 'Walk-In'
        ).length;
        const mems = dAtt.length - walkIns;

        attendanceHourly.push({
          hour: label,
          visits: dAtt.length,
          walkIns,
          members: mems,
        });

        if (dAtt.length > maxDayVisits) {
          maxDayVisits = dAtt.length;
          maxDayLabel = format(targetDate, 'EEEE (MMM d)');
        }
      }
      peakHourDisplay = maxDayLabel
        ? `Peak Day: ${maxDayLabel}`
        : 'Peak Day: Friday';
    }

    // --- Revenue Timeline (Incorporates Attendance, Subscriptions, and Card Purchases) ---
    const revenueTimeline: RevenueTimelinePoint[] = [];

    if (timeRange === 'today') {
      for (let h = 6; h <= 22; h++) {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const label = `${displayH} ${period}`;

        const sList = sales.filter((s) => {
          const d = new Date(s.created_at);
          return isSameDay(d, now) && d.getHours() === h;
        });
        const aList = attendance.filter((a) => {
          const d = new Date(a.check_in_time);
          return isSameDay(d, now) && d.getHours() === h;
        });
        const subList = subscriptions.filter((sub) => {
          const d = new Date(sub.created_at);
          return isSameDay(d, now) && d.getHours() === h;
        });
        const cardList = standaloneCardReceipts.filter((r) => {
          const d = new Date(r.created_at);
          return isSameDay(d, now) && d.getHours() === h;
        });

        const sRev = sList.reduce(
          (acc, s) => acc + Number(s.total_amount || 0),
          0
        );
        const aRev =
          aList.reduce((acc, a) => acc + getAttendanceFee(a), 0) +
          subList.reduce((acc, sub) => acc + Number(sub.price || 0), 0) +
          cardList.reduce((acc, r) => acc + getReceiptFee(r), 0);

        revenueTimeline.push({
          date: `${format(now, 'yyyy-MM-dd')} ${h}:00`,
          label,
          salesRevenue: sRev,
          logbookRevenue: aRev,
          totalRevenue: sRev + aRev,
          transactionsCount:
            sList.length + aList.length + subList.length + cardList.length,
        });
      }
    } else if (timeRange === 'year') {
      for (let m = 11; m >= 0; m--) {
        const monthDate = subDays(now, m * 30);
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const label = format(monthDate, 'MMM yyyy');

        const sList = sales.filter((s) => {
          const d = new Date(s.created_at);
          return d >= mStart && d <= mEnd;
        });
        const aList = attendance.filter((a) => {
          const d = new Date(a.check_in_time);
          return d >= mStart && d <= mEnd;
        });
        const subList = subscriptions.filter((sub) => {
          const d = new Date(sub.created_at);
          return d >= mStart && d <= mEnd;
        });
        const cardList = standaloneCardReceipts.filter((r) => {
          const d = new Date(r.created_at);
          return d >= mStart && d <= mEnd;
        });

        const sRev = sList.reduce(
          (acc, s) => acc + Number(s.total_amount || 0),
          0
        );
        const aRev =
          aList.reduce((acc, a) => acc + getAttendanceFee(a), 0) +
          subList.reduce((acc, sub) => acc + Number(sub.price || 0), 0) +
          cardList.reduce((acc, r) => acc + getReceiptFee(r), 0);

        revenueTimeline.push({
          date: format(monthDate, 'yyyy-MM'),
          label,
          salesRevenue: sRev,
          logbookRevenue: aRev,
          totalRevenue: sRev + aRev,
          transactionsCount:
            sList.length + aList.length + subList.length + cardList.length,
        });
      }
    } else {
      const daysToShow = timeRange === 'week' ? 7 : 30;

      for (let i = daysToShow - 1; i >= 0; i--) {
        const targetDate = subDays(now, i);
        const dateKey = format(targetDate, 'yyyy-MM-dd');
        const label =
          daysToShow <= 7
            ? format(targetDate, 'EEE (MMM d)')
            : format(targetDate, 'MMM d');

        const sList = sales.filter((s) =>
          isSameDay(new Date(s.created_at), targetDate)
        );
        const aList = attendance.filter((a) =>
          isSameDay(new Date(a.check_in_time), targetDate)
        );
        const subList = subscriptions.filter((sub) =>
          isSameDay(new Date(sub.created_at), targetDate)
        );
        const cardList = standaloneCardReceipts.filter((r) =>
          isSameDay(new Date(r.created_at), targetDate)
        );

        const sRev = sList.reduce(
          (acc, s) => acc + Number(s.total_amount || 0),
          0
        );
        const aRev =
          aList.reduce((acc, a) => acc + getAttendanceFee(a), 0) +
          subList.reduce((acc, sub) => acc + Number(sub.price || 0), 0) +
          cardList.reduce((acc, r) => acc + getReceiptFee(r), 0);

        revenueTimeline.push({
          date: dateKey,
          label,
          salesRevenue: sRev,
          logbookRevenue: aRev,
          totalRevenue: sRev + aRev,
          transactionsCount:
            sList.length + aList.length + subList.length + cardList.length,
        });
      }
    }

    // --- Top Sold Products ---
    const productLookupById = new Map<string, any>();
    const productLookupByName = new Map<string, any>();

    products.forEach((p) => {
      productLookupById.set(p.id, p);
      if (p.product_name) {
        productLookupByName.set(p.product_name.trim().toLowerCase(), p);
      }
    });

    const aggregatedSalesMap = new Map<
      string,
      {
        product_id: string;
        product_name: string;
        barcode_id: string;
        total_sold: number;
        total_revenue: number;
        unit_price: number;
        matched_product?: any;
      }
    >();

    const filteredSales = sales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= rangeStartDate && d <= now;
    });

    filteredSales.forEach((sale) => {
      let itemsList: any[] = [];

      if (Array.isArray(sale.items)) itemsList = sale.items;
      else if (typeof sale.items === 'string') {
        try {
          const parsed = JSON.parse(sale.items);
          if (Array.isArray(parsed)) itemsList = parsed;
        } catch {
          itemsList = [];
        }
      }

      if (itemsList.length > 0) {
        itemsList.forEach((item: any) => {
          const rawId = item.id || item.product_id || item.productId || '';
          const rawName = (
            item.product_name ||
            item.name ||
            item.title ||
            ''
          ).trim();
          const qty = Number(item.quantity || item.qty || 1) || 1;
          const price = Number(
            item.price || item.selling_price || item.unit_price || 0
          );
          const barcode = item.barcode_id || item.barcode || '';

          const matched =
            (rawId && productLookupById.get(rawId)) ||
            (rawName && productLookupByName.get(rawName.toLowerCase())) ||
            null;

          const key = matched
            ? matched.id
            : rawId || rawName || 'Unknown Product';
          const finalName =
            matched?.product_name || rawName || 'Unlabeled Product';
          const finalBarcode = matched?.barcode_id || barcode || 'PR-0000';
          const finalPrice = matched
            ? Number(matched.selling_price || 0)
            : price;

          if (!aggregatedSalesMap.has(key)) {
            aggregatedSalesMap.set(key, {
              product_id: key,
              product_name: finalName,
              barcode_id: finalBarcode,
              total_sold: 0,
              total_revenue: 0,
              unit_price: finalPrice,
              matched_product: matched,
            });
          }

          const entry = aggregatedSalesMap.get(key)!;
          entry.total_sold += qty;
          entry.total_revenue += qty * (finalPrice || price);
        });
      } else if (sale.product_name) {
        const rawName = sale.product_name.trim();
        const matched = productLookupByName.get(rawName.toLowerCase()) || null;
        const key = matched ? matched.id : rawName;
        const finalName = matched?.product_name || rawName;
        const finalPrice = matched
          ? Number(matched.selling_price || 0)
          : Number(sale.total_amount || 0);

        if (!aggregatedSalesMap.has(key)) {
          aggregatedSalesMap.set(key, {
            product_id: key,
            product_name: finalName,
            barcode_id: matched?.barcode_id || 'PR-0000',
            total_sold: 0,
            total_revenue: 0,
            unit_price: finalPrice,
            matched_product: matched,
          });
        }

        const entry = aggregatedSalesMap.get(key)!;
        entry.total_sold += 1;
        entry.total_revenue += Number(sale.total_amount || finalPrice || 0);
      }
    });

    let topProducts: TopProductMetric[] = [];

    aggregatedSalesMap.forEach((entry, key) => {
      const p =
        entry.matched_product ||
        productLookupById.get(key) ||
        productLookupByName.get(entry.product_name.toLowerCase());

      const stock = p ? Number(p.stock_quantity || 0) : 10;
      const threshold = p ? Number(p.low_stock_alert ?? 5) : 5;
      const hasLimit = p ? Boolean(p.has_stock_limit) : false;

      let status: 'In Stock' | 'Low Stock' | 'Out of Stock' = 'In Stock';
      if (hasLimit) {
        if (stock <= 0) status = 'Out of Stock';
        else if (stock <= threshold) status = 'Low Stock';
      }

      topProducts.push({
        id: p ? p.id : `tp-${key}`,
        product_name: entry.product_name,
        barcode_id: entry.barcode_id || p?.barcode_id || 'PR-0000',
        selling_price:
          entry.unit_price || (p ? Number(p.selling_price || 0) : 0),
        total_sold: entry.total_sold,
        total_revenue: entry.total_revenue,
        current_stock: stock,
        low_stock_alert: threshold,
        status,
      });
    });

    if (topProducts.length < 5 && products.length > 0) {
      products
        .filter((p) => p.status === 'Active')
        .forEach((p) => {
          const alreadyAdded = topProducts.some(
            (tp) =>
              tp.product_name.toLowerCase() === p.product_name.toLowerCase() ||
              tp.id === p.id
          );
          if (!alreadyAdded) {
            const stock = Number(p.stock_quantity || 0);
            const threshold = Number(p.low_stock_alert ?? 5);
            let status: 'In Stock' | 'Low Stock' | 'Out of Stock' = 'In Stock';
            if (p.has_stock_limit) {
              if (stock <= 0) status = 'Out of Stock';
              else if (stock <= threshold) status = 'Low Stock';
            }

            topProducts.push({
              id: p.id,
              product_name: p.product_name,
              barcode_id: p.barcode_id || 'PR-0000',
              selling_price: Number(p.selling_price || 0),
              total_sold: 0,
              total_revenue: 0,
              current_stock: stock,
              low_stock_alert: threshold,
              status,
            });
          }
        });
    }

    topProducts.sort((a, b) => b.total_sold - a.total_sold);

    // --- Recent Activity Feed ---
    const activityItems: ActivityFeedItem[] = [];

    attendance.slice(0, 15).forEach((a) => {
      activityItems.push({
        id: `act-att-${a.id}`,
        type:
          a.customer_type === 'New Membership' ? 'membership_new' : 'checkin',
        title: a.customer_name || 'Member',
        subtitle:
          a.customer_type === 'Walk-In'
            ? `Walk-In Pass (${formatPHP(getAttendanceFee(a))})`
            : `${a.plan_name || 'Member Access Pass'} • Checked In`,
        amount: getAttendanceFee(a),
        timestamp: a.check_in_time,
        badgeText:
          a.customer_type === 'Walk-In'
            ? 'Walk-In'
            : a.customer_type === 'New Membership'
              ? 'New Member'
              : 'Member In',
        badgeVariant:
          a.customer_type === 'Walk-In'
            ? 'info'
            : a.customer_type === 'New Membership'
              ? 'purple'
              : 'success',
      });
    });

    sales.slice(0, 15).forEach((s) => {
      activityItems.push({
        id: `act-sale-${s.id}`,
        type: 'sale',
        title: s.product_name || 'Product Sale',
        subtitle: `OR: ${s.receipt_no} • Paid via ${s.payment_method || 'Cash'}`,
        amount: Number(s.total_amount || 0),
        timestamp: s.created_at,
        badgeText: 'POS Sale',
        badgeVariant: 'primary',
      });
    });

    subscriptions.slice(0, 10).forEach((sub) => {
      const memberObj: any = Array.isArray(sub.members) ? sub.members[0] : sub.members;
      activityItems.push({
        id: `act-sub-${sub.id}`,
        type: 'membership_renew',
        title: memberObj?.full_name || sub.member_id || 'Member',
        subtitle: `Plan: ${sub.plan_type ? sub.plan_type.toUpperCase() : 'MONTHLY'} • ${sub.receipt_number}`,
        amount: Number(sub.price || 0),
        timestamp: sub.created_at,
        badgeText: 'Subscription',
        badgeVariant: 'purple',
      });
    });

    standaloneCardReceipts.slice(0, 10).forEach((r) => {
      activityItems.push({
        id: `act-card-${r.id}`,
        type: 'checkin',
        title: r.customer_name || 'Member',
        subtitle: `${r.item_description || 'Physical Card'} • Issued`,
        amount: getReceiptFee(r),
        timestamp: r.created_at,
        badgeText: 'Card Issue',
        badgeVariant: 'purple',
      });
    });

    activityItems.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // --- BIR Compliance Data ---
    const birReportItems: BirReportItem[] = [];

    sales.forEach((s) => {
      const gross = Number(s.total_amount || 0);
      birReportItems.push({
        receipt_no: s.receipt_no || 'TS-000000',
        date: format(new Date(s.created_at), 'yyyy-MM-dd HH:mm'),
        customer_name: s.product_name || 'POS Customer',
        tin_number: 'N/A',
        transaction_type: 'Product Sale',
        gross_sales: gross,
        vat_exempt_sales: gross,
        vatable_sales: 0,
        vat_amount: 0,
        net_sales: gross,
        payment_method: s.payment_method || 'Cash',
        payment_ref: s.gcash_fee_applied ? 'GCASH-PAY' : 'CASH',
        status: s.deleted_at ? 'Voided' : 'Valid',
      });
    });

    subscriptions.forEach((sub) => {
      const price = Number(sub.price || 0);
      const memberObj: any = Array.isArray(sub.members) ? sub.members[0] : sub.members;
      birReportItems.push({
        receipt_no: sub.receipt_number || 'REC-000000',
        date: format(new Date(sub.created_at), 'yyyy-MM-dd HH:mm'),
        customer_name: memberObj?.full_name || sub.member_id || 'Gym Member',
        tin_number: 'N/A',
        transaction_type: 'Gym Subscription',
        gross_sales: price,
        vat_exempt_sales: price,
        vatable_sales: 0,
        vat_amount: 0,
        net_sales: price,
        payment_method: sub.payment_method || 'Cash',
        payment_ref:
          sub.gcash_ref_no ||
          (sub.payment_method === 'GCash' ? 'GCASH-TX' : 'CASH'),
        status: sub.voided_at ? 'Voided' : 'Valid',
      });
    });

    standaloneCardReceipts.forEach((r) => {
      const amt = getReceiptFee(r);
      birReportItems.push({
        receipt_no: r.id || `CRD-${String(r.id).slice(0, 8)}`,
        date: format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
        customer_name: r.customer_name || 'Gym Member',
        tin_number: 'N/A',
        transaction_type: 'Product Sale',
        gross_sales: amt,
        vat_exempt_sales: amt,
        vatable_sales: 0,
        vat_amount: 0,
        net_sales: amt,
        payment_method: r.payment_method || 'Cash',
        payment_ref:
          r.gcash_ref_no || (r.payment_method === 'GCash' ? 'GCASH-TX' : 'CASH'),
        status: r.payment_status === 'Paid' ? 'Valid' : 'Voided',
      });
    });

    attendance
      .filter(
        (a) => a.customer_type === 'Walk-In' && getAttendanceFee(a) > 0
      )
      .forEach((a) => {
        const fee = getAttendanceFee(a);
        birReportItems.push({
          receipt_no: a.receipt_number || `LOG-${a.id.slice(0, 8)}`,
          date: format(new Date(a.check_in_time), 'yyyy-MM-dd HH:mm'),
          customer_name: a.customer_name || 'Walk-in Guest',
          tin_number: 'N/A',
          transaction_type: 'Walk-In Entry',
          gross_sales: fee,
          vat_exempt_sales: fee,
          vatable_sales: 0,
          vat_amount: 0,
          net_sales: fee,
          payment_method: a.payment_method || 'Cash',
          payment_ref: a.gcash_ref_no || 'CASH',
          status: a.deleted_at ? 'Voided' : 'Valid',
        });
      });

    const metrics: DashboardMetrics = {
      activeMembersCount,
      totalMembersCount,
      todayAttendanceCount,
      yesterdayAttendanceCount,
      peakHourLabel: peakHourDisplay,
      todayTotalRevenue,
      yesterdayTotalRevenue,
      todaySalesRevenue,
      todayLogbookRevenue,
      monthTotalRevenue,
      lastMonthTotalRevenue,
      expiringSoonCount,
      expiredCount,
      lowStockCount,
      outOfStockCount,
      newMembersThisMonth,
    };

    // --- Subscription Plan Breakdown (Monthly vs Yearly) ---
    let monthlyCount = 0;
    let yearlyCount = 0;
    let monthlyRevenue = 0;
    let yearlyRevenue = 0;

    let activeMonthlyCount = 0;
    let activeYearlyCount = 0;
    let activeTotalCount = 0;

    const subscriptionTimeline: SubscriptionBreakdownPoint[] = [];

    const isYearlyPlan = (sub: any): boolean => {
      const type = (sub.plan_type || '').toLowerCase();
      const name = (sub.plan_name || '').toLowerCase();
      return (
        type.includes('year') ||
        type.includes('annual') ||
        name.includes('year') ||
        name.includes('annual')
      );
    };

    subscriptions.forEach((sub) => {
      if (sub.voided_at || sub.status === 'Voided') return;
      const isYearly = isYearlyPlan(sub);
      const price = Number(sub.price || 0);

      if (sub.end_date) {
        const end = parseISO(sub.end_date);
        const start = sub.start_date
          ? parseISO(sub.start_date)
          : sub.created_at
            ? parseISO(sub.created_at)
            : now;
        if (start <= now && end >= now) {
          activeTotalCount++;
          if (isYearly) activeYearlyCount++;
          else activeMonthlyCount++;
        }
      }

      const created = sub.created_at
        ? parseISO(sub.created_at)
        : sub.start_date
          ? parseISO(sub.start_date)
          : null;
      if (created && created >= rangeStartDate && created <= now) {
        if (isYearly) {
          yearlyCount++;
          yearlyRevenue += price;
        } else {
          monthlyCount++;
          monthlyRevenue += price;
        }
      }
    });

    const totalSubscribers = monthlyCount + yearlyCount;
    const totalRevenue = monthlyRevenue + yearlyRevenue;
    const monthlyPercentage =
      totalSubscribers > 0
        ? Math.round((monthlyCount / totalSubscribers) * 100)
        : activeTotalCount > 0
          ? Math.round((activeMonthlyCount / activeTotalCount) * 100)
          : 0;
    const yearlyPercentage =
      totalSubscribers > 0
        ? 100 - monthlyPercentage
        : activeTotalCount > 0
          ? 100 - monthlyPercentage
          : 0;

    if (timeRange === 'today') {
      for (let h = 6; h <= 21; h++) {
        const hStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          h,
          0,
          0
        );
        const hEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          h,
          59,
          59
        );
        const label = format(hStart, 'ha');

        const subList = subscriptions.filter((sub) => {
          if (sub.voided_at || sub.status === 'Voided') return false;
          const d = new Date(sub.created_at || sub.start_date);
          return d >= hStart && d <= hEnd;
        });

        let mCount = 0;
        let yCount = 0;
        let mRev = 0;
        let yRev = 0;

        subList.forEach((sub) => {
          const isYearly = isYearlyPlan(sub);
          const price = Number(sub.price || 0);
          if (isYearly) {
            yCount++;
            yRev += price;
          } else {
            mCount++;
            mRev += price;
          }
        });

        subscriptionTimeline.push({
          date: `${format(now, 'yyyy-MM-dd')} ${h}:00`,
          label,
          monthly: mCount,
          yearly: yCount,
          total: mCount + yCount,
          monthlyRevenue: mRev,
          yearlyRevenue: yRev,
        });
      }
    } else if (timeRange === 'year') {
      for (let m = 11; m >= 0; m--) {
        const monthDate = subDays(now, m * 30);
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const label = format(monthDate, 'MMM yyyy');

        const subList = subscriptions.filter((sub) => {
          if (sub.voided_at || sub.status === 'Voided') return false;
          const d = new Date(sub.created_at || sub.start_date);
          return d >= mStart && d <= mEnd;
        });

        let mCount = 0;
        let yCount = 0;
        let mRev = 0;
        let yRev = 0;

        subList.forEach((sub) => {
          const isYearly = isYearlyPlan(sub);
          const price = Number(sub.price || 0);
          if (isYearly) {
            yCount++;
            yRev += price;
          } else {
            mCount++;
            mRev += price;
          }
        });

        subscriptionTimeline.push({
          date: format(monthDate, 'yyyy-MM'),
          label,
          monthly: mCount,
          yearly: yCount,
          total: mCount + yCount,
          monthlyRevenue: mRev,
          yearlyRevenue: yRev,
        });
      }
    } else {
      const daysToShow = timeRange === 'week' ? 7 : 30;

      for (let i = daysToShow - 1; i >= 0; i--) {
        const targetDate = subDays(now, i);
        const dateKey = format(targetDate, 'yyyy-MM-dd');
        const label =
          daysToShow <= 7
            ? format(targetDate, 'EEE (MMM d)')
            : format(targetDate, 'MMM d');

        const subList = subscriptions.filter((sub) => {
          if (sub.voided_at || sub.status === 'Voided') return false;
          return isSameDay(
            new Date(sub.created_at || sub.start_date),
            targetDate
          );
        });

        let mCount = 0;
        let yCount = 0;
        let mRev = 0;
        let yRev = 0;

        subList.forEach((sub) => {
          const isYearly = isYearlyPlan(sub);
          const price = Number(sub.price || 0);
          if (isYearly) {
            yCount++;
            yRev += price;
          } else {
            mCount++;
            mRev += price;
          }
        });

        subscriptionTimeline.push({
          date: dateKey,
          label,
          monthly: mCount,
          yearly: yCount,
          total: mCount + yCount,
          monthlyRevenue: mRev,
          yearlyRevenue: yRev,
        });
      }
    }

    const subscriptionBreakdown: SubscriptionPlanBreakdown = {
      monthlyCount,
      yearlyCount,
      otherCount: 0,
      totalSubscribers,
      activeMonthlyCount,
      activeYearlyCount,
      activeTotalCount,
      monthlyRevenue,
      yearlyRevenue,
      totalRevenue,
      monthlyPercentage,
      yearlyPercentage,
      timeline: subscriptionTimeline,
    };

    return {
      metrics,
      attendanceHourly,
      revenueTimeline,
      topProducts,
      expiringSoonList,
      lowStockItems,
      activityItems: activityItems.slice(0, 20),
      birReportItems,
      subscriptionBreakdown,
    };
  } catch (error) {
    console.error('Error fetching dashboard metrics from Supabase:', error);
    throw error;
  }
}