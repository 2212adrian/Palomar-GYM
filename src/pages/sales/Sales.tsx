// src/pages/sales/Sales.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useContext,
  useRef,
  useCallback,
} from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  format,
  startOfWeek,
  addDays,
  isToday,
  startOfDay,
  getDay,
  parseISO,
} from 'date-fns';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ShoppingBag,
  Printer,
  Search,
  Trash2,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';
import 'react-loading-skeleton/dist/skeleton.css';
import { createPortal } from 'react-dom';

// Supabase & Authentication Stores
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { getServerNow } from '../../lib/serverTime';
import { useAuthStore } from '../../stores/authStore';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useSessionLock } from '../../hooks/useSessionLock';
import { isSuperAdmin } from '../../constants/auth';

// UI Helpers
import { Button } from '../../components/ui/Button';
import { UndoToast, type UndoItem } from '../../components/ui/UndoToast';
import { TabLoader } from '../../components/ui/TabLoader';
import { TimelineBar } from '../../components/ui/TimelineBar';
import { HeaderActionsContext } from '../../routes';
import { SalesDialog } from './components/SalesDialog';
import { Products } from './Products';
import { SalesRecycleBin } from './components/SalesRecycleBin';
import {
  ClosedSessionGroup,
  type SessionSummaryInfo,
} from '../../components/ui/ClosedSessionGroup';
import { useNavbarStore } from '../../stores/useNavbarStore';

// Separated Modular Components
import { OfficialReceipt } from '../../components/ui/OfficialReceipt';

// Unified UI TimelineCard
import { TimelineCard } from '../../components/ui/TimelineCard';

// ─── DYNAMIC BANKNOTE ICON WITH POPPING / EXPLODE EFFECT ───
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

// ─── ANIMATED TICKER HELPERS ───
const AnimatedCurrency: React.FC<{ value: number }> = ({ value }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const controls = animate(prevValueRef.current, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        node.textContent = `₱${latest.toFixed(2)}`;
      },
      onComplete() {
        prevValueRef.current = value;
      },
    });

    return () => controls.stop();
  }, [value]);

  return <span ref={nodeRef}>₱{value.toFixed(2)}</span>;
};

const PAYMENT_FILTERS = [
  { label: 'All', value: 'All' },
  { label: 'Cash', value: 'Cash' },
  { label: 'GCash', value: 'GCash' },
];

