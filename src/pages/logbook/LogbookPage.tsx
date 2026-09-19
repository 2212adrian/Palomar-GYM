// src/pages/logbook/LogbookPage.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useContext,
  useRef,
  useCallback,
} from 'react';
import {
  format,
  startOfWeek,
  addDays,
  getDay,
  parseISO,
  isToday,
} from 'date-fns';
import {
  Plus,
  RotateCcw,
  ClipboardList,
  ChevronRight,
  ChevronLeft,
  Users,
  Search,
  Printer,
  Trash2,
  Lock,
} from 'lucide-react';
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { toast } from 'react-toastify';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';

// Supabase & Authentication Stores
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';

// UI Helpers
import { Button } from '../../components/ui/Button';
import { UndoToast, type UndoItem } from '../../components/ui/UndoToast';
import { TimelineBar } from '../../components/ui/TimelineBar';
import { TabLoader } from '../../components/ui/TabLoader';
import { HeaderActionsContext } from '../../routes';
import { LogbookRecordAttendance } from './components/LogbookRecordAttendance';
import { LogbookRecycleBin } from './components/LogbookRecycleBin';
import { useSessionLock } from '../../hooks/useSessionLock';
import {
  ClosedSessionGroup,
  type SessionSummaryInfo,
} from '../../components/ui/ClosedSessionGroup';
import { useNavbarStore } from '../../stores/useNavbarStore';

// Unified Official Receipt & TimelineCard
import { OfficialReceipt } from '../../components/ui/OfficialReceipt';
import { TimelineCard, type LogRecord } from '../../components/ui/TimelineCard';
import { MembersList } from '../members/MembersList';
import { useCashSessionStore } from '../../stores/useCashSessionStore';

// DYNAMIC BANKNOTE ICON WITH POPPING / EXPLODE EFFECT
const DynamicBanknoteIcon: React.FC<{
  trend: 'increasing' | 'decreasing' | 'neutral';
}> = ({ trend }) => {
  return (
    <motion.div
      key={trend}
      initial={
        trend === 'increasing'
          ? { scale: 0.4, rotate: -20, opacity: 0 }
          : trend === 'decreasing'
            ? { scale: 0.4, rotate: 20, opacity: 0 }
            : { scale: 1, rotate: 0, opacity: 1 }
      }
      animate={
        trend === 'increasing'
          ? {
              scale: [0.4, 1.55, 0.95, 1],
              rotate: [-20, 8, -3, 0],
              opacity: [0, 1, 1, 1],
              filter: [
                'drop-shadow(0 0 0px rgba(16,185,129,0))',
                'drop-shadow(0 0 14px rgba(16,185,129,0.9))',
                'drop-shadow(0 0 4px rgba(16,185,129,0.4))',
              ],
            }
          : trend === 'decreasing'
            ? {
                scale: [0.4, 1.55, 0.95, 1],
                rotate: [20, -8, 3, 0],
                opacity: [0, 1, 1, 1],
                filter: [
                  'drop-shadow(0 0 0px rgba(239,68,68,0))',
                  'drop-shadow(0 0 14px rgba(239,68,68,0.9))',
                  'drop-shadow(0 0 4px rgba(239,68,68,0.4))',
                ],
              }
            : {
                scale: 1,
                rotate: 0,
                opacity: 1,
                filter: 'drop-shadow(0 0 0px rgba(0,0,0,0))',
              }
      }
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      className={`shrink-0 flex items-center justify-center ${
        trend === 'increasing'
          ? 'text-emerald-500 dark:text-emerald-400'
          : trend === 'decreasing'
            ? 'text-rose-500 dark:text-rose-400'
            : 'text-emerald-500 dark:text-emerald-400'
      }`}
    >
      {trend === 'increasing' ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5" />
          <circle cx="10" cy="12" r="2" />
          <path d="M6 12h.01" />
          <path d="M19 21v-8" />
          <path d="m16 16 3-3 3 3" />
        </svg>
      ) : trend === 'decreasing' ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5" />
          <circle cx="10" cy="12" r="2" />
          <path d="M6 12h.01" />
          <path d="M19 13v8" />
          <path d="m16 18 3 3 3-3" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="20" height="12" x="2" y="6" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      )}
    </motion.div>
  );
};

// ANIMATED CURRENCY TICKER
const AnimatedCurrency: React.FC<{
  value: number;
  trend?: 'increasing' | 'decreasing' | 'neutral';
}> = ({ value, trend = 'neutral' }) => {
  const count = useMotionValue(value);
  const formatted = useTransform(
    count,
    (latest) => `₱${Number(latest).toFixed(2)}`
  );

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 1.0,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, count]);

  return (
    <motion.span
      key={`${trend}-${value}`}
      initial={{
        scale: trend !== 'neutral' ? 1.08 : 1,
      }}
      animate={
        trend === 'increasing'
          ? {
              scale: [1, 1.08, 1],
              color: ['#10b981', '#34d399', 'currentColor'],
            }
          : trend === 'decreasing'
            ? {
                scale: [1, 1.08, 1],
                color: ['#ef4444', '#f87171', 'currentColor'],
              }
            : { scale: 1, color: 'currentColor' }
      }
      transition={{ duration: 1.2, times: [0, 0.4, 1], ease: 'easeOut' }}
      className={`font-heading font-black tracking-tight inline-block ${
        trend === 'increasing'
          ? 'text-emerald-600 dark:text-emerald-400'
          : trend === 'decreasing'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-slate-900 dark:text-white'
      }`}
    >
      <motion.span>{formatted}</motion.span>
    </motion.span>
  );
};

// ANIMATED NUMBER TICKER
const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
  const count = useMotionValue(value);
  const rounded = useTransform(count, (latest) =>
    Math.round(latest).toString()
  );

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, count]);

  return <motion.span>{rounded}</motion.span>;
};

const ATTENDANCE_FILTERS = [
  { label: 'All', value: 'All' },
  { label: 'Walk-In', value: 'Walk-In' },
  { label: 'Member', value: 'Member' },
  { label: 'Subs', value: 'Subs' },
  { label: 'Cards', value: 'Card' },
];

const PAYMENT_FILTERS = [
  { label: 'All Pay', value: 'All' },
  { label: 'Cash', value: 'Cash' },
  { label: 'GCash', value: 'GCash' },
];

const TransactionSkeleton: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-(--bg-card) border border-(--border-color) p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 animate-pulse select-none">
      <div className="flex items-center gap-4 w-full md:w-auto min-w-0 flex-1">
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
          <div className="h-4 w-12 bg-slate-200/60 dark:bg-zinc-800/60 rounded mt-0.5" />
        </div>

        <div className="min-w-0 flex-1 text-left space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-4.5 w-40 sm:w-56 bg-slate-200/60 dark:bg-zinc-800/60 rounded" />
            <div className="h-4.5 w-16 bg-slate-100 dark:bg-zinc-800/80 rounded-full border border-(--border-color)" />
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <div className="h-5 w-24 bg-slate-100/50 dark:bg-zinc-800/30 rounded-lg border border-(--border-color)" />
            <div className="h-5 w-32 bg-slate-100/50 dark:bg-zinc-800/30 rounded-lg border border-(--border-color)" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <div className="h-3 w-28 bg-slate-200/30 dark:bg-zinc-800/20 rounded" />
            <span className="text-slate-200 dark:text-zinc-800">•</span>
            <div className="h-3 w-16 bg-slate-200/30 dark:bg-zinc-800/20 rounded" />
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 shrink-0">
        <div className="w-10.5 h-10.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
        <div className="w-10.5 h-10.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
      </div>
    </div>
  );
};

const isCardRecord = (log: LogRecord): boolean => {
  return (
    log.customerType === 'Card' ||
    String(log.categoryOrPlan || '')
      .toLowerCase()
      .includes('card')
  );
};

