// src/pages/logbook/LogbookPage.tsx
import React, { useState, useEffect, useMemo, useContext, useRef, useCallback } from 'react';
import { 
  format, 
  startOfWeek, 
  addDays, 
  getDay,
  parseISO,
  isToday 
} from 'date-fns';
import { 
  Plus, 
  RotateCcw, 
  ClipboardList, 
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
  Users,
  Search,
  Printer,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence, animate, useMotionValue, useTransform } from 'framer-motion';
import { toast } from 'react-toastify';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';

// Supabase & Authentication Stores
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { supabase } from '../../lib/supabase/client';

// UI Helpers
import { Button } from '../../components/ui/Button';
import { UndoToast } from '../../components/ui/UndoToast'; 
import { TimelineBar } from '../../components/ui/TimelineBar';
import { TabLoader } from '../../components/ui/TabLoader'; 
import { HeaderActionsContext } from '../../routes';
import { LogbookRecordAttendance } from './components/LogbookRecordAttendance';
import { LogbookRecycleBin } from './components/LogbookRecycleBin';
import { LogbookReportCompiler } from './components/LogbookReportCompiler';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';

// Unified Official Receipt & TimelineCard
import { OfficialReceipt } from '../../components/ui/OfficialReceipt';
import { TimelineCard, type LogRecord } from '../../components/ui/TimelineCard';
import { MembersList } from '../members/MembersList';

// DYNAMIC BANKNOTE ICON WITH POPPING / EXPLODE EFFECT
const DynamicBanknoteIcon: React.FC<{ trend: 'increasing' | 'decreasing' | 'neutral' }> = ({ trend }) => {
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
                'drop-shadow(0 0 4px rgba(16,185,129,0.4))'
              ]
            }
          : trend === 'decreasing'
          ? {
              scale: [0.4, 1.55, 0.95, 1],
              rotate: [20, -8, 3, 0],
              opacity: [0, 1, 1, 1],
              filter: [
                'drop-shadow(0 0 0px rgba(239,68,68,0))',
                'drop-shadow(0 0 14px rgba(239,68,68,0.9))',
                'drop-shadow(0 0 4px rgba(239,68,68,0.4))'
              ]
            }
          : {
              scale: 1,
              rotate: 0,
              opacity: 1,
              filter: 'drop-shadow(0 0 0px rgba(0,0,0,0))'
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
const AnimatedCurrency: React.FC<{ value: number; trend?: 'increasing' | 'decreasing' | 'neutral' }> = ({ 
  value, 
  trend = 'neutral' 
}) => {
  const count = useMotionValue(value);
  const formatted = useTransform(count, (latest) => `₱${Number(latest).toFixed(2)}`);

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 1.0,
      ease: [0.16, 1, 0.3, 1]
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
          ? { scale: [1, 1.08, 1], color: ['#10b981', '#34d399', 'currentColor'] }
          : trend === 'decreasing'
          ? { scale: [1, 1.08, 1], color: ['#ef4444', '#f87171', 'currentColor'] }
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
  const rounded = useTransform(count, (latest) => Math.round(latest).toString());

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1]
    });
    return () => controls.stop();
  }, [value, count]);

  return <motion.span>{rounded}</motion.span>;
};

const ATTENDANCE_FILTERS = [
  { label: 'All', value: 'All' },
  { label: 'Walk-In', value: 'Walk-In' },
  { label: 'Member', value: 'Member' },
  { label: 'Subs', value: 'Subs' }
];

const PAYMENT_FILTERS = [
  { label: 'All Pay', value: 'All' },
  { label: 'Cash', value: 'Cash' },
  { label: 'GCash', value: 'GCash' }
];