// Formatter to produce clean human-readable product titles for the undo toast
const formatSalesToastTitle = (tx: any) => {
  if (tx.items && Array.isArray(tx.items) && tx.items.length > 0) {
    const itemsSummary = tx.items
      .map(
        (i: any) =>
          `${i.productName || i.product_name || 'Item'} (${i.quantity || 1}x)`
      )
      .join(', ');
    return itemsSummary;
  }
  return tx.product_name || 'Product';
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

export const Sales: React.FC = () => {
  const { setActions } = useContext(HeaderActionsContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { subview } = useParams<{ subview: string }>();

  const activeView = useMemo<'register' | 'inventory'>(() => {
    return subview === 'products' ? 'inventory' : 'register';
  }, [subview]);

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
    return profile?.role?.toLowerCase() === 'admin' ? 'admin' : 'staff';
  }, [user, profile]);

  // Session-based deletability check
  const isTransactionDeletable = useCallback(
    (tx: any) => {
      if (!isSessionOpen || !activeSession) return false;

      if (tx.cash_session_id) {
        return String(tx.cash_session_id) === String(activeSession.id);
      }

      if (tx.created_at && activeSession.opened_at) {
        return (
          new Date(tx.created_at).getTime() >=
          new Date(activeSession.opened_at).getTime()
        );
      }

      return false;
    },
    [isSessionOpen, activeSession]
  );

  const getDeleteDisabledReason = useCallback(
    (tx: any) => {
      if (!isSessionOpen) {
        return 'Cash session is closed. Open a cash session to manage sales.';
      }
      if (!isTransactionDeletable(tx)) {
        return 'Locked: This sale belongs to a closed cash session and cannot be removed.';
      }
      return undefined;
    },
    [isSessionOpen, isTransactionDeletable]
  );

  const handlePcViewTransition = (view: 'register' | 'inventory') => {
    if (view === 'inventory') {
      navigate('/sales/products');
    } else {
      navigate('/sales');
    }
  };

  useEffect(() => {
    if (role === 'staff' && activeView === 'inventory') {
      navigate('/sales', { replace: true });
    }
  }, [role, activeView, navigate]);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(getServerNow(), { weekStartsOn: 0 })
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() =>
    getDay(getServerNow())
  );

  const selectedDate = useMemo(() => {
    return addDays(currentWeekStart, selectedDayIndex);
  }, [currentWeekStart, selectedDayIndex]);

  const dateStr = useMemo(
    () => format(selectedDate, 'yyyy-MM-dd'),
    [selectedDate]
  );

  const [ledgerSearch, setLedgerSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'GCash'>(
    'All'
  );

  const [transactions, setTransactions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [ratesConfig, setRatesConfig] = useState<any>(null);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<any | null>(null);

  // Consolidated Stacked Deletion states
  const [stagedDeletions, setStagedDeletions] = useState<any[]>([]);
  const stagedDeletionsRef = useRef<any[]>([]);
  stagedDeletionsRef.current = stagedDeletions;

  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);

  const [selectedProductsCount, setSelectedProductsCount] = useState(0);

  const [showLiveScanner] = useState(false);
  const [, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Animation states
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  // Reset timeline filters to today's default helper
  const resetTimelineFilters = useCallback(() => {
    const today = getServerNow();
    const todayWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const todayIndex = getDay(today);

    setCurrentWeekStart(todayWeekStart);
    setSelectedDayIndex(todayIndex);
    setLedgerSearch('');
    setPaymentFilter('All');
  }, []);

  // Always reset timeline filters whenever user exits or changes views/pages
  useEffect(() => {
    resetTimelineFilters();
  }, [location.pathname, activeView, resetTimelineFilters]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      resetTimelineFilters();
    };
  }, [resetTimelineFilters]);

  useEffect(() => {
    if (showLiveScanner) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            if (!selectedCameraId) {
              setSelectedCameraId(devices[0].id);
            }
          }
        })
        .catch(console.warn);
    }
  }, [showLiveScanner]);

  useEffect(() => {
    if (role !== 'admin') return;

    const handleSalesSlide = (e: Event) => {
      const customEvent = e as CustomEvent<'register' | 'inventory'>;
      if (customEvent.detail === 'inventory') {
        navigate('/sales/products');
      } else {
        navigate('/sales');
      }
    };
    window.addEventListener('toggle-sales-view', handleSalesSlide);
    return () =>
      window.removeEventListener('toggle-sales-view', handleSalesSlide);
  }, [navigate, role]);

  useEffect(() => {
    const handleSelectionChange = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      setSelectedProductsCount(customEvent.detail);
    };
    window.addEventListener('product-selection-change', handleSelectionChange);
    return () => {
      window.removeEventListener(
        'product-selection-change',
        handleSelectionChange
      );
    };
  }, []);

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

  const fetchRatesConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('rates_config')
        .select('*')
        .eq('id', 1)
        .single();
      if (!error && data) {
        setRatesConfig(data);
      }
    } catch (err) {
      console.error('Error fetching rates_config:', err);
    }
  };

  // TRUE STALE-WHILE-REVALIDATE (SWR) SANITIZED RPC FETCHING
  const fetchTransactions = useCallback(
    async (isBackground: boolean = false) => {
      const cacheKey = `sales_sanitized_${dateStr}`;

      if (!isBackground) {
        const cachedSession = sessionStorage.getItem(cacheKey);
        if (cachedSession) {
          try {
            const parsed = JSON.parse(cachedSession);
            if (Array.isArray(parsed)) {
              setTransactions(parsed);
            }
          } catch (e) {
            console.error('Failed to parse cached sales session:', e);
          }
        } else {
          setLoadingTransactions(true);
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

        let freshTransactions: any[] | null = null;

        try {
          const { data, error } = await supabase.rpc('get_sanitized_sales', {
            target_date: dateStr,
          });

          if (!error && data) {
            freshTransactions = data.map((s: any) => ({
              ...s,
              cash_session_id: s.cash_session_id || null,
            }));
          } else if (error) {
            const isOfflineErr =
              error?.message?.includes('No internet connection') ||
              (typeof navigator !== 'undefined' && !navigator.onLine);
            if (!isOfflineErr) {
              console.warn(
                'RPC get_sanitized_sales fallback triggered:',
                error.message || error
              );
            }
          }
        } catch (rpcErr: any) {
          const isOfflineErr =
            rpcErr?.message?.includes('No internet connection') ||
            (typeof navigator !== 'undefined' && !navigator.onLine);
          if (!isOfflineErr) {
            console.warn('RPC get_sanitized_sales invocation error:', rpcErr);
          }
        }

        if (
          !freshTransactions &&
          (typeof navigator === 'undefined' || navigator.onLine)
        ) {
          try {
            const startOfDayIso = new Date(
              `${dateStr}T00:00:00+08:00`
            ).toISOString();
            const endOfDayIso = new Date(
              `${dateStr}T23:59:59.999+08:00`
            ).toISOString();

            const { data: salesData, error: salesErr } = await supabase
              .from('sales')
              .select('*')
              .is('deleted_at', null)
              .gte('created_at', startOfDayIso)
              .lte('created_at', endOfDayIso)
              .order('created_at', { ascending: false });

            if (!salesErr && salesData) {
              freshTransactions = salesData.map((s: any) => ({
                id: String(s.id),
                cash_session_id: s.cash_session_id || null,
                created_at: s.created_at,
                receipt_no: s.receipt_no || String(s.id),
                items: s.items || [],
                product_name: s.product_name || 'Multiple Items',
                payment_method: s.payment_method,
                amount_received: s.amount_received,
                change_calculated: s.change_calculated,
                total_amount: s.total_amount,
                gcash_fee_applied: s.gcash_fee_applied || 0,
                reference_number: s.reference_number,
              }));
            }
          } catch (directErr) {
            // Direct query failed
          }
        }

        if (freshTransactions) {
          setTransactions(freshTransactions);
          sessionStorage.setItem(cacheKey, JSON.stringify(freshTransactions));
        }
      } catch (err) {
        // General error guard
      } finally {
        if (!isBackground) {
          setLoadingTransactions(false);
        }
      }
    },
    [dateStr]
  );

  const fetchProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error loading products list:', err);
    }
  }, []);

  useEffect(() => {
    fetchRatesConfig();
    fetchProducts();
    fetchTransactions(false);

    const channelId = `sales_rt_${dateStr}_${Date.now()}`;
    const salesChannel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => {
          sessionStorage.removeItem(`sales_sanitized_${dateStr}`);
          fetchTransactions(true);
        }
      )
      .subscribe();

    const productsChannel = supabase
      .channel(`products_rt_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          fetchProducts();
        }
      )
      .subscribe();

    const sessionsChannel = supabase
      .channel(`sales_sessions_rt_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_sessions' },
        () => {
          sessionStorage.removeItem(`sales_sanitized_${dateStr}`);
          loadHistory();
          fetchTransactions(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(sessionsChannel);
    };
  }, [dateStr, fetchTransactions, fetchProducts, loadHistory]);

  const isTabSelectable = (date: Date) => {
    return startOfDay(date).getTime() <= startOfDay(new Date()).getTime();
  };

  useEffect(() => {
    const activeDate = addDays(currentWeekStart, selectedDayIndex);
    if (!isTabSelectable(activeDate)) {
      let fallbackIndex = 0;
      for (let i = 6; i >= 0; i--) {
        if (isTabSelectable(addDays(currentWeekStart, i))) {
          fallbackIndex = i;
          break;
        }
      }
      setSelectedDayIndex(fallbackIndex);
    }
  }, [currentWeekStart]);

  const dayTransactions = useMemo(() => transactions, [transactions]);

  const filteredDayTransactions = useMemo(() => {
    return dayTransactions.filter((t: any) => {
      const q = ledgerSearch.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        t.product_name?.toLowerCase().includes(q) ||
        t.receipt_no?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        t.payment_method?.toLowerCase().includes(q) ||
        t.reference_number?.toLowerCase().includes(q);

      let matchesFilter = true;
      if (paymentFilter === 'Cash') {
        matchesFilter =
          (t.payment_method || '').toLowerCase().includes('cash') &&
          !(t.payment_method || '').toLowerCase().includes('gcash');
      } else if (paymentFilter === 'GCash') {
        matchesFilter = (t.payment_method || '')
          .toLowerCase()
          .includes('gcash');
      }

      return matchesSearch && matchesFilter;
    });
  }, [dayTransactions, ledgerSearch, paymentFilter]);

  const totalItems = filteredDayTransactions.length;
  const [visibleCount, setVisibleCount] = useState<number>(25);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(25);
  }, [dateStr, ledgerSearch, paymentFilter]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          visibleCount < filteredDayTransactions.length
        ) {
          setVisibleCount((prev) =>
            Math.min(prev + 20, filteredDayTransactions.length)
          );
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    );

    observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [visibleCount, filteredDayTransactions.length]);

  const paginatedTransactions = useMemo(() => {
    return filteredDayTransactions.slice(0, visibleCount);
  }, [filteredDayTransactions, visibleCount]);

  // Active session transactions only (strictly 0 if session is closed)
  const activeSessionTransactions = useMemo(() => {
    if (!isSessionOpen || !activeSession) return [];
    return dayTransactions.filter((tx) => {
      const sid = tx.cash_session_id ? String(tx.cash_session_id) : null;
      if (sid && activeSession?.id) {
        return sid === String(activeSession.id);
      }
      if (tx.created_at && activeSession?.opened_at) {
        return (
          new Date(tx.created_at).getTime() >=
          new Date(activeSession.opened_at).getTime()
        );
      }
      return false;
    });
  }, [dayTransactions, isSessionOpen, activeSession]);

  const activeRevenue = useMemo(() => {
    return dayTransactions.reduce(
      (acc, t) => acc + (Number(t.total_amount) || 0),
      0
    );
  }, [dayTransactions]);

  const [revenueTrend, setRevenueTrend] = useState<
    'increasing' | 'decreasing' | 'neutral'
  >('neutral');
  const prevRevenueRef = useRef<number>(activeRevenue);

  useEffect(() => {
    if (activeRevenue > prevRevenueRef.current) {
      setRevenueTrend('increasing');
      const timer = setTimeout(() => {
        setRevenueTrend('neutral');
      }, 1500);
      prevRevenueRef.current = activeRevenue;
      return () => clearTimeout(timer);
    } else if (activeRevenue < prevRevenueRef.current) {
      setRevenueTrend('decreasing');
      const timer = setTimeout(() => {
        setRevenueTrend('neutral');
      }, 1500);
      prevRevenueRef.current = activeRevenue;
      return () => clearTimeout(timer);
    }
    prevRevenueRef.current = activeRevenue;
  }, [activeRevenue]);

  const activeSalesCount = useMemo(() => {
    return dayTransactions.length;
  }, [dayTransactions]);

  const activeItemsSold = useMemo(() => {
    return activeSessionTransactions.reduce((acc, tx) => {
      if (tx.items && Array.isArray(tx.items) && tx.items.length > 0) {
        return (
          acc +
          tx.items.reduce(
            (sum: number, item: any) => sum + (Number(item.quantity) || 0),
            0
          )
        );
      }
      return acc + (Number(tx.quantity) || 1);
    }, 0);
  }, [activeSessionTransactions]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('sales-kpi-update', {
        detail: {
          revenue: activeRevenue,
          salesCount: activeSalesCount,
          itemsSold: activeItemsSold,
          revenueTrend,
        },
      })
    );
  }, [activeRevenue, activeSalesCount, activeItemsSold, revenueTrend]);

  const handleSaleSuccess = async (newTx: any) => {
    try {
      const calculatedGcashFee =
        newTx.paymentMethod === 'GCash' ? ratesConfig?.gcash_fee || 10.0 : 0.0;

      const { data: insertedSale, error } = await supabase
        .from('sales')
        .insert([
          {
            items: newTx.items,
            product_name: newTx.productName,
            payment_method: newTx.paymentMethod,
            amount_received: newTx.amountReceived,
            change_calculated: newTx.changeCalculated,
            total_amount: newTx.totalAmount,
            gcash_fee_applied: calculatedGcashFee,
            reference_number:
              newTx.referenceNumber || newTx.reference_number || null,
            cash_session_id: activeSession?.id || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      if (insertedSale) {
        setNewlyAddedId(insertedSale.id);
        setTimeout(() => setNewlyAddedId(null), 2500);

        setTransactions((prev) => {
          const updated = [insertedSale, ...prev];
          sessionStorage.setItem(
            `sales_sanitized_${dateStr}`,
            JSON.stringify(updated)
          );
          return updated;
        });

        useCashSessionStore.getState().recalculateMetrics();
      }

      toast.success('Sale successfully recorded!');

      setLedgerSearch('');
      setPaymentFilter('All');

      const today = new Date();
      const todayWeekStart = startOfWeek(today, { weekStartsOn: 0 });
      const todayIndex = getDay(today);

      setCurrentWeekStart((prev) =>
        prev.getTime() === todayWeekStart.getTime() ? prev : todayWeekStart
      );
      setSelectedDayIndex((prev) => (prev === todayIndex ? prev : todayIndex));
      setVisibleCount(25);

      const itemsList =
        newTx.items
          ?.map(
            (i: any) => `${i.productName || i.product_name} (${i.quantity}x)`
          )
          .join(', ') || newTx.productName;
      const auditDetails = `Recorded sale: ₱${newTx.totalAmount.toFixed(2)} via ${newTx.paymentMethod} — Items: ${itemsList}`;

      logAudit('SALE_CREATED', auditDetails, insertedSale?.id || newTx.id)
        .then(() => fetchProducts())
        .catch(console.error);
    } catch (err: any) {
      console.error('Error saving sale transaction:', err);
      toast.error(
        err.message ||
          'Problem saving transaction. Please check your network connection.'
      );
      throw err;
    }
  };

  const handleDeleteTransaction = (tx: any) => {
    if (isLocked) {
      toast.error(getLockReason('delete sales records or alter revenue'));
      return;
    }

    if (!isTransactionDeletable(tx)) {
      toast.error(
        getDeleteDisabledReason(tx) || 'Locked: This sale cannot be removed.'
      );
      return;
    }

    const strId = String(tx.id);
    if (deletingIds.includes(strId)) return;

    setDeletingIds((prev) => [...prev, strId]);

    setTimeout(() => {
      setStagedDeletions((prev) => [...prev, tx]);
      setTransactions((prev) => {
        const updated = prev.filter((t) => String(t.id) !== strId);
        sessionStorage.setItem(
          `sales_sanitized_${dateStr}`,
          JSON.stringify(updated)
        );
        return updated;
      });
      setDeletingIds((prev) => prev.filter((id) => id !== strId));
    }, 380);
  };

  const handleConfirmDelete = useCallback(
    async (id: string) => {
      const stagedTx = stagedDeletionsRef.current.find(
        (t) => String(t.id) === String(id)
      );
      if (!stagedTx) return;

      try {
        const { error } = await supabase
          .from('sales')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', stagedTx.id);

        if (error) throw error;

        useCashSessionStore.getState().recalculateMetrics();

        const itemsList =
          stagedTx.items
            ?.map(
              (i: any) => `${i.productName || i.product_name} (${i.quantity}x)`
            )
            .join(', ') || stagedTx.product_name;
        const auditDetails = `Moved sale transaction (₱${Number(stagedTx.total_amount || stagedTx.totalAmount || 0).toFixed(2)} via ${stagedTx.payment_method || stagedTx.paymentMethod || 'Cash'}) to Recycle Bin — Items: ${itemsList}`;

        await logAudit('SALE_REMOVED', auditDetails, stagedTx.id);

        toast.success('Sale moved to Recycle Bin.');
      } catch (err: any) {
        console.error('Failed to commit sale deletion to database:', err);
        toast.error(
          err.message ||
            'There was a problem deleting this sale. Please try again.'
        );
        setTransactions((prev) => {
          const updated = [
            stagedTx,
            ...prev.filter((t) => String(t.id) !== String(id)),
          ].sort((a, b) => {
            const dateA = a.created_at || a.createdAt || '';
            const dateB = b.created_at || b.createdAt || '';
            return dateB.localeCompare(dateA);
          });
          sessionStorage.setItem(
            `sales_sanitized_${dateStr}`,
            JSON.stringify(updated)
          );
          return updated;
        });
      } finally {
        setStagedDeletions((prev) =>
          prev.filter((t) => String(t.id) !== String(id))
        );
        fetchProducts();
        useCashSessionStore.getState().recalculateMetrics();
      }
    },
    [dateStr, fetchProducts]
  );

  const handleUndoDelete = (id: string) => {
    const stagedTx = stagedDeletionsRef.current.find(
      (t) => String(t.id) === String(id)
    );
    if (!stagedTx) return;

    setDeletingIds((prev) => prev.filter((item) => item !== String(id)));
    setTransactions((prev) => {
      const updated = [
        stagedTx,
        ...prev.filter((t) => String(t.id) !== String(id)),
      ].sort((a, b) => {
        const dateA = a.created_at || a.createdAt || '';
        const dateB = b.created_at || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      sessionStorage.setItem(
        `sales_sanitized_${dateStr}`,
        JSON.stringify(updated)
      );
      return updated;
    });
    setStagedDeletions((prev) =>
      prev.filter((t) => String(t.id) !== String(id))
    );
    toast.info('Sale transaction restored.');
    useCashSessionStore.getState().recalculateMetrics();
  };

  const handleConfirmAll = () => {
    if (stagedDeletionsRef.current.length === 0) return;
    const itemsToCommit = [...stagedDeletionsRef.current];
    itemsToCommit.forEach((tx) => handleConfirmDelete(String(tx.id)));
  };

  const handleUndoAll = () => {
    if (stagedDeletionsRef.current.length === 0) return;
    const itemsToRestore = [...stagedDeletionsRef.current];
    setDeletingIds([]);
    setTransactions((prev) => {
      const existingIds = new Set(itemsToRestore.map((i) => String(i.id)));
      const filtered = prev.filter((item) => !existingIds.has(String(item.id)));
      const updated = [...itemsToRestore, ...filtered].sort((a, b) => {
        const dateA = a.created_at || a.createdAt || '';
        const dateB = b.created_at || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      sessionStorage.setItem(
        `sales_sanitized_${dateStr}`,
        JSON.stringify(updated)
      );
      return updated;
    });
    setStagedDeletions([]);
    toast.info(`Restored all ${itemsToRestore.length} sale transactions.`);
  };

  useEffect(() => {
    return () => {
      if (stagedDeletionsRef.current.length > 0) {
        stagedDeletionsRef.current.forEach((tx) => {
          supabase.from('sales').delete().eq('id', tx.id).then();
        });
      }
    };
  }, []);

  useEffect(() => {
    const isActionLocked = isLocked || !isSessionOpen;
    const actionLockReason = !isSessionOpen
      ? 'Cash session is closed. Open a cash session to record new sales.'
      : getLockReason('create new sales');

    if ((activeView as string) === 'register') {
      setActions(
        <div className="flex items-center gap-2 sm:gap-2.5 animate-fade-in">
          {role === 'admin' && (
            <>
              {/* ─── REDESIGNED TABLET TELEMETRY CAPSULE ─── */}
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-100/90 dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800 backdrop-blur-md shadow-xs select-none">
                {/* Banknote & Animated Amount */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
                    <DynamicBanknoteIcon trend={revenueTrend} />
                  </div>
                  <span className="font-heading font-black text-sm tracking-tight text-slate-900 dark:text-emerald-400">
                    <AnimatedCurrency value={activeRevenue} />
                  </span>
                </div>

                <div className="w-px h-4 bg-slate-300 dark:bg-zinc-700/80" />

                {/* Sales Counter */}
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="font-heading font-bold text-xs tracking-wide">
                    {activeSalesCount}
                    <span className="ml-1 text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-medium">
                      {activeSalesCount === 1 ? 'sale' : 'sales'}
                    </span>
                  </span>
                </div>
              </div>

              {/* RECYCLE BIN BUTTON */}
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
                    stagedDeletionsRef.current.forEach((tx) =>
                      handleConfirmDelete(String(tx.id))
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
            </>
          )}

          {/* NEW SALE CTA BUTTON */}
          <button
            type="button"
            onClick={() => {
              if (!isSessionOpen) {
                toast.warning(
                  'Cannot create new sale: Cash drawer session is closed.'
                );
                return;
              }
              if (isLocked) {
                toast.error(getLockReason('create new sales'));
                return;
              }
              setIsCreateModalOpen(true);
            }}
            disabled={isActionLocked}
            title={isActionLocked ? actionLockReason : 'Create New Sale'}
            className={`h-10 px-4 rounded-xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white text-xs font-heading font-black tracking-wider uppercase flex items-center gap-2 shadow-sm transition-all border border-white/10 ${
              isActionLocked
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer hover:shadow-md active:scale-95'
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>NEW SALE</span>
          </button>
        </div>
      );
    } else {
      if (selectedProductsCount > 0) {
        setActions(null);
      } else {
        setActions(
          <div className="flex flex-wrap items-center gap-1.5 lg:gap-3 w-full sm:w-auto justify-end animate-fade-in">
            {/* INVENTORY RECYCLE BIN */}
            <Button
              onClick={() => {
                if (!isSessionOpen) {
                  toast.warning(
                    'Recycle Bin is unavailable while the cash session is closed.'
                  );
                  return;
                }
                window.dispatchEvent(
                  new CustomEvent('trigger-product-recovery')
                );
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

            <Button
              onClick={() =>
                window.dispatchEvent(new CustomEvent('trigger-product-print'))
              }
              variant="secondary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-blue-500 shrink-0" />
              <span>PRINT SHEET LABELS</span>
            </Button>

            <Button
              onClick={() =>
                window.dispatchEvent(new CustomEvent('trigger-product-create'))
              }
              variant="primary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 w-auto! text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
              <span>ADD NEW ITEM</span>
            </Button>
          </div>
        );
      }
    }

    return () => setActions(null);
  }, [
    role,
    products,
    transactions,
    activeView,
    activeRevenue,
    activeSalesCount,
    ratesConfig,
    selectedProductsCount,
    setActions,
    handleConfirmDelete,
    isSessionOpen,
    isLocked,
    getLockReason,
  ]);

  const undoToastItems: UndoItem[] = useMemo(() => {
    return stagedDeletions.map((tx) => {
      const parsedItems =
        tx.items && Array.isArray(tx.items) && tx.items.length > 0
          ? tx.items.map((i: any) => ({
              name: i.productName || i.product_name || 'Item',
              qty: Number(i.quantity) || 1,
              price: Number(i.price) || 0,
            }))
          : [
              {
                name: tx.product_name || 'Item',
                qty: Number(tx.quantity) || 1,
                price: Number(tx.total_amount) || 0,
              },
            ];

      return {
        id: String(tx.id),
        title: formatSalesToastTitle(tx),
        type: 'sale',
        items: parsedItems,
        paymentMethod: tx.payment_method || tx.paymentMethod || 'Cash',
        amount: Number(tx.total_amount || 0),
        timestamp: tx.created_at || tx.createdAt,
        referenceNumber: tx.reference_number || tx.referenceNumber,
      };
    });
  }, [stagedDeletions]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in">
      <TabLoader isVisible={false} />

      {/* --- SLIM VERTICAL DESKTOP NAVIGATION TABS --- */}
      {role === 'admin' && (
        <div className="hidden lg:block">
          <AnimatePresence>
            {activeView === 'register' ? (
              <motion.button
                key="to-products-vertical"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 0.9, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                whileHover={{ scale: 1.05, opacity: 1 }}
                onClick={() => handlePcViewTransition('inventory')}
                title="View Product Inventory"
                className="group fixed right-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-l border-(--border-color) py-6 px-3.5 rounded-l-3xl shadow-2xl cursor-pointer flex flex-col items-center gap-3.5 z-45 transition-all hover:border-(--color-primary-light)/50 hover:bg-(--bg-card)"
              >
                <span className="[writing-mode:vertical-rl] font-heading text-xs font-black tracking-widest uppercase text-slate-400 group-hover:text-(--color-primary-light) transition-colors select-none">
                  PRODUCTS
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
              <motion.button
                key="to-register-vertical"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 0.9, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                whileHover={{ scale: 1.05, opacity: 1 }}
                onClick={() => handlePcViewTransition('register')}
                title="View Cashier Register"
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
                  SALES
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* --- TIMELINE CANVAS SCROLLER --- */}
      <div className="relative w-full h-auto overflow-x-hidden grid grid-cols-1 items-start">
        {/* VIEW 1: CASHIER REGISTER */}
        <div
          className={`w-full space-y-6 max-w-4xl mx-auto px-1.5 sm:px-8 pb-40 md:pb-12 animate-fade-in ${
            activeView === 'register'
              ? 'h-auto'
              : 'h-0 overflow-hidden pointer-events-none'
          }`}
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform:
              activeView === 'register' ? 'none' : 'translate3d(-101%, 0, 0)',
            opacity: activeView === 'register' ? 1 : 0,
            pointerEvents: activeView === 'register' ? 'auto' : 'none',
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
            paymentFilter={paymentFilter}
            onPaymentFilterChange={setPaymentFilter}
            paymentOptions={PAYMENT_FILTERS}
            role={role}
            searchPlaceholder="Search here (E.g. Name, Product, ID)"
          />

          {/* --- HOURLY LEDGER TIMELINE WITH CLOSED SESSION CONTAINERS --- */}
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {(() => {
                if (loadingTransactions && transactions.length === 0) {
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
                    ledgerSearch.trim() !== '' || paymentFilter !== 'All';
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
                          <ShoppingBag className="w-8 h-8" />
                        )}
                      </div>
                      <h3 className="font-heading text-sm text-(--color-text) tracking-wider uppercase">
                        {hasFilter
                          ? 'No sales match query'
                          : 'NO TRANSACTIONS LOGGED'}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 font-body">
                        {hasFilter
                          ? 'Try modifying your search keywords or clear search filter.'
                          : isSelectedDayToday
                            ? 'No purchases or entries recorded today. Click below to register a new sale.'
                            : 'No purchases or entries recorded for this date slot.'}
                      </p>

                      {hasFilter ? (
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerSearch('');
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
                          onClick={() => setIsCreateModalOpen(true)}
                          className={`mt-4 px-5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] text-white rounded-xl font-heading text-[11px] font-bold uppercase tracking-wider shadow-md transition-all flex items-center gap-2 ${
                            isLocked || !isSessionOpen
                              ? 'opacity-50 cursor-not-allowed'
                              : 'cursor-pointer hover:opacity-90 active:scale-95'
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                          <span>RECORD NEW SALE</span>
                        </button>
                      ) : null}
                    </motion.div>
                  );
                }

                // ─── PARTITION: ONGOING vs. CLOSED SESSION TRANSACTIONS (WITH TIMESTAMP WINDOW FALLBACK) ───
                const activeSessionId = activeSession?.id
                  ? String(activeSession.id)
                  : null;

                const ongoingTransactions: any[] = [];
                const closedSessionGroups: {
                  session: SessionSummaryInfo;
                  txs: any[];
                }[] = [];
                const closedGroupTracker = new Map<string, any[]>();

                paginatedTransactions.forEach((tx) => {
                  const sid = tx.cash_session_id
                    ? String(tx.cash_session_id)
                    : null;

                  // 1. If session is currently open and tx belongs to it -> Live / Ongoing (not contained)
                  if (
                    isSessionOpen &&
                    activeSessionId &&
                    sid === activeSessionId
                  ) {
                    ongoingTransactions.push(tx);
                    return;
                  }

                  // 2. Check if tx belongs to any closed session (by ID or timestamp window fallback)
                  const matchedClosedSession = mergedClosedSessions.find(
                    (cs) => {
                      if (sid && String(cs.id) === sid) return true;

                      // Timestamp window fallback:
                      const txTimeStr = tx.created_at || tx.createdAt;
                      if (txTimeStr && cs.opened_at && cs.closed_at) {
                        const t = new Date(txTimeStr).getTime();
                        const o = new Date(cs.opened_at).getTime();
                        const c = new Date(cs.closed_at).getTime();
                        return t >= o && t <= c;
                      }
                      return false;
                    }
                  );

                  if (matchedClosedSession) {
                    const csId = String(matchedClosedSession.id);
                    if (!closedGroupTracker.has(csId)) {
                      closedGroupTracker.set(csId, []);
                    }
                    closedGroupTracker.get(csId)!.push(tx);
                  } else {
                    ongoingTransactions.push(tx);
                  }
                });

                closedGroupTracker.forEach((txs, sid) => {
                  const sessionMeta = mergedClosedSessions.find(
                    (cs) => String(cs.id) === sid
                  );
                  if (sessionMeta) {
                    closedSessionGroups.push({ session: sessionMeta, txs });
                  }
                });

                // Group ongoing transactions by hour
                const ongoingHourlyGroups: { label: string; txs: any[] }[] = [];
                ongoingTransactions.forEach((tx) => {
                  const rawTime = tx.created_at || tx.createdAt;
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
                    existing.txs.push(tx);
                  } else {
                    ongoingHourlyGroups.push({ label: hourLabel, txs: [tx] });
                  }
                });

                const handleDragEnd = (_event: any, info: any, tx: any) => {
                  const swipeThreshold = 80;
                  if (info.offset.x > swipeThreshold) {
                    setSelectedReceiptTx(tx);
                  } else if (info.offset.x < -swipeThreshold) {
                    if (isTransactionDeletable(tx)) {
                      handleDeleteTransaction(tx);
                    } else {
                      toast.warning(
                        getDeleteDisabledReason(tx) ||
                          'Rollback Lock: This sale cannot be removed.'
                      );
                    }
                  }
                };

                const renderTimelineCard = (tx: any) => {
                  const isNew = tx.id === newlyAddedId;
                  const isDeleting = deletingIds.includes(tx.id);

                  return (
                    <motion.div
                      key={tx.id}
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
                        mode="sale"
                        data={tx}
                        canDelete={isTransactionDeletable(tx) && !isDeleting}
                        deleteDisabledReason={getDeleteDisabledReason(tx)}
                        onSelectReceipt={setSelectedReceiptTx}
                        onTriggerDelete={handleDeleteTransaction}
                        onDragEnd={handleDragEnd}
                      />
                    </motion.div>
                  );
                };

                return (
                  <div className="space-y-6">
                    {/* 1. ONGOING / LIVE TRANSACTIONS (NOT CONTAINED) */}
                    {ongoingHourlyGroups.map((group) => (
                      <div key={group.label} className="space-y-4">
                        <div className="flex items-center gap-3 select-none pt-2 animate-fade-in">
                          <div className="text-[9px] font-heading font-black tracking-widest text-slate-700 bg-slate-200 border border-slate-300 dark:text-white dark:bg-slate-800/90 dark:border-slate-600 px-3 py-1 rounded-full uppercase shrink-0">
                            {group.label}
                          </div>
                          <div className="h-px flex-1 bg-linear-to-r from-(--border-color) to-transparent" />
                        </div>

                        <div className="space-y-2.5">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {group.txs.map(renderTimelineCard)}
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

                    {/* 2. ENDED SESSION GROUPS (CONTAINED, DEFAULT COLLAPSED, BLUE) */}
                    {closedSessionGroups.map((group) => {
                      const totalRev = group.txs.reduce(
                        (sum, t) => sum + (Number(t.total_amount) || 0),
                        0
                      );

                      return (
                        <ClosedSessionGroup
                          key={group.session.id}
                          session={group.session}
                          mode="sale"
                          totalRevenue={totalRev}
                          itemCount={group.txs.length}
                        >
                          {group.txs.map(renderTimelineCard)}
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
                              sales records (Scroll down for more)
                            </span>
                            <button
                              type="button"
                              onClick={() => setVisibleCount(totalItems)}
                              className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer px-2 py-0.5"
                            >
                              Load All Sales
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 font-medium">
                            ✓ All {totalItems} sales records loaded for this
                            day.
                          </div>
                        )}
                      </div>
                    )}

                    {/* QUICK ACTION HORIZONTAL CREATE NEW SALE BUTTON */}
                    <motion.button
                      whileHover={
                        isLocked || !isSessionOpen ? {} : { scale: 1.01 }
                      }
                      whileTap={
                        isLocked || !isSessionOpen ? {} : { scale: 0.98 }
                      }
                      type="button"
                      disabled={isLocked || !isSessionOpen}
                      onClick={() => setIsCreateModalOpen(true)}
                      className={`w-full py-3.5 px-4 rounded-2xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white font-heading font-black text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all duration-200 border border-white/10 group mt-4 select-none ${
                        isLocked || !isSessionOpen
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center group-hover:rotate-90 transition-transform duration-300 shrink-0">
                        <Plus className="w-4 h-4 text-white" />
                      </div>
                      <span>CREATE NEW SALE</span>
                    </motion.button>
                  </div>
                );
              })()}
            </AnimatePresence>
          </div>
        </div>

        {/* --- VIEW 2: PRODUCTS INVENTORY --- */}
        {role === 'admin' && (
          <div
            className={`w-full pb-40 md:pb-12 max-w-full ${
              activeView === 'inventory'
                ? 'h-auto'
                : 'h-0 overflow-hidden pointer-events-none'
            }`}
            style={{
              gridColumn: 1,
              gridRow: 1,
              transform:
                activeView === 'inventory' ? 'none' : 'translate3d(101%, 0, 0)',
              opacity: activeView === 'inventory' ? 1 : 0,
              pointerEvents: activeView === 'inventory' ? 'auto' : 'none',
              transition:
                'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)',
            }}
          >
            <Products hideHeaderActions={true} />
          </div>
        )}
      </div>

      {/* CREATE TRANSACTION MODAL DIALOG */}
      {isCreateModalOpen && (
        <SalesDialog
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          products={products}
          onSaleSuccess={handleSaleSuccess}
        />
      )}

      {/* OFFICIAL RECEIPTS OVERLAY */}
      {selectedReceiptTx && (
        <OfficialReceipt
          isOpen={!!selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          data={{
            receiptType: 'sales',
            receiptNo: selectedReceiptTx.receipt_no || selectedReceiptTx.id,
            customerName: 'Customer',
            items: (selectedReceiptTx.items || []).map((item: any) => ({
              productName: item.productName || item.product_name,
              quantity: item.quantity,
              price: item.price,
            })),
            basePrice: selectedReceiptTx.items
              ? 0
              : Number(selectedReceiptTx.total_amount || 0),
            gcashFee: Number(selectedReceiptTx.gcash_fee_applied || 0),
            paymentMethod:
              selectedReceiptTx.payment_method ||
              selectedReceiptTx.paymentMethod ||
              'Cash',
            amountReceived:
              selectedReceiptTx.amount_received !== null &&
              selectedReceiptTx.amount_received !== undefined
                ? Number(selectedReceiptTx.amount_received)
                : undefined,
            changeDue: Number(selectedReceiptTx.change_calculated || 0),
            gcashRefNo:
              selectedReceiptTx.reference_number ||
              selectedReceiptTx.referenceNumber,
            transactionDate:
              selectedReceiptTx.created_at || selectedReceiptTx.createdAt,
            processedBy: 'Staff',
          }}
        />
      )}

      {/* DAILY RECYCLE BIN MODAL */}
      {isRecycleBinOpen && (
        <SalesRecycleBin
          isOpen={isRecycleBinOpen}
          onClose={() => setIsRecycleBinOpen(false)}
          products={products}
          onRestoreSuccess={() => {
            sessionStorage.removeItem(`sales_sanitized_${dateStr}`);
            fetchTransactions(true);
            fetchProducts();
          }}
        />
      )}

      {/* CONSOLIDATED STACKABLE UNDO TOAST (PAUSES ON HOVER/TOUCH + INNER ITEM ACTIONS) */}
      <UndoToast
        items={undoToastItems}
        duration={5}
        onUndoItem={handleUndoDelete}
        onConfirmItem={handleConfirmDelete}
        onUndoAll={handleUndoAll}
        onConfirmAll={handleConfirmAll}
      />

      {/* MOBILE STICKY BOTTOM BAR FOR CASHIER REGISTER */}
      {activeView === 'register' &&
        createPortal(
          <div
            className={`md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-[190] shadow-2xl transition-all duration-300 ease-in-out ${
              isNavFloatingOpen
                ? 'translate-y-24 opacity-0 pointer-events-none'
                : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <DynamicBanknoteIcon trend={revenueTrend} />
                <span className="text-[11px]">
                  <AnimatedCurrency value={activeRevenue} />
                </span>
              </div>
              <span className="text-slate-300 dark:text-zinc-700">•</span>
              <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 truncate">
                <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] truncate">
                  {activeSalesCount} Sales
                </span>
              </div>
            </div>

            {/* Action Buttons */}
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
                      stagedDeletionsRef.current.forEach((tx) =>
                        handleConfirmDelete(String(tx.id))
                      );
                    }
                    setIsRecycleBinOpen(true);
                  }}
                  className={`w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center transition-colors ${
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
                    ? 'Cash session is closed. Open a cash session to record new sales.'
                    : isLocked
                      ? getLockReason('create new sale')
                      : 'Create New Sale'
                }
                onClick={() => {
                  if (!isSessionOpen) {
                    toast.warning(
                      'Cannot create sale: Cash drawer session is closed.'
                    );
                    return;
                  }
                  if (isLocked) return;
                  setIsCreateModalOpen(true);
                }}
                className={`h-9 px-3.5 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider shadow-md border border-white/10 transition-all ${
                  isLocked || !isSessionOpen
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer active:scale-95'
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>NEW SALE</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Sales;