export const LogbookPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setActions } = useContext(HeaderActionsContext);
  const { user, profile } = useAuthStore() as any;
  const { isLocked, getLockReason } = useSessionLock();
  const { activeSession, isSessionOpen, history, loadHistory } =
    useCashSessionStore();
  const isNavFloatingOpen = Boolean(useNavbarStore((s) => s.activeFloating));

  const [closedSessionsList, setClosedSessionsList] = useState<
    SessionSummaryInfo[]
  >([]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const role = useMemo<'admin' | 'staff'>(() => {
    if (isSuperAdmin(user?.email)) return 'admin';
    const userRole =
      profile?.role || user?.user_metadata?.role || user?.app_metadata?.role;
    return userRole?.toLowerCase() === 'admin' ? 'admin' : 'staff';
  }, [user, profile]);

  // Session-based deletability check
  const isLogDeletable = useCallback(
    (log: LogRecord) => {
      if (
        log.isSubscription ||
        (log as any).deletable === false ||
        log.customerType === 'New Membership'
      ) {
        return false;
      }

      if (!isSessionOpen || !activeSession) return false;

      const logSessionId =
        (log as any).cash_session_id || (log as any).cashSessionId;
      if (logSessionId) {
        return String(logSessionId) === String(activeSession.id);
      }

      if (log.timestamp && activeSession.opened_at) {
        return (
          new Date(log.timestamp).getTime() >=
          new Date(activeSession.opened_at).getTime()
        );
      }

      return false;
    },
    [isSessionOpen, activeSession]
  );

  const getLogDeleteDisabledReason = useCallback(
    (log: LogRecord) => {
      if (log.isSubscription || log.customerType === 'New Membership') {
        return 'Subscription contracts cannot be deleted from Logbook.';
      }
      if (!isSessionOpen) {
        return 'Cash session is closed. Open a cash session to manage attendance.';
      }
      if (!isLogDeletable(log)) {
        return 'Locked: This check-in belongs to a closed cash session and cannot be modified.';
      }
      return undefined;
    },
    [isSessionOpen, isLogDeletable]
  );

  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // Date selection states
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() =>
    getDay(new Date())
  );

  const selectedDate = useMemo(() => {
    return addDays(currentWeekStart, selectedDayIndex);
  }, [currentWeekStart, selectedDayIndex]);

  const dateStr = useMemo(
    () => format(selectedDate, 'yyyy-MM-dd'),
    [selectedDate]
  );

  // Animation & Consolidated Multi-Stacked Pending Delete states
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [stagedDeletions, setStagedDeletions] = useState<LogRecord[]>([]);
  const stagedDeletionsRef = useRef<LogRecord[]>([]);
  stagedDeletionsRef.current = stagedDeletions;

  // Pre-fill state passed from Scanner overlay
  const [initialSearchVal, setInitialSearchVal] = useState<string>('');

  const activePage = useMemo<'logbook' | 'members'>(() => {
    return location.pathname.startsWith('/members') ? 'members' : 'logbook';
  }, [location.pathname]);

  const [ledgerSearch, setLedgerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<
    'All' | 'Walk-In' | 'Member' | 'Subs'
  >('All');
  const [paymentFilter, setPaymentFilter] = useState<
    'All' | 'Cash' | 'GCash' | 'Card'
  >('All');

  const [visibleCount, setVisibleCount] = useState<number>(25);

  // Reset timeline filters to today's default helper
  const resetTimelineFilters = useCallback(() => {
    const today = new Date();
    const todayWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const todayIndex = getDay(today);

    setCurrentWeekStart(todayWeekStart);
    setSelectedDayIndex(todayIndex);
    setLedgerSearch('');
    setCustomerFilter('All');
    setPaymentFilter('All');
    setVisibleCount(25);
  }, []);

  // Always reset timeline filters whenever user exits or changes views/pages
  useEffect(() => {
    resetTimelineFilters();
  }, [location.pathname, activePage, resetTimelineFilters]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      resetTimelineFilters();
    };
  }, [resetTimelineFilters]);

  // Merged closed sessions lookup
  const mergedClosedSessions = useMemo(() => {
    const map = new Map<string, SessionSummaryInfo>();
    closedSessionsList.forEach((s) => map.set(String(s.id), s));
    (history || []).forEach((s) => {
      if (s.status === 'closed' || s.closed_at) {
        map.set(String(s.id), {
          id: String(s.id),
          session_number: s.session_number,
          opened_at: s.opened_at,
          closed_at: s.closed_at,
          opened_by_name: s.opened_by_name,
          closed_by_name: s.closed_by_name,
          status: s.status,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const tA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const tB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return tB - tA;
    });
  }, [closedSessionsList, history]);

  // TRUE STALE-WHILE-REVALIDATE (SWR) SANITIZED RPC FETCHING
  const fetchAttendanceFromSupabase = useCallback(
    async (isBackground: boolean = false) => {
      const cacheKey = `logbook_sanitized_${dateStr}`;

      if (!isBackground) {
        const cachedSession = sessionStorage.getItem(cacheKey);
        if (cachedSession) {
          try {
            const parsed = JSON.parse(cachedSession);
            if (Array.isArray(parsed)) {
              setLogs(parsed);
            }
          } catch (e) {
            console.error('Failed to parse cached logbook session:', e);
          }
        } else {
          setLoadingLogs(true);
        }
      }

      try {
        // Fetch closed sessions list from Supabase
        const { data: closedSessionsData } = await supabase
          .from('cash_sessions')
          .select(
            'id, session_number, opened_at, closed_at, opened_by_name, closed_by_name, status'
          )
          .eq('status', 'closed')
          .order('closed_at', { ascending: false });

        if (closedSessionsData) {
          setClosedSessionsList(closedSessionsData);
        }

        let mappedLogs: LogRecord[] | null = null;

        try {
          const { data, error } = await supabase.rpc('get_sanitized_logbook', {
            target_date: dateStr,
          });

          if (!error && data) {
            mappedLogs = (data || []).map((row: any) => ({
              id: String(row.id),
              timestamp: row.timestamp,
              memberId: row.member_id || null,
              customerName: row.customer_name,
              customerType: row.customer_type,
              categoryOrPlan: row.category_or_plan,
              paymentMethod: row.payment_method,
              amountPaid: Number(row.amount_paid || 0),
              basePrice: Number(row.base_price || 0),
              gcashFee: Number(row.gcash_fee || 0),
              cardFee: Number(row.card_fee || 0),
              gcashRefNo: row.gcash_ref_no,
              referenceNumber: row.gcash_ref_no,
              paymentRef: row.gcash_ref_no,
              paymentStatus: (row.payment_status === 'Promo' ||
              row.payment_status === 'Unpaid'
                ? row.payment_status
                : 'Paid') as 'Paid' | 'Unpaid' | 'Promo',
              status: 'Active',
              isSubscription: Boolean(row.is_subscription),
              deletable: Boolean(row.deletable),
              receiptNumber: row.receipt_number || null,
              memberIds: Array.isArray(row.member_ids) ? row.member_ids : [],
              cash_session_id: row.cash_session_id || null,
            }));
          }
        } catch (rpcErr: any) {
          console.warn('RPC get_sanitized_logbook invocation error:', rpcErr);
        }

        // Direct table query fallback
        if (
          !mappedLogs &&
          (typeof navigator === 'undefined' || navigator.onLine)
        ) {
          try {
            const startOfDay = new Date(
              `${dateStr}T00:00:00+08:00`
            ).toISOString();
            const endOfDay = new Date(
              `${dateStr}T23:59:59.999+08:00`
            ).toISOString();

            const [attRes, rcptRes] = await Promise.allSettled([
              supabase
                .from('attendance')
                .select('*')
                .is('deleted_at', null)
                .gte('check_in_time', startOfDay)
                .lte('check_in_time', endOfDay)
                .order('check_in_time', { ascending: false }),
              supabase
                .from('receipts')
                .select('*')
                .gte('created_at', startOfDay)
                .lte('created_at', endOfDay)
                .order('created_at', { ascending: false }),
            ]);

            const rawAttendance =
              attRes.status === 'fulfilled' && !attRes.value.error
                ? attRes.value.data || []
                : [];
            const rawReceipts =
              rcptRes.status === 'fulfilled' && !rcptRes.value.error
                ? rcptRes.value.data || []
                : [];

            const fallbackList: LogRecord[] = [];

            rawAttendance.forEach((a: any) => {
              const entryFee = Number(a.entry_fee || 0);
              fallbackList.push({
                id: String(a.id),
                timestamp: a.check_in_time,
                memberId: a.member_id || null,
                customerName: a.customer_name || 'Anonymous',
                customerType: a.customer_type || 'Walk-In',
                categoryOrPlan: a.plan_name || 'Regular Pass',
                paymentMethod: a.payment_method || 'Cash',
                amountPaid: entryFee,
                basePrice: Number(
                  a.base_price || entryFee - (Number(a.gcash_fee) || 0)
                ),
                gcashFee: Number(a.gcash_fee || 0),
                cardFee: Number(a.card_fee || 0),
                gcashRefNo: a.gcash_ref_no || '',
                referenceNumber: a.gcash_ref_no || '',
                paymentRef: a.gcash_ref_no || '',
                paymentStatus: entryFee > 0 ? 'Paid' : 'Promo',
                status: 'Active',
                isSubscription: false,
                deletable: true,
                receiptNumber: a.receipt_number || null,
                memberIds: Array.isArray(a.member_ids) ? a.member_ids : [],
                cash_session_id: a.cash_session_id || null,
              });
            });

            rawReceipts.forEach((r: any) => {
              const amt = Number(r.amount || 0);
              fallbackList.push({
                id: `rcpt-${r.id}`,
                timestamp: r.created_at,
                memberId: r.member_id || null,
                customerName: r.customer_name || 'Member',
                customerType: r.customer_type || 'New Membership',
                categoryOrPlan: r.item_description || 'Subscription',
                paymentMethod: r.payment_method || 'Cash',
                amountPaid: amt,
                basePrice: Number(r.base_price || amt),
                gcashFee: Number(r.gcash_fee || 0),
                cardFee: Number(r.card_fee || 0),
                gcashRefNo: r.gcash_ref_no || '',
                referenceNumber: r.gcash_ref_no || '',
                paymentRef: r.gcash_ref_no || '',
                paymentStatus: 'Paid',
                status: 'Active',
                isSubscription: true,
                deletable: false,
                receiptNumber: r.id || null,
                memberIds: Array.isArray(r.member_ids) ? r.member_ids : [],
                cash_session_id: r.cash_session_id || null,
              });
            });

            fallbackList.sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
            );
            mappedLogs = fallbackList;
          } catch (directErr) {
            console.error('Direct table fetch error:', directErr);
          }
        }

        if (mappedLogs) {
          setLogs(mappedLogs);
          sessionStorage.setItem(cacheKey, JSON.stringify(mappedLogs));
        }
      } catch (err) {
        console.error('Failed to fetch attendance:', err);
      } finally {
        if (!isBackground) {
          setLoadingLogs(false);
        }
      }
    },
    [dateStr]
  );

  useEffect(() => {
    fetchAttendanceFromSupabase(false);

    const channelId = `logbook_rt_${dateStr}_${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          sessionStorage.removeItem(`logbook_sanitized_${dateStr}`);
          fetchAttendanceFromSupabase(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts' },
        () => {
          sessionStorage.removeItem(`logbook_sanitized_${dateStr}`);
          fetchAttendanceFromSupabase(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_sessions' },
        () => {
          sessionStorage.removeItem(`logbook_sanitized_${dateStr}`);
          loadHistory();
          fetchAttendanceFromSupabase(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateStr, fetchAttendanceFromSupabase, loadHistory]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);

  const [selectedReceiptLog, setSelectedReceiptLog] =
    useState<LogRecord | null>(null);

  useEffect(() => {
    if (location.state && (location.state as any).openAttendanceModal) {
      const searchName = (location.state as any).initialSearch || '';
      setInitialSearchVal(searchName);
      setIsCreateModalOpen(true);

      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const dayLogs = useMemo(() => logs, [logs]);

  const filteredLogs = useMemo(() => {
    return dayLogs.filter((l: LogRecord) => {
      const q = ledgerSearch.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        l.customerName.toLowerCase().includes(q) ||
        (l.memberId && l.memberId.toLowerCase().includes(q)) ||
        l.categoryOrPlan.toLowerCase().includes(q);

      let matchesType = true;
      if (customerFilter === 'Walk-In') {
        matchesType = l.customerType === 'Walk-In';
      } else if (customerFilter === 'Member') {
        matchesType = l.customerType === 'Existing Member';
      } else if (customerFilter === 'Subs') {
        matchesType =
          l.customerType === 'New Membership' ||
          !!l.isSubscription ||
          (l.categoryOrPlan || '').toLowerCase().includes('membership') ||
          (l.categoryOrPlan || '').toLowerCase().includes('subscription');
      } else if ((customerFilter as string) === 'Card') {
        matchesType =
          l.customerType === 'Card' ||
          (l.categoryOrPlan || '').toLowerCase().includes('card');
      }

      let matchesPayment = true;
      if (paymentFilter !== 'All') {
        const pMethod = (l.paymentMethod || '').toLowerCase();
        matchesPayment = pMethod.includes(paymentFilter.toLowerCase());
      }

      return matchesSearch && matchesType && matchesPayment;
    });
  }, [dayLogs, ledgerSearch, customerFilter, paymentFilter]);

  const totalItems = filteredLogs.length;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(25);
  }, [dateStr, ledgerSearch, customerFilter, paymentFilter]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredLogs.length) {
          setVisibleCount((prev) => Math.min(prev + 20, filteredLogs.length));
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    );

    observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [visibleCount, filteredLogs.length]);

  const paginatedLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleCount);
  }, [filteredLogs, visibleCount]);

  // Active session logs only (strictly 0 if session is closed)
  const activeSessionLogs = useMemo(() => {
    if (!isSessionOpen || !activeSession) return [];
    return dayLogs.filter((log) => {
      const sid = (log as any).cash_session_id
        ? String((log as any).cash_session_id)
        : null;
      if (sid && activeSession?.id) {
        return sid === String(activeSession.id);
      }
      if (log.timestamp && activeSession?.opened_at) {
        return (
          new Date(log.timestamp).getTime() >=
          new Date(activeSession.opened_at).getTime()
        );
      }
      return false;
    });
  }, [dayLogs, isSessionOpen, activeSession]);

  const activeRevenue = useMemo(() => {
    return dayLogs.reduce((acc, log) => {
      if (log.paymentStatus === 'Paid') {
        return acc + (Number(log.amountPaid) || 0);
      }
      return acc;
    }, 0);
  }, [dayLogs]);

  // Exclude card purchases/issuances from attendance check-ins count
  const activeCheckinsCount = useMemo(() => {
    return dayLogs.filter((log) => !isCardRecord(log)).length;
  }, [dayLogs]);

  const activeNewMembersCount = useMemo(() => {
    return activeSessionLogs.filter(
      (l: LogRecord) => l.customerType === 'New Membership' || l.isSubscription
    ).length;
  }, [activeSessionLogs]);

  const [revenueTrend, setRevenueTrend] = useState<
    'increasing' | 'decreasing' | 'neutral'
  >('neutral');
  const prevRevenueRef = useRef<number>(activeRevenue);

  useEffect(() => {
    if (activeRevenue > prevRevenueRef.current) {
      setRevenueTrend('increasing');
      const timer = setTimeout(() => setRevenueTrend('neutral'), 1800);
      prevRevenueRef.current = activeRevenue;
      return () => clearTimeout(timer);
    } else if (activeRevenue < prevRevenueRef.current) {
      setRevenueTrend('decreasing');
      const timer = setTimeout(() => setRevenueTrend('neutral'), 1800);
      prevRevenueRef.current = activeRevenue;
      return () => clearTimeout(timer);
    }
    prevRevenueRef.current = activeRevenue;
  }, [activeRevenue]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('logbook-kpi-update', {
        detail: {
          checkins: activeCheckinsCount,
          revenue: activeRevenue,
          newMembers: activeNewMembersCount,
          revenueTrend,
        },
      })
    );
  }, [activeCheckinsCount, activeRevenue, activeNewMembersCount, revenueTrend]);

  const handleCheckInSuccess = (newLog: LogRecord) => {
    const normalizedLog: LogRecord = {
      ...newLog,
      id: String(newLog.id),
      cash_session_id:
        (newLog as any).cash_session_id || activeSession?.id || null,
    } as any;

    setNewlyAddedId(normalizedLog.id);
    setTimeout(() => setNewlyAddedId(null), 2500);

    setLogs((prev) => {
      const updated: LogRecord[] = [
        normalizedLog,
        ...prev.filter((item) => String(item.id) !== normalizedLog.id),
      ];
      sessionStorage.setItem(
        `logbook_sanitized_${dateStr}`,
        JSON.stringify(updated)
      );
      return updated;
    });

    toast.success('Attendance check-in success.');

    setLedgerSearch('');
    setCustomerFilter('All');
    setPaymentFilter('All');
    setInitialSearchVal('');

    const today = new Date();
    const todayWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const todayIndex = getDay(today);

    setCurrentWeekStart((prev) =>
      prev.getTime() === todayWeekStart.getTime() ? prev : todayWeekStart
    );
    setSelectedDayIndex((prev) => (prev === todayIndex ? prev : todayIndex));
    setVisibleCount(25);
  };

  const handleTriggerCollectPayment = async (log: LogRecord) => {
    setLogs((prev) => {
      const updated: LogRecord[] = prev.map((item) =>
        item.id === log.id ? { ...item, paymentStatus: 'Paid' as const } : item
      );
      sessionStorage.setItem(
        `logbook_sanitized_${dateStr}`,
        JSON.stringify(updated)
      );
      return updated;
    });

    try {
      await supabase
        .from('attendance')
        .update({
          payment_status: 'Paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', log.id);
    } catch (dbErr) {
      console.warn('Failed to update attendance payment status in DB:', dbErr);
    }

    toast.success(`Payment logged for ${log.customerName}`);
    logAudit(
      'PAYMENT_COLLECTED',
      `Collected payment of ₱${Number(log.amountPaid || 0).toFixed(2)} for "${log.customerName}": Payment status changed from "Unpaid" to "Paid" via ${log.paymentMethod || 'Cash'}.`,
      log.id
    ).catch((e) => console.warn('Payment collect audit log failed:', e));
  };

  const handleTriggerUndoPayment = async (log: LogRecord) => {
    setLogs((prev) => {
      const updated: LogRecord[] = prev.map((item) =>
        item.id === log.id
          ? { ...item, paymentStatus: 'Unpaid' as const }
          : item
      );
      sessionStorage.setItem(
        `logbook_sanitized_${dateStr}`,
        JSON.stringify(updated)
      );
      return updated;
    });

    try {
      await supabase
        .from('attendance')
        .update({
          payment_status: 'Unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', log.id);
    } catch (dbErr) {
      console.warn('Failed to update attendance payment status in DB:', dbErr);
    }

    toast.info(`Undone payment. Set back to Unpaid.`);
    logAudit(
      'PAYMENT_UNDONE',
      `Reverted payment of ₱${Number(log.amountPaid || 0).toFixed(2)} for "${log.customerName}": Payment status changed from "Paid" to "Unpaid".`,
      log.id
    ).catch((e) => console.warn('Payment undo audit log failed:', e));
  };

  // ─── STACKABLE MULTI-UNDO & COMMIT CONTROLLERS ───
  const deactivateCardsForLogRecord = async (log: LogRecord) => {
    const isCard =
      log.customerType === 'Card' ||
      String(log.categoryOrPlan || '')
        .toLowerCase()
        .includes('card');
    if (!isCard) return;

    const targetMemberIds: string[] = [];
    if (log.memberId) targetMemberIds.push(log.memberId);
    if (Array.isArray(log.memberIds) && log.memberIds.length > 0) {
      log.memberIds.forEach((id) => targetMemberIds.push(id));
    }

    if (log.receiptNumber) {
      await supabase
        .from('cards')
        .update({
          payment_status: 'NONE',
          claim_status: 'NOT_APPLICABLE',
          updated_at: new Date().toISOString(),
        })
        .eq('receipt_number', log.receiptNumber);

      const [rcptRes, cardRes] = await Promise.allSettled([
        supabase
          .from('receipts')
          .select('member_ids, member_id')
          .eq('id', log.receiptNumber)
          .maybeSingle(),
        supabase
          .from('cards')
          .select('member_id')
          .eq('receipt_number', log.receiptNumber),
      ]);

      if (rcptRes.status === 'fulfilled' && rcptRes.value.data) {
        const r = rcptRes.value.data;
        if (r.member_id) targetMemberIds.push(r.member_id);
        if (Array.isArray(r.member_ids)) {
          r.member_ids.forEach((id: string) => targetMemberIds.push(id));
        }
      }
      if (cardRes.status === 'fulfilled' && cardRes.value.data) {
        cardRes.value.data.forEach((c: any) => {
          if (c.member_id) targetMemberIds.push(c.member_id);
        });
      }
    }

    const uniqueMemberIds = Array.from(new Set(targetMemberIds)).filter(
      Boolean
    );
    if (uniqueMemberIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('members')
        .select('id, member_id')
        .or(
          `member_id.in.(${uniqueMemberIds.map((id) => `"${id}"`).join(',')}),id.in.(${uniqueMemberIds.map((id) => `"${id}"`).join(',')})`
        );

      const allPossibleIds = Array.from(
        new Set([
          ...uniqueMemberIds,
          ...(memberRows || []).map((m: any) => m.id),
          ...(memberRows || []).map((m: any) => m.member_id),
        ])
      ).filter(Boolean);

      await supabase
        .from('cards')
        .update({
          payment_status: 'NONE',
          claim_status: 'NOT_APPLICABLE',
          updated_at: new Date().toISOString(),
        })
        .in('member_id', allPossibleIds);

      await supabase
        .from('member_cards')
        .update({
          payment_status: 'NONE',
          deleted_at: new Date().toISOString(),
        })
        .in('member_id', allPossibleIds);
    }

    window.dispatchEvent(new CustomEvent('member-refresh'));
    window.dispatchEvent(new CustomEvent('cards-refresh'));
  };

  const reactivateCardsForLogRecord = async (log: LogRecord) => {
    const isCard =
      log.customerType === 'Card' ||
      String(log.categoryOrPlan || '')
        .toLowerCase()
        .includes('card');
    if (!isCard) return;

    const targetMemberIds: string[] = [];
    if (log.memberId) targetMemberIds.push(log.memberId);
    if (Array.isArray(log.memberIds) && log.memberIds.length > 0) {
      log.memberIds.forEach((id) => targetMemberIds.push(id));
    }

    if (log.receiptNumber) {
      await supabase
        .from('cards')
        .update({
          status: 'Active',
          payment_status: 'PAID',
          claim_status: 'UNCLAIMED',
          updated_at: new Date().toISOString(),
        })
        .eq('receipt_number', log.receiptNumber);

      const [rcptRes, cardRes] = await Promise.allSettled([
        supabase
          .from('receipts')
          .select('member_ids, member_id')
          .eq('id', log.receiptNumber)
          .maybeSingle(),
        supabase
          .from('cards')
          .select('member_id')
          .eq('receipt_number', log.receiptNumber),
      ]);

      if (rcptRes.status === 'fulfilled' && rcptRes.value.data) {
        const r = rcptRes.value.data;
        if (r.member_id) targetMemberIds.push(r.member_id);
        if (Array.isArray(r.member_ids)) {
          r.member_ids.forEach((id: string) => targetMemberIds.push(id));
        }
      }
      if (cardRes.status === 'fulfilled' && cardRes.value.data) {
        cardRes.value.data.forEach((c: any) => {
          if (c.member_id) targetMemberIds.push(c.member_id);
        });
      }
    }

    const uniqueMemberIds = Array.from(new Set(targetMemberIds)).filter(
      Boolean
    );
    if (uniqueMemberIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('members')
        .select('id, member_id')
        .or(
          `member_id.in.(${uniqueMemberIds.map((id) => `"${id}"`).join(',')}),id.in.(${uniqueMemberIds.map((id) => `"${id}"`).join(',')})`
        );

      const allPossibleIds = Array.from(
        new Set([
          ...uniqueMemberIds,
          ...(memberRows || []).map((m: any) => m.id),
          ...(memberRows || []).map((m: any) => m.member_id),
        ])
      ).filter(Boolean);

      await supabase
        .from('cards')
        .update({
          status: 'Active',
          payment_status: 'PAID',
          claim_status: 'UNCLAIMED',
          updated_at: new Date().toISOString(),
        })
        .in('member_id', allPossibleIds);

      await supabase
        .from('member_cards')
        .update({
          status: 'Active',
          payment_status: 'PAID',
          deleted_at: null,
        })
        .in('member_id', allPossibleIds);
    }

    window.dispatchEvent(new CustomEvent('member-refresh'));
    window.dispatchEvent(new CustomEvent('cards-refresh'));
  };

  const handleConfirmDelete = useCallback(
    async (id: string) => {
      const stagedLog = stagedDeletionsRef.current.find(
        (l) => String(l.id) === String(id)
      );
      if (!stagedLog) return;

      try {
        const { error } = await supabase
          .from('attendance')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user?.id || null,
          })
          .eq('id', stagedLog.id);

        if (error) throw error;

        await deactivateCardsForLogRecord(stagedLog);

        toast.success(
          `Record for "${stagedLog.customerName}" moved to Recycle Bin.`
        );

        await logAudit(
          'LOGBOOK_REMOVED',
          `Moved check-in / card record for "${stagedLog.customerName}" (${stagedLog.customerType} - ${stagedLog.categoryOrPlan}, ₱${Number(stagedLog.amountPaid || 0).toFixed(2)}) to Recycle Bin.`,
          stagedLog.id
        );
      } catch (err: any) {
        console.error('Failed to commit deletion to database:', err);
        toast.error(
          err.message || 'Failed to move check-in log to Recycle Bin.'
        );
        setLogs((prev) => {
          const updated: LogRecord[] = [
            stagedLog,
            ...prev.filter((item) => String(item.id) !== String(id)),
          ].sort((a, b) => {
            const dateA = a.timestamp || '';
            const dateB = b.timestamp || '';
            return dateB.localeCompare(dateA);
          });
          sessionStorage.setItem(
            `logbook_sanitized_${dateStr}`,
            JSON.stringify(updated)
          );
          return updated;
        });
      } finally {
        setStagedDeletions((prev) =>
          prev.filter((item) => String(item.id) !== String(id))
        );
      }
    },
    [user?.id, dateStr]
  );

  const handleUndoDelete = (id: string) => {
    const stagedLog = stagedDeletionsRef.current.find(
      (l) => String(l.id) === String(id)
    );
    if (!stagedLog) return;

    setDeletingIds((prev) => prev.filter((item) => item !== String(id)));
    setLogs((prev) => {
      const updated: LogRecord[] = [
        stagedLog,
        ...prev.filter((item) => String(item.id) !== String(id)),
      ].sort((a, b) => {
        const dateA = a.timestamp || '';
        const dateB = b.timestamp || '';
        return dateB.localeCompare(dateA);
      });
      sessionStorage.setItem(
        `logbook_sanitized_${dateStr}`,
        JSON.stringify(updated)
      );
      return updated;
    });

    reactivateCardsForLogRecord(stagedLog);

    setStagedDeletions((prev) =>
      prev.filter((item) => String(item.id) !== String(id))
    );
    toast.info(`Restored check-in for "${stagedLog.customerName}".`);
  };

  const handleConfirmAll = () => {
    if (stagedDeletionsRef.current.length === 0) return;
    const itemsToCommit = [...stagedDeletionsRef.current];
    itemsToCommit.forEach((log) => handleConfirmDelete(String(log.id)));
  };

  const handleUndoAll = () => {
    if (stagedDeletionsRef.current.length === 0) return;
    const itemsToRestore = [...stagedDeletionsRef.current];
    setDeletingIds([]);
    setLogs((prev) => {
      const existingIds = new Set(itemsToRestore.map((i) => String(i.id)));
      const filtered = prev.filter((item) => !existingIds.has(String(item.id)));
      const updated = [...itemsToRestore, ...filtered].sort((a, b) => {
        const dateA = a.timestamp || '';
        const dateB = b.timestamp || '';
        return dateB.localeCompare(dateA);
      });
      sessionStorage.setItem(
        `logbook_sanitized_${dateStr}`,
        JSON.stringify(updated)
      );
      return updated;
    });

    itemsToRestore.forEach((log) => {
      reactivateCardsForLogRecord(log);
    });

    setStagedDeletions([]);
    toast.info(`Restored all ${itemsToRestore.length} records.`);
  };

  const handleDeleteLog = async (log: LogRecord) => {
    if (isLocked) {
      toast.error(getLockReason('delete check-in records or alter revenue'));
      return;
    }

    if (!isLogDeletable(log)) {
      toast.error(
        getLogDeleteDisabledReason(log) ||
          'Locked: This check-in cannot be removed.'
      );
      return;
    }

    const strId = String(log.id);
    if (deletingIds.includes(strId)) return;

    setDeletingIds((prev) => [...prev, strId]);

    setTimeout(() => {
      setStagedDeletions((prev) => [...prev, log]);
      setLogs((prev) => {
        const updated: LogRecord[] = prev.filter(
          (item) => String(item.id) !== strId
        );
        sessionStorage.setItem(
          `logbook_sanitized_${dateStr}`,
          JSON.stringify(updated)
        );
        return updated;
      });
      setDeletingIds((prev) => prev.filter((id) => id !== strId));
    }, 380);
  };

  useEffect(() => {
    return () => {
      if (stagedDeletionsRef.current.length > 0) {
        stagedDeletionsRef.current.forEach((log) => {
          supabase
            .from('attendance')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: user?.id || null,
            })
            .eq('id', log.id)
            .then();

          deactivateCardsForLogRecord(log);
        });
      }
    };
  }, [user?.id]);

  useEffect(() => {
    const isActionLocked = isLocked || !isSessionOpen;
    const actionLockReason = !isSessionOpen
      ? 'Cash session is closed. Open a cash session to record new check-ins.'
      : getLockReason('create a new check-in');

    if (activePage === 'logbook') {
      setActions(
        <div className="flex items-center gap-2 sm:gap-2.5 animate-fade-in select-none">
          {/* ─── REDESIGNED TABLET TELEMETRY CAPSULE ─── */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-100/90 dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800 backdrop-blur-md shadow-xs select-none">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
                <DynamicBanknoteIcon trend={revenueTrend} />
              </div>
              <span className="font-heading font-black text-sm tracking-tight text-slate-900 dark:text-emerald-400">
                <AnimatedCurrency value={activeRevenue} trend={revenueTrend} />
              </span>
            </div>

            <div className="w-px h-4 bg-slate-300 dark:bg-zinc-700/80" />

            <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300">
              <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="font-heading font-bold text-xs tracking-wide">
                <AnimatedNumber value={activeCheckinsCount} />
                <span className="ml-1 text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-medium">
                  {activeCheckinsCount === 1 ? 'check-in' : 'check-ins'}
                </span>
              </span>
            </div>
          </div>

          {role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                if (!isSessionOpen) {
                  toast.warning(
                    'Recycle Bin is unavailable while the cash session is closed.'
                  );
                  return;
                }
                if (stagedDeletionsRef.current.length > 0) {
                  stagedDeletionsRef.current.forEach((log) =>
                    handleConfirmDelete(String(log.id))
                  );
                }
                setIsRecycleBinOpen(true);
              }}
              disabled={!isSessionOpen}
              title={
                !isSessionOpen
                  ? 'Recycle Bin is locked: Cash session is closed'
                  : 'Recycle Bin'
              }
              className={`h-10 px-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-100/80 dark:bg-zinc-900/80 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 text-xs font-heading font-bold tracking-wider uppercase flex items-center gap-2 transition-all shadow-xs ${
                !isSessionOpen
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer active:scale-95'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>RECYCLE BIN</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!isSessionOpen) {
                toast.warning(
                  'Cannot check in: Cash drawer session is closed.'
                );
                return;
              }
              if (isLocked) {
                toast.error(getLockReason('create a new check-in'));
                return;
              }
              setInitialSearchVal('');
              setIsCreateModalOpen(true);
            }}
            disabled={isActionLocked}
            title={isActionLocked ? actionLockReason : 'Create New Check-in'}
            className={`h-10 px-4 rounded-xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white text-xs font-heading font-black tracking-wider uppercase flex items-center gap-2 shadow-sm transition-all border border-white/10 ${
              isActionLocked
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer hover:shadow-md active:scale-95'
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>NEW CHECK-IN</span>
          </button>
        </div>
      );
    } else if (activePage === 'members') {
      setActions(
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
          <Button
            onClick={() =>
              window.dispatchEvent(new CustomEvent('trigger-member-print'))
            }
            variant="secondary"
            className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-red-500 shrink-0" />
            <span>PRINT MEMBER CARDS</span>
          </Button>

          {role === 'admin' && (
            /* MEMBERS RECYCLE BIN */
            <Button
              onClick={() => {
                if (!isSessionOpen) {
                  toast.warning(
                    'Recycle Bin is unavailable while the cash session is closed.'
                  );
                  return;
                }
                window.dispatchEvent(new CustomEvent('trigger-member-recycle'));
              }}
              disabled={!isSessionOpen}
              title={
                !isSessionOpen
                  ? 'Recycle Bin is locked: Cash session is closed'
                  : 'Recycle Bin'
              }
              variant="secondary"
              className={`py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 font-bold animate-fade-in whitespace-nowrap ${
                !isSessionOpen
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-500 shrink-0" />
              <span>RECYCLE BIN</span>
            </Button>
          )}

          {/* ENROLL MEMBER BUTTON */}
          <Button
            onClick={() => {
              if (!isSessionOpen) {
                toast.warning(
                  'Cannot enroll member: Cash drawer session is closed.'
                );
                return;
              }
              if (isLocked) return;
              window.dispatchEvent(new CustomEvent('trigger-member-wizard'));
            }}
            variant="primary"
            disabled={isActionLocked}
            title={
              !isSessionOpen
                ? 'Cash session is closed. Open a cash session to enroll members.'
                : isLocked
                  ? getLockReason(
                      'enroll new members or collect membership fees'
                    )
                  : 'Enroll New Member'
            }
            className={`py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 shadow-md animate-fade-in whitespace-nowrap ${
              isActionLocked
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer'
            }`}
          >
            <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
            <span>ENROLL MEMBER</span>
          </Button>
        </div>
      );
    }

    return () => {
      setActions(null);
    };
  }, [
    role,
    setActions,
    activePage,
    handleConfirmDelete,
    isSessionOpen,
    isLocked,
    getLockReason,
    activeRevenue,
    activeCheckinsCount,
    revenueTrend,
  ]);

  useEffect(() => {
    if (location.state && (location.state as any).refreshed) {
      sessionStorage.removeItem(`logbook_sanitized_${dateStr}`);
      fetchAttendanceFromSupabase(false);
    }
  }, [location.state, dateStr, fetchAttendanceFromSupabase]);

  const handleDragEnd = (_event: any, info: any, log: LogRecord) => {
    const swipeThreshold = 70;
    if (info.offset.x > swipeThreshold) {
      setSelectedReceiptLog(log);
      setIsReceiptModalOpen(true);
    } else if (info.offset.x < -swipeThreshold) {
      handleDeleteLog(log);
    }
  };

  const undoToastItems: UndoItem[] = useMemo(() => {
    return stagedDeletions.map((log) => ({
      id: String(log.id),
      title: `${log.customerName} (${log.categoryOrPlan || 'Daily Pass'})`,
      type: 'logbook',
      customerName: log.customerName,
      customerType: log.customerType,
      categoryOrPlan: log.categoryOrPlan,
      paymentMethod: log.paymentMethod,
      amount: Number(log.amountPaid || 0),
      timestamp: log.timestamp,
    }));
  }, [stagedDeletions]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in">
      <TabLoader isVisible={false} />

      {/* --- SCALED VERTICAL DESKTOP NAVIGATION TABS --- */}
      {role === 'admin' && (
        <div className="hidden lg:block">
          <AnimatePresence>
            {activePage === 'logbook' ? (
              <motion.button
                key="to-members-vertical"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 0.9, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                whileHover={{ scale: 1.05, opacity: 1 }}
                onClick={() => navigate('/members/list')}
                title="View Member Directory"
                className="group fixed right-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-l border-(--border-color) py-6 px-3.5 rounded-l-3xl shadow-2xl cursor-pointer flex flex-col items-center gap-3.5 z-45 transition-all hover:border-(--color-primary-light)/50 hover:bg-(--bg-card)"
              >
                <span className="[writing-mode:vertical-rl] font-heading text-xs font-black tracking-widest uppercase text-slate-400 group-hover:text-(--color-primary-light) transition-colors select-none">
                  MEMBERS
                </span>
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    ease: 'easeInOut',
                  }}
                >
                  <ChevronRight className="w-5 h-5 text-(--color-primary-light)" />
                </motion.div>
              </motion.button>
            ) : (
              <>
                <motion.button
                  key="to-logbook-vertical"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 0.9, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  whileHover={{ scale: 1.05, opacity: 1 }}
                  onClick={() => navigate('/logbook')}
                  title="View Attendance Logbook"
                  className="group fixed left-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-r border-(--border-color) py-6 px-3.5 rounded-r-3xl shadow-2xl cursor-pointer flex flex-col items-center gap-3.5 z-45 transition-all hover:border-(--color-primary-light)/50 hover:bg-(--bg-card)"
                >
                  <motion.div
                    animate={{ x: [0, -4, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      ease: 'easeInOut',
                    }}
                  >
                    <ChevronLeft className="w-5 h-5 text-(--color-primary-light)" />
                  </motion.div>
                  <span className="[writing-mode:vertical-rl] rotate-180 font-heading text-xs font-black tracking-widest uppercase text-slate-400 group-hover:text-(--color-primary-light) transition-colors select-none">
                    LOGBOOK
                  </span>
                </motion.button>

                <motion.button
                  key="to-plans-vertical"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 0.9, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  whileHover={{ scale: 1.05, opacity: 1 }}
                  onClick={() => navigate('/members/plans')}
                  title="View Membership Plans"
                  className="group fixed right-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-l border-(--border-color) py-6 px-3.5 rounded-l-3xl shadow-2xl cursor-pointer flex flex-col items-center gap-3.5 z-45 transition-all hover:border-(--color-primary-light)/50 hover:bg-(--bg-card)"
                >
                  <span className="[writing-mode:vertical-rl] font-heading text-xs font-black tracking-widest uppercase text-slate-400 group-hover:text-(--color-primary-light) transition-colors select-none">
                    PLANS
                  </span>
                  <motion.div
                    animate={{ x: [0, 4, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      ease: 'easeInOut',
                    }}
                  >
                    <ChevronRight className="w-5 h-5 text-(--color-primary-light)" />
                  </motion.div>
                </motion.button>
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* SLIDING TIMELINE CANVAS GRID SCROLLER */}
      <div className="relative w-full h-auto overflow-x-hidden grid grid-cols-1 items-start">
        {/* VIEW 1: LOGBOOK */}
        <div
          className={`w-full space-y-6 max-w-4xl mx-auto px-1.5 sm:px-8 pb-40 md:pb-12 ${
            activePage === 'logbook'
              ? 'h-auto'
              : 'h-0 overflow-hidden pointer-events-none'
          }`}
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform:
              activePage === 'logbook' ? 'none' : 'translate3d(-101%, 0, 0)',
            opacity: activePage === 'logbook' ? 1 : 0,
            pointerEvents: activePage === 'logbook' ? 'auto' : 'none',
            transition:
              'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)',
          }}
        >
          <TimelineBar
            currentWeekStart={currentWeekStart}
            onWeekStartChange={setCurrentWeekStart}
            selectedDayIndex={selectedDayIndex}
            onDayIndexChange={setSelectedDayIndex}
            searchQuery={ledgerSearch}
            onSearchQueryChange={setLedgerSearch}
            activeFilter={customerFilter}
            onFilterChange={setCustomerFilter}
            filterOptions={ATTENDANCE_FILTERS}
            paymentFilter={paymentFilter}
            onPaymentFilterChange={setPaymentFilter}
            paymentOptions={PAYMENT_FILTERS}
            role={role}
            searchPlaceholder="Search members, phone, QR, customer type..."
          />

          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {(() => {
                if (loadingLogs && logs.length === 0) {
                  return (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <TransactionSkeleton key={idx} />
                      ))}
                    </div>
                  );
                }

                if (totalItems === 0) {
                  const hasFilter =
                    ledgerSearch.trim() !== '' ||
                    customerFilter !== 'All' ||
                    paymentFilter !== 'All';
                  const isSelectedDayToday = isToday(selectedDate);

                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-(--border-color) p-12 text-center flex flex-col items-center justify-center bg-(--bg-card) shadow-xs animate-fade-in"
                    >
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-400 mb-4 animate-pulse">
                        {hasFilter ? (
                          <Search className="w-8 h-8" />
                        ) : (
                          <ClipboardList className="w-8 h-8" />
                        )}
                      </div>
                      <h3 className="font-heading text-sm text-(--color-text) tracking-wider uppercase">
                        {hasFilter
                          ? 'No check-ins match query'
                          : 'NO CHECK-INS RECORDED'}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 font-body">
                        {hasFilter
                          ? 'Try modifying your search keywords or reset category filters.'
                          : isSelectedDayToday
                            ? 'No check-ins recorded today. Click below to register attendance.'
                            : 'Attendance records and subscription log sheets are empty for this date.'}
                      </p>

                      {hasFilter ? (
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerSearch('');
                            setCustomerFilter('All');
                            setPaymentFilter('All');
                          }}
                          className="mt-4 px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          Clear Filters
                        </button>
                      ) : isSelectedDayToday ? (
                        <button
                          type="button"
                          disabled={isLocked || !isSessionOpen}
                          onClick={() => {
                            setInitialSearchVal('');
                            setIsCreateModalOpen(true);
                          }}
                          className={`mt-4 px-5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] text-white rounded-xl font-heading text-[11px] font-bold uppercase tracking-wider shadow-md transition-all flex items-center gap-2 ${
                            isLocked || !isSessionOpen
                              ? 'opacity-50 cursor-not-allowed'
                              : 'cursor-pointer hover:opacity-90 active:scale-95'
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                          <span>RECORD NEW CHECK-IN</span>
                        </button>
                      ) : null}
                    </motion.div>
                  );
                }

                // ─── PARTITION LOGS: ONGOING vs. ENDED SESSIONS (WITH TIMESTAMP WINDOW FALLBACK) ───
                const activeSessionId = activeSession?.id
                  ? String(activeSession.id)
                  : null;

                const ongoingLogs: LogRecord[] = [];
                const closedSessionGroups: {
                  session: SessionSummaryInfo;
                  records: LogRecord[];
                }[] = [];
                const closedMap = new Map<string, LogRecord[]>();

                paginatedLogs.forEach((log) => {
                  const logSid = (log as any).cash_session_id
                    ? String((log as any).cash_session_id)
                    : null;

                  // 1. If active session is open and log belongs to it -> MUST BE ONGOING (not contained)
                  if (
                    isSessionOpen &&
                    activeSessionId &&
                    logSid === activeSessionId
                  ) {
                    ongoingLogs.push(log);
                    return;
                  }

                  // 2. Check if log matches a closed session (via explicit ID OR timestamp window fallback)
                  const matchedClosedSession = mergedClosedSessions.find(
                    (cs) => {
                      if (logSid && String(cs.id) === logSid) return true;

                      // Timestamp window fallback:
                      if (log.timestamp && cs.opened_at && cs.closed_at) {
                        const t = new Date(log.timestamp).getTime();
                        const o = new Date(cs.opened_at).getTime();
                        const c = new Date(cs.closed_at).getTime();
                        return t >= o && t <= c;
                      }
                      return false;
                    }
                  );

                  if (matchedClosedSession) {
                    const sid = String(matchedClosedSession.id);
                    if (!closedMap.has(sid)) {
                      closedMap.set(sid, []);
                    }
                    closedMap.get(sid)!.push(log);
                  } else {
                    ongoingLogs.push(log);
                  }
                });

                closedMap.forEach((records, sid) => {
                  const sessionMeta = mergedClosedSessions.find(
                    (cs) => String(cs.id) === sid
                  );
                  if (sessionMeta) {
                    closedSessionGroups.push({ session: sessionMeta, records });
                  }
                });

                // Group ongoing logs by hour
                const ongoingHourlyGroups: {
                  label: string;
                  records: LogRecord[];
                }[] = [];
                ongoingLogs.forEach((log) => {
                  const rawTime = log.timestamp;
                  let hourLabel = 'Unknown Time';
                  if (rawTime) {
                    try {
                      hourLabel = format(parseISO(rawTime), 'hh:00 a');
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  const existing = ongoingHourlyGroups.find(
                    (g) => g.label === hourLabel
                  );
                  if (existing) {
                    existing.records.push(log);
                  } else {
                    ongoingHourlyGroups.push({
                      label: hourLabel,
                      records: [log],
                    });
                  }
                });

                const renderTimelineCard = (log: LogRecord) => {
                  const strId = String(log.id);
                  const isNew = strId === newlyAddedId;
                  const isDeleting = deletingIds.includes(strId);

                  return (
                    <motion.div
                      key={strId}
                      layout
                      initial={{
                        opacity: 0,
                        y: -15,
                        scale: 0.96,
                        boxShadow:
                          '0 0 0 2px rgba(16, 185, 129, 0.9), 0 0 20px rgba(16, 185, 129, 0.5)',
                      }}
                      animate={
                        isDeleting
                          ? {
                              opacity: 0,
                              scale: 0.92,
                              y: -5,
                              boxShadow:
                                '0 0 0 2px rgba(244, 63, 94, 0.9), 0 0 25px rgba(244, 63, 94, 0.6)',
                              filter: 'brightness(0.9)',
                            }
                          : {
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              boxShadow: isNew
                                ? '0 0 0 2px rgba(16, 185, 129, 0.9), 0 0 20px rgba(16, 185, 129, 0.4)'
                                : '0 0 0 0px rgba(0,0,0,0), 0 0 0px rgba(0,0,0,0)',
                            }
                      }
                      exit={{
                        opacity: 0,
                        scale: 0.9,
                        y: -10,
                        boxShadow:
                          '0 0 0 2px rgba(244, 63, 94, 0.9), 0 0 25px rgba(244, 63, 94, 0.6)',
                      }}
                      transition={{
                        layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                        boxShadow: {
                          duration: isDeleting ? 0.15 : 1.5,
                          ease: 'easeOut',
                        },
                        opacity: { duration: isDeleting ? 0.38 : 0.3 },
                      }}
                      className="rounded-2xl transition-all overflow-hidden"
                    >
                      <TimelineCard
                        mode="attendance"
                        data={log}
                        canDelete={isLogDeletable(log) && !isDeleting}
                        deleteDisabledReason={getLogDeleteDisabledReason(log)}
                        onSelectReceipt={(rec) => {
                          setSelectedReceiptLog(rec);
                          setIsReceiptModalOpen(true);
                        }}
                        onTriggerDelete={handleDeleteLog}
                        onTriggerCollectPayment={(record) => {
                          if (!isLogDeletable(record)) {
                            toast.error(
                              'Cannot collect payment: this record belongs to a closed cash session.'
                            );
                            return;
                          }
                          handleTriggerCollectPayment(record);
                        }}
                        onTriggerUndoPayment={(record) => {
                          if (!isLogDeletable(record)) {
                            toast.error(
                              'Cannot undo payment: this record belongs to a closed cash session.'
                            );
                            return;
                          }
                          handleTriggerUndoPayment(record);
                        }}
                        onDragEnd={handleDragEnd}
                      />
                    </motion.div>
                  );
                };

                return (
                  <div className="space-y-6">
                    {/* 1. ONGOING / UNGROUPED CARDS (ACTIVE SESSION) */}
                    {ongoingHourlyGroups.map((group) => (
                      <div
                        key={group.label}
                        className="space-y-4 font-body animate-fade-in"
                      >
                        <div className="flex items-center gap-3 select-none pt-2">
                          <div className="text-[9px] font-heading font-black tracking-widest text-slate-700 bg-slate-200 border border-slate-300 dark:text-white dark:bg-slate-800/90 dark:border-slate-600 px-3 py-1 rounded-full uppercase shrink-0">
                            {group.label}
                          </div>
                          <div className="h-px flex-1 bg-linear-to-r from-(--border-color) to-transparent" />
                        </div>

                        <div className="space-y-2.5">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {group.records.map(renderTimelineCard)}
                          </AnimatePresence>
                        </div>
                      </div>
                    ))}

                    {/* ─── SEPARATOR: ACTIVE VS ENDED SESSIONS ─── */}
                    {ongoingHourlyGroups.length > 0 &&
                      closedSessionGroups.length > 0 && (
                        <div className="flex items-center gap-3 pt-3 select-none">
                          <div className="text-[9px] font-heading font-black tracking-widest text-blue-700 bg-blue-100 border border-blue-300 dark:text-blue-300 dark:bg-blue-950/80 dark:border-blue-800/60 px-3 py-1 rounded-full uppercase shrink-0 flex items-center gap-1.5 shadow-xs">
                            <Lock className="w-3 h-3 text-blue-500" />
                            <span>
                              CLOSED SESSIONS ({closedSessionGroups.length})
                            </span>
                          </div>
                          <div className="h-px flex-1 bg-gradient-to-r from-blue-300/80 dark:from-blue-800/60 to-transparent" />
                        </div>
                      )}

                    {/* 2. CONTAINED CLOSED SESSION ACCORDIONS (DEFAULT COLLAPSED, BLUE) */}
                    {closedSessionGroups.map((group) => {
                      const totalRev = group.records.reduce((sum, r) => {
                        if (r.paymentStatus === 'Paid') {
                          return sum + (Number(r.amountPaid) || 0);
                        }
                        return sum;
                      }, 0);

                      return (
                        <ClosedSessionGroup
                          key={group.session.id}
                          session={group.session}
                          mode="attendance"
                          totalRevenue={totalRev}
                          itemCount={group.records.length}
                        >
                          {group.records.map(renderTimelineCard)}
                        </ClosedSessionGroup>
                      );
                    })}

                    {/* LAZY LOADING SENTINEL */}
                    {totalItems > 0 && (
                      <div
                        ref={loadMoreRef}
                        className="text-center text-xs text-slate-500 font-medium"
                      >
                        {visibleCount < totalItems ? (
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-[#161920]/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
                            <span className="text-[11px] text-slate-500 font-semibold">
                              Showing{' '}
                              <strong className="text-slate-900 dark:text-white font-bold">
                                {Math.min(visibleCount, totalItems)}
                              </strong>{' '}
                              of{' '}
                              <strong className="text-slate-900 dark:text-white font-bold">
                                {totalItems}
                              </strong>{' '}
                              records (Scroll down for more)
                            </span>
                            <button
                              type="button"
                              onClick={() => setVisibleCount(totalItems)}
                              className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer px-2 py-0.5"
                            >
                              Load All Records
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 font-medium">
                            ✓ All {totalItems} attendance records loaded for
                            this day.
                          </div>
                        )}
                      </div>
                    )}

                    {/* QUICK ACTION HORIZONTAL CHECK-IN BUTTON */}
                    <motion.button
                      whileHover={
                        isLocked || !isSessionOpen ? {} : { scale: 1.01 }
                      }
                      whileTap={
                        isLocked || !isSessionOpen ? {} : { scale: 0.98 }
                      }
                      type="button"
                      disabled={isLocked || !isSessionOpen}
                      onClick={() => {
                        setInitialSearchVal('');
                        setIsCreateModalOpen(true);
                      }}
                      className={`w-full py-3.5 px-4 rounded-2xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white font-heading font-black text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all duration-200 border border-white/10 group mt-4 select-none ${
                        isLocked || !isSessionOpen
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center group-hover:rotate-90 transition-transform duration-300 shrink-0">
                        <Plus className="w-4 h-4 text-white" />
                      </div>
                      <span>CREATE NEW CHECK-IN</span>
                    </motion.button>
                  </div>
                );
              })()}
            </AnimatePresence>
          </div>
        </div>

        {/* VIEW 2: MEMBERS */}
        {role === 'admin' && (
          <div
            className={`w-full pb-40 md:pb-12 max-w-full animate-fade-in ${
              activePage === 'members'
                ? 'h-auto'
                : 'h-0 overflow-hidden pointer-events-none'
            }`}
            style={{
              gridColumn: 1,
              gridRow: 1,
              transform:
                activePage === 'members' ? 'none' : 'translate3d(101%, 0, 0)',
              opacity: activePage === 'members' ? 1 : 0,
              pointerEvents: activePage === 'members' ? 'auto' : 'none',
              transition:
                'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)',
            }}
          >
            <MembersList hideHeaderActions={activePage !== 'members'} />
          </div>
        )}
      </div>

      {/* MODALS */}
      {isCreateModalOpen && (
        <LogbookRecordAttendance
          isOpen={isCreateModalOpen}
          initialSearch={initialSearchVal}
          onClose={() => {
            setIsCreateModalOpen(false);
            setInitialSearchVal('');
          }}
          onCheckInSuccess={handleCheckInSuccess}
        />
      )}

      {isReceiptModalOpen && selectedReceiptLog && (
        <OfficialReceipt
          isOpen={isReceiptModalOpen}
          onClose={() => {
            setSelectedReceiptLog(null);
            setIsReceiptModalOpen(false);
          }}
          data={(() => {
            const rawLog = selectedReceiptLog as any;
            const gcashFee = Number(
              rawLog.gcashFee ??
                rawLog.gcash_fee ??
                rawLog.gcashFeeApplied ??
                rawLog.gcash_fee_applied ??
                0
            );
            const cardFee = Number(
              rawLog.cardFee ?? rawLog.card_fee ?? rawLog.cardFeeApplied ?? 0
            );
            const totalPaid = Number(selectedReceiptLog.amountPaid || 0);
            const basePrice =
              rawLog.basePrice ??
              rawLog.base_price ??
              Math.max(0, totalPaid - gcashFee - cardFee);
            const gcashRefNo = String(
              rawLog.gcashRefNo ||
                rawLog.gcash_ref_no ||
                rawLog.gcashReference ||
                rawLog.referenceNumber ||
                rawLog.reference_number ||
                rawLog.paymentRef ||
                rawLog.payment_ref ||
                ''
            );

            const isCard =
              selectedReceiptLog.customerType === 'Card' ||
              (selectedReceiptLog.categoryOrPlan || '')
                .toLowerCase()
                .includes('card');
            const receiptNoClean =
              rawLog.receipt_number ||
              rawLog.receiptNumber ||
              rawLog.receipt_no ||
              rawLog.receiptNo ||
              selectedReceiptLog.id;

            return {
              receiptType:
                selectedReceiptLog.customerType === 'New Membership'
                  ? 'subscription'
                  : isCard
                    ? 'card'
                    : 'walkin',
              receiptNo: receiptNoClean,
              customerName: selectedReceiptLog.customerName || 'Walk-In Guest',
              planType: selectedReceiptLog.categoryOrPlan || 'Daily Pass',
              basePrice: isCard ? 0 : basePrice,
              gcashFee,
              cardFee: isCard ? totalPaid : cardFee,
              paymentMethod: selectedReceiptLog.paymentMethod,
              gcashRefNo,
              paymentRef:
                rawLog.receipt_number ||
                rawLog.receiptNumber ||
                rawLog.paymentRef ||
                gcashRefNo,
              transactionDate: selectedReceiptLog.timestamp,
              processedBy: 'WOLF PALOMAR STAFF',
            };
          })()}
        />
      )}

      {isRecycleBinOpen && (
        <LogbookRecycleBin
          isOpen={isRecycleBinOpen}
          onClose={() => setIsRecycleBinOpen(false)}
          onRestoreSuccess={() => {
            sessionStorage.removeItem(`logbook_sanitized_${dateStr}`);
            fetchAttendanceFromSupabase(true);
          }}
        />
      )}

      {/* CONSOLIDATED STACKABLE UNDO TOAST */}
      <UndoToast
        items={undoToastItems}
        duration={5}
        onUndoItem={handleUndoDelete}
        onConfirmItem={handleConfirmDelete}
        onUndoAll={handleUndoAll}
        onConfirmAll={handleConfirmAll}
      />

      {/* MOBILE STICKY BOTTOM BAR FOR LOGBOOK */}
      {activePage === 'logbook' &&
        createPortal(
          <div
            className={`md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-190 shadow-2xl transition-all duration-300 ease-in-out ${
              isNavFloatingOpen
                ? 'translate-y-24 opacity-0 pointer-events-none'
                : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <DynamicBanknoteIcon trend={revenueTrend} />
                <span className="text-[11px]">
                  <AnimatedCurrency
                    value={activeRevenue}
                    trend={revenueTrend}
                  />
                </span>
              </div>
              <span className="text-slate-300 dark:text-zinc-700">•</span>
              <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 truncate">
                <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] truncate">
                  <AnimatedNumber value={activeCheckinsCount} /> Check-ins
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {role === 'admin' && (
                <button
                  type="button"
                  disabled={!isSessionOpen}
                  onClick={() => {
                    if (!isSessionOpen) {
                      toast.warning(
                        'Recycle Bin is unavailable while the cash session is closed.'
                      );
                      return;
                    }
                    if (stagedDeletionsRef.current.length > 0) {
                      stagedDeletionsRef.current.forEach((log) =>
                        handleConfirmDelete(String(log.id))
                      );
                    }
                    setIsRecycleBinOpen(true);
                  }}
                  className={`w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center transition-all ${
                    !isSessionOpen
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-amber-500/20 cursor-pointer active:scale-95'
                  }`}
                  title={
                    !isSessionOpen
                      ? 'Recycle Bin is locked: Cash session is closed'
                      : 'Recycle Bin'
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                disabled={isLocked || !isSessionOpen}
                title={
                  !isSessionOpen
                    ? 'Cash session is closed. Open a cash session to record check-ins.'
                    : isLocked
                      ? getLockReason('record new check-in')
                      : 'Record New Check-In'
                }
                onClick={() => {
                  if (!isSessionOpen) {
                    toast.warning(
                      'Cannot check in: Cash drawer session is closed.'
                    );
                    return;
                  }
                  if (isLocked) return;
                  setInitialSearchVal('');
                  setIsCreateModalOpen(true);
                }}
                className={`h-9 px-3.5 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider shadow-md transition-all ${
                  isLocked || !isSessionOpen
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer active:scale-95'
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>CHECK-IN</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default LogbookPage;