const isLogDeletable = (log: LogRecord) => {
  if (
    log.isSubscription ||
    (log as any).deletable === false ||
    log.customerType === 'New Membership'
  ) {
    return false;
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const logDate = log.timestamp ? format(parseISO(log.timestamp), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  return logDate === todayStr;
};

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

export const LogbookPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setActions } = useContext(HeaderActionsContext);
  const { user, profile } = useAuthStore() as any;

  const role = useMemo<'admin' | 'staff'>(() => {
    if (isSuperAdmin(user?.email)) return 'admin';
    const userRole = profile?.role || user?.user_metadata?.role || user?.app_metadata?.role;
    return userRole?.toLowerCase() === 'admin' ? 'admin' : 'staff';
  }, [user, profile]);

  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);

  // Date selection states
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => getDay(new Date()));

  const selectedDate = useMemo(() => {
    return addDays(currentWeekStart, selectedDayIndex);
  }, [currentWeekStart, selectedDayIndex]);

  const dateStr = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);

  // Animation & Pending Delete states
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<LogRecord | null>(null);
  const pendingDeleteRef = useRef<LogRecord | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);

  // Pre-fill state passed from Scanner overlay
  const [initialSearchVal, setInitialSearchVal] = useState<string>('');

  const activePage = useMemo<'logbook' | 'members'>(() => {
    return location.pathname.startsWith('/members') ? 'members' : 'logbook';
  }, [location.pathname]);

  // ZERO-EGRESS SESSION CACHING WITH SANITIZED RPC
  const fetchAttendanceFromSupabase = useCallback(async (isBackground: boolean = false) => {
    try {
      const cacheKey = `logbook_sanitized_${dateStr}`;

      if (!isBackground) {
        const cachedSession = sessionStorage.getItem(cacheKey);
        if (cachedSession) {
          try {
            const parsed = JSON.parse(cachedSession);
            if (Array.isArray(parsed) && parsed.length >= 0) {
              setLogs(parsed);
              setLoadingLogs(false);
              return;
            }
          } catch (e) {
            console.error('Failed to parse cached logbook session:', e);
          }
        }
      }

      if (!isBackground) {
        setLoadingLogs(true);
      }

      const { data, error } = await supabase.rpc('get_sanitized_logbook', {
        target_date: dateStr
      });

      if (error) {
        console.error('Error executing get_sanitized_logbook RPC:', error);
        return;
      }

      const mappedLogs: LogRecord[] = (data || []).map((row: any) => ({
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
        paymentStatus: (row.payment_status === 'Promo' || row.payment_status === 'Unpaid' ? row.payment_status : 'Paid') as 'Paid' | 'Unpaid' | 'Promo',
        status: 'Active',
        isSubscription: Boolean(row.is_subscription),
        deletable: Boolean(row.deletable)
      }));

      setLogs(mappedLogs);
      sessionStorage.setItem(cacheKey, JSON.stringify(mappedLogs));

    } catch (err) {
      console.error('Logbook fetch error:', err);
    } finally {
      if (!isBackground) {
        setLoadingLogs(false);
      }
    }
  }, [dateStr]);

  useEffect(() => {
    fetchAttendanceFromSupabase(false);

    const channel = supabase
      .channel(`logbook_realtime_${dateStr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        sessionStorage.removeItem(`logbook_sanitized_${dateStr}`);
        fetchAttendanceFromSupabase(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts' }, () => {
        sessionStorage.removeItem(`logbook_sanitized_${dateStr}`);
        fetchAttendanceFromSupabase(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateStr, fetchAttendanceFromSupabase]);

  const [ledgerSearch, setLedgerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'All' | 'Walk-In' | 'Member' | 'Subs'>('All');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'GCash' | 'Card'>('All');
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  const [selectedReceiptLog, setSelectedReceiptLog] = useState<LogRecord | null>(null);

  const itemsPerPage = useResponsiveItemsPerPage();
  const [currentPage, setCurrentPage] = useState(1);

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
      const matchesSearch = q === '' ||
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
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedLogs = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredLogs, clampedPage, itemsPerPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const totalCollectedToday = useMemo(() => {
    return dayLogs.reduce((acc, log) => {
      if (log.paymentStatus === 'Paid') {
        return acc + (log.amountPaid || 0);
      }
      return acc;
    }, 0);
  }, [dayLogs]);

  const [revenueTrend, setRevenueTrend] = useState<'increasing' | 'decreasing' | 'neutral'>('neutral');
  const prevRevenueRef = useRef<number>(totalCollectedToday);

  useEffect(() => {
    if (totalCollectedToday > prevRevenueRef.current) {
      setRevenueTrend('increasing');
      const timer = setTimeout(() => {
        setRevenueTrend('neutral');
      }, 1800);
      prevRevenueRef.current = totalCollectedToday;
      return () => clearTimeout(timer);
    } else if (totalCollectedToday < prevRevenueRef.current) {
      setRevenueTrend('decreasing');
      const timer = setTimeout(() => {
        setRevenueTrend('neutral');
      }, 1800);
      prevRevenueRef.current = totalCollectedToday;
      return () => clearTimeout(timer);
    }
    prevRevenueRef.current = totalCollectedToday;
  }, [totalCollectedToday]);

  const newMembersCount = useMemo(() => {
    return dayLogs.filter((l: LogRecord) => l.customerType === 'New Membership' || l.isSubscription).length;
  }, [dayLogs]);

  // BROADCAST TO TOPBAR
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('logbook-kpi-update', {
        detail: {
          checkins: dayLogs.length,
          revenue: totalCollectedToday,
          newMembers: newMembersCount,
          revenueTrend
        }
      })
    );
  }, [dayLogs.length, totalCollectedToday, newMembersCount, revenueTrend]);

  const handleCheckInSuccess = (newLog: LogRecord) => {
    const normalizedLog: LogRecord = {
      ...newLog,
      id: String(newLog.id)
    };

    setNewlyAddedId(normalizedLog.id);
    setTimeout(() => setNewlyAddedId(null), 2500);

    setLogs(prev => {
      const updated: LogRecord[] = [normalizedLog, ...prev.filter(item => String(item.id) !== normalizedLog.id)];
      sessionStorage.setItem(`logbook_sanitized_${dateStr}`, JSON.stringify(updated));
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

    setCurrentWeekStart(prev => (prev.getTime() === todayWeekStart.getTime() ? prev : todayWeekStart));
    setSelectedDayIndex(prev => (prev === todayIndex ? prev : todayIndex));
    setCurrentPage(1);
  };

  const handleTriggerCollectPayment = (log: LogRecord) => {
    setLogs(prev => {
      const updated: LogRecord[] = prev.map(item => item.id === log.id ? { ...item, paymentStatus: 'Paid' as const } : item);
      sessionStorage.setItem(`logbook_sanitized_${dateStr}`, JSON.stringify(updated));
      return updated;
    });
    toast.success(`Payment logged for ${log.customerName}`);
  };

  const handleTriggerUndoPayment = (log: LogRecord) => {
    setLogs(prev => {
      const updated: LogRecord[] = prev.map(item => item.id === log.id ? { ...item, paymentStatus: 'Unpaid' as const } : item);
      sessionStorage.setItem(`logbook_sanitized_${dateStr}`, JSON.stringify(updated));
      return updated;
    });
    toast.info(`Undone payment. Set back to Unpaid.`);
  };

  // COMMITS THE DELETION TO SUPABASE AFTER 5 SECONDS OR UPON CONFIRMING / CLOSING TOAST
  const commitDelete = useCallback(async (targetLog: LogRecord | null) => {
    if (!targetLog) return;
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id || null 
        })
        .eq('id', targetLog.id);

      if (error) throw error;
      toast.success('Check-in log moved to Recycle Bin.');
    } catch (err: any) {
      console.error('Failed to commit deletion to database:', err);
      toast.error(err.message || 'Failed to move check-in log to Recycle Bin.');
      // Rollback to UI if server update fails
      setLogs(prev => {
        const updated: LogRecord[] = [targetLog, ...prev.filter(item => String(item.id) !== String(targetLog.id))].sort((a, b) => {
          const dateA = a.timestamp || '';
          const dateB = b.timestamp || '';
          return dateB.localeCompare(dateA);
        });
        sessionStorage.setItem(`logbook_sanitized_${dateStr}`, JSON.stringify(updated));
        return updated;
      });
    }
  }, [user?.id, dateStr]);

  const handleDeleteLog = async (log: LogRecord) => {
    if (!isLogDeletable(log)) {
      if (log.isSubscription || log.customerType === 'New Membership') {
        toast.error('Subscription transactions cannot be deleted from Logbook.');
      } else {
        toast.error('Only standard check-in logs recorded today can be deleted.');
      }
      return;
    }

    const strId = String(log.id);
    if (deletingIds.includes(strId)) return;

    // If another delete was pending, commit it immediately before processing next
    if (pendingDeleteRef.current && String(pendingDeleteRef.current.id) !== strId) {
      const priorLog = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      commitDelete(priorLog);
    }

    setDeletingIds(prev => [...prev, strId]);

    // Animate out, then start 5s undo countdown without updating Supabase yet
    setTimeout(() => {
      setLogs(prev => {
        const updated: LogRecord[] = prev.filter(item => String(item.id) !== strId);
        sessionStorage.setItem(`logbook_sanitized_${dateStr}`, JSON.stringify(updated));
        return updated;
      });

      setPendingDelete(log);
      pendingDeleteRef.current = log;
      setDeletingIds(prev => prev.filter(id => id !== strId));
      setShowUndoToast(true);
    }, 380);
  };

  // USER CLOSED TOAST OR 5 SECONDS EXPIRED -> COMMIT TO SUPABASE (MOVED TO RECYCLE BIN)
  const confirmDelete = () => {
    const logToCommit = pendingDeleteRef.current || pendingDelete;
    setPendingDelete(null);
    pendingDeleteRef.current = null;
    setShowUndoToast(false);

    if (logToCommit) {
      commitDelete(logToCommit);
    }
  };

  // USER CLICKED UNDO IN TOAST -> RESTORE LOCALLY WITHOUT WRITING TO SUPABASE
  const undoDelete = () => {
    const logToRestore = pendingDeleteRef.current || pendingDelete;
    if (!logToRestore) return;

    const strId = String(logToRestore.id);
    setDeletingIds(prev => prev.filter(id => id !== strId));
    setLogs(prev => {
      const updated: LogRecord[] = [logToRestore, ...prev.filter(item => String(item.id) !== strId)].sort((a, b) => {
        const dateA = a.timestamp || '';
        const dateB = b.timestamp || '';
        return dateB.localeCompare(dateA);
      });
      sessionStorage.setItem(`logbook_sanitized_${dateStr}`, JSON.stringify(updated));
      return updated;
    });

    setPendingDelete(null);
    pendingDeleteRef.current = null;
    setShowUndoToast(false);
    toast.info('Check-in record restored.');
  };

  // Commit on unmount if user navigates away while delete is pending
  useEffect(() => {
    return () => {
      if (pendingDeleteRef.current) {
        commitDelete(pendingDeleteRef.current);
      }
    };
  }, [commitDelete]);

  useEffect(() => {
    if (activePage === 'logbook') {
      setActions(
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
          {role === 'admin' && (
            <>
              <Button
                onClick={() => {
                  // If delete is pending when opening bin, commit it so it shows
                  if (pendingDeleteRef.current) {
                    confirmDelete();
                  }
                  setIsRecycleBinOpen(true);
                }}
                variant="secondary"
                className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-500 shrink-0" />
                <span>RECYCLE BIN</span>
              </Button>

              <Button
                onClick={() => setIsReportModalOpen(true)}
                variant="secondary"
                className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>GENERATE REPORT</span>
              </Button>
            </>
          )}

          <Button
            onClick={() => {
              setInitialSearchVal('');
              setIsCreateModalOpen(true);
            }}
            variant="primary"
            className="hidden md:flex py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs items-center gap-1 lg:gap-1.5 shadow-md cursor-pointer animate-fade-in whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
            <span>NEW CHECK-IN</span>
          </Button>
        </div>
      );
    } else if (activePage === 'members') {
      setActions(
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
          <Button
            onClick={() => window.dispatchEvent(new CustomEvent('trigger-member-print'))}
            variant="secondary"
            className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-red-500 shrink-0" />
            <span>PRINT MEMBER CARDS</span>
          </Button>

          {role === 'admin' && (
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('trigger-member-recycle'))}
              variant="secondary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-500 shrink-0" />
              <span>RECYCLE BIN</span>
            </Button>
          )}

          <Button
            onClick={() => window.dispatchEvent(new CustomEvent('trigger-member-wizard'))}
            variant="primary"
            className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 shadow-md cursor-pointer animate-fade-in whitespace-nowrap"
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
  }, [role, setActions, activePage]);

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
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
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
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
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
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
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
            activePage === 'logbook' ? 'h-auto' : 'h-0 overflow-hidden pointer-events-none'
          }`}
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform: activePage === 'logbook' ? 'none' : 'translate3d(-101%, 0, 0)',
            opacity: activePage === 'logbook' ? 1 : 0,
            pointerEvents: activePage === 'logbook' ? 'auto' : 'none',
            transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
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

                const hourlyGroups: { label: string; records: LogRecord[] }[] = [];
                
                paginatedLogs.forEach(log => {
                  const rawTime = log.timestamp;
                  let hourLabel = 'Unknown Time';
                  if (rawTime) {
                    try {
                      hourLabel = format(parseISO(rawTime), 'hh:00 a');
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  const existingGroup = hourlyGroups.find(g => g.label === hourLabel);
                  if (existingGroup) {
                    existingGroup.records.push(log);
                  } else {
                    hourlyGroups.push({ label: hourLabel, records: [log] });
                  }
                });

                if (totalItems === 0) {
                  const hasFilter = ledgerSearch.trim() !== '' || customerFilter !== 'All' || paymentFilter !== 'All';
                  const isSelectedDayToday = isToday(selectedDate);

                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-(--border-color) p-12 text-center flex flex-col items-center justify-center bg-(--bg-card) shadow-xs animate-fade-in"
                    >
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-455 dark:text-zinc-655 mb-4 animate-pulse">
                        {hasFilter ? <Search className="w-8 h-8" /> : <ClipboardList className="w-8 h-8" />}
                      </div>
                      <h3 className="font-heading text-sm text-(--color-text) tracking-wider uppercase">
                        {hasFilter ? 'No check-ins match query' : 'NO CHECK-INS RECORDED'}
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
                          onClick={() => {
                            setInitialSearchVal('');
                            setIsCreateModalOpen(true);
                          }}
                          className="mt-4 px-5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] text-white rounded-xl font-heading text-[11px] font-bold uppercase tracking-wider cursor-pointer shadow-md hover:opacity-90 transition-all flex items-center gap-2 active:scale-95"
                        >
                          <Plus className="w-4 h-4" />
                          <span>RECORD NEW CHECK-IN</span>
                        </button>
                      ) : null}
                    </motion.div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {hourlyGroups.map(group => (
                      <div key={group.label} className="space-y-4 font-body animate-fade-in">
                        <div className="flex items-center gap-3 select-none pt-2">
                          <div className="text-[9px] font-heading font-black tracking-widest text-slate-700 bg-slate-200 border border-slate-300 dark:text-white dark:bg-slate-800/90 dark:border-slate-600 px-3 py-1 rounded-full uppercase shrink-0">
                            {group.label}
                          </div>
                          <div className="h-px flex-1 bg-linear-to-r from-(--border-color) to-transparent" />
                        </div>

                        <div className="space-y-2.5">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {group.records.map((log) => {
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
                                    boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.9), 0 0 20px rgba(16, 185, 129, 0.5)" 
                                  }}
                                  animate={isDeleting ? {
                                    opacity: 0,
                                    scale: 0.92,
                                    y: -5,
                                    boxShadow: "0 0 0 2px rgba(244, 63, 94, 0.9), 0 0 25px rgba(244, 63, 94, 0.6)",
                                    filter: "brightness(0.9)"
                                  } : {
                                    opacity: 1, 
                                    y: 0, 
                                    scale: 1,
                                    boxShadow: isNew 
                                      ? "0 0 0 2px rgba(16, 185, 129, 0.9), 0 0 20px rgba(16, 185, 129, 0.4)" 
                                      : "0 0 0 0px rgba(0,0,0,0), 0 0 0px rgba(0,0,0,0)"
                                  }}
                                  exit={{ 
                                    opacity: 0, 
                                    scale: 0.9,
                                    y: -10,
                                    boxShadow: "0 0 0 2px rgba(244, 63, 94, 0.9), 0 0 25px rgba(244, 63, 94, 0.6)"
                                  }}
                                  transition={{ 
                                    layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                                    boxShadow: { duration: isDeleting ? 0.15 : 1.5, ease: "easeOut" },
                                    opacity: { duration: isDeleting ? 0.38 : 0.3 }
                                  }}
                                  className="rounded-2xl transition-all overflow-hidden"
                                >
                                  <TimelineCard
                                    mode="attendance"
                                    data={log}
                                    canDelete={isLogDeletable(log) && !isDeleting}
                                    onSelectReceipt={(rec) => {
                                      setSelectedReceiptLog(rec);
                                      setIsReceiptModalOpen(true);
                                    }}
                                    onTriggerDelete={handleDeleteLog}
                                    onTriggerCollectPayment={handleTriggerCollectPayment}
                                    onTriggerUndoPayment={handleTriggerUndoPayment}
                                    onDragEnd={handleDragEnd}
                                  />
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </div>
                    ))}

                    {/* ─── QUICK ACTION HORIZONTAL CHECK-IN BUTTON ─── */}
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => {
                        setInitialSearchVal('');
                        setIsCreateModalOpen(true);
                      }}
                      className="w-full py-3.5 px-4 rounded-2xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white font-heading font-black text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer border border-white/10 group mt-4 select-none"
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

          {/* Pagination controls */}
          {totalItems > 0 && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-1 py-2 text-xs font-body animate-fade-in">
              <span className="text-slate-500">
                Showing <span className="font-semibold text-(--color-text)">{startIndex + 1}</span> to{' '}
                <span className="font-semibold text-(--color-text)">{Math.min(startIndex + itemsPerPage, totalItems)}</span> of{' '}
                <span className="font-semibold text-(--color-text)">{totalItems}</span> entries
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={clampedPage === 1}
                  className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center h-7 w-7"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`h-7 w-7 rounded-lg font-mono font-bold transition-all cursor-pointer text-[10px] ${
                      clampedPage === page
                        ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                        : 'border border-(--border-color) text-slate-700 dark:text-slate-355 hover:bg-slate-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={clampedPage === totalPages}
                  className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center h-7 w-7"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* VIEW 2: MEMBERS */}
        {role === 'admin' && (
          <div 
            className={`w-full pb-40 md:pb-12 max-w-full animate-fade-in ${
              activePage === 'members' ? 'h-auto' : 'h-0 overflow-hidden pointer-events-none'
            }`}
            style={{
              gridColumn: 1,
              gridRow: 1,
              transform: activePage === 'members' ? 'none' : 'translate3d(101%, 0, 0)',
              opacity: activePage === 'members' ? 1 : 0,
              pointerEvents: activePage === 'members' ? 'auto' : 'none',
              transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
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
              rawLog.gcashFee ?? rawLog.gcash_fee ?? rawLog.gcashFeeApplied ?? rawLog.gcash_fee_applied ?? 0
            );
            const cardFee = Number(
              rawLog.cardFee ?? rawLog.card_fee ?? rawLog.cardFeeApplied ?? 0
            );
            const totalPaid = Number(selectedReceiptLog.amountPaid || 0);
            const basePrice = rawLog.basePrice ?? rawLog.base_price ?? Math.max(0, totalPaid - gcashFee - cardFee);
            const gcashRefNo = String(
              rawLog.gcashRefNo || rawLog.gcash_ref_no || rawLog.gcashReference || rawLog.referenceNumber || rawLog.reference_number || rawLog.paymentRef || rawLog.payment_ref || ''
            );

            return {
              receiptType: selectedReceiptLog.customerType === 'New Membership' ? 'subscription' : 'walkin',
              receiptNo: rawLog.receipt_no || rawLog.receiptNo || selectedReceiptLog.id,
              customerName: selectedReceiptLog.customerName || 'Walk-In Guest',
              planType: selectedReceiptLog.categoryOrPlan || 'Daily Pass',
              basePrice,
              gcashFee,
              cardFee,
              paymentMethod: selectedReceiptLog.paymentMethod,
              gcashRefNo,
              paymentRef: rawLog.paymentRef || rawLog.payment_ref || gcashRefNo,
              transactionDate: selectedReceiptLog.timestamp,
              processedBy: 'WOLF PALOMAR STAFF'
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

      {isReportModalOpen && (
        <LogbookReportCompiler
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          logs={logs}
        />
      )}

      {/* CONFIRMATION NOTIFIER (5-SECOND UNDO WINDOW) */}
      <div className="fixed bottom-40 md:bottom-28 lg:bottom-8 left-1/2 -translate-x-1/2 z-3000 flex flex-col gap-2 w-[calc(100vw-24px)] md:w-auto items-center pointer-events-none">
        <AnimatePresence mode="popLayout">
          {pendingDelete && (
            <UndoToast
              isOpen={showUndoToast}
              message={`Removing check-in transaction for "${pendingDelete.customerName}"...`}
              duration={5}
              onConfirm={confirmDelete}
              onUndo={undoDelete}
              onClose={confirmDelete}
            />
          )}
        </AnimatePresence>
      </div>

      {/* MOBILE STICKY BOTTOM BAR FOR LOGBOOK */}
      {activePage === 'logbook' && createPortal(
        <div className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-190 shadow-2xl">
          <div className="flex items-center gap-2.5 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <DynamicBanknoteIcon trend={revenueTrend} />
              <span className="text-[11px]">
                <AnimatedCurrency value={totalCollectedToday} trend={revenueTrend} />
              </span>
            </div>
            <span className="text-slate-300 dark:text-zinc-700">•</span>
            <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 truncate">
              <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-[11px] truncate">
                <AnimatedNumber value={dayLogs.length} /> Check-ins
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {role === 'admin' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingDeleteRef.current) {
                      confirmDelete();
                    }
                    setIsRecycleBinOpen(true);
                  }}
                  className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                  title="Recycle Bin"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(true)}
                  className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                  title="Generate Report"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setInitialSearchVal('');
                setIsCreateModalOpen(true);
              }}
              className="h-9 px-3.5 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider shadow-md cursor-pointer active:scale-95 transition-all"
              title="Record New Check-In"
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