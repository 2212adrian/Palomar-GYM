// src/components/layout/Topbar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  ChevronLeft,
  LayoutDashboard,
  ClipboardList,
  Users,
  ShoppingBag,
  BarChart3,
  Settings,
  Layers,
  UserPlus,
  Award,
  Clock,
  UserX,
  Package,
  AlertTriangle,
  PackageX,
  Bell,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import {
  useNotificationStore,
  formatBadgeCount,
} from '../../stores/useNotificationStore';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { NotificationPopover } from './NotificationPopover';
import { CashTransactionModal } from '../../pages/cash/components/CashTransactionModal';
import type { CashTransactionType } from '../../types/cash';

interface TopbarProps {
  onMenuClick: () => void;
  className?: string;
}

export interface LogbookKpiData {
  checkins: number;
  revenue: number;
  newMembers: number;
  revenueTrend: 'increasing' | 'decreasing' | 'neutral';
}

export interface SalesKpiData {
  revenue: number;
  salesCount: number;
  itemsSold: number;
  revenueTrend: 'increasing' | 'decreasing' | 'neutral';
}

export interface ProductsKpiData {
  total: number;
  active: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export interface MembersKpiData {
  total: number;
  activeSubscriptions: number;
  expiringSoon: number;
  suspendedMembers: number;
}

const SEGMENT_MAP: Record<string, string> = {
  logbook: 'LOGBOOK',
  members: 'MEMBERS',
  list: 'MEMBER LIST',
  plans: 'PLANS',
  dashboard: 'DASHBOARD',
  goals: 'REVENUE GOALS',
  sales: 'SALES',
  products: 'PRODUCT LIST',
  reports: 'REPORTS',
  'cash-management': 'CASH MANAGEMENT',
  bir: 'BIR RECORDS',
  settings: 'SETTINGS',
  'personal-account': 'PERSONAL ACCOUNT',
  'audit-logs': 'AUDIT LOGS',
};

// Dynamic Banknote Icon with Popping / Explode Effect
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
          ? 'text-emerald-600 dark:text-emerald-400'
          : trend === 'decreasing'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-emerald-600 dark:text-emerald-400'
      }`}
    >
      {trend === 'increasing' ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
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
          width="18"
          height="18"
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
          width="18"
          height="18"
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

// Animated Number Ticker
const AnimatedKpiNumber: React.FC<{ value: number }> = ({ value }) => {
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

// Theme-Aware Animated Currency Ticker
const AnimatedKpiCurrency: React.FC<{
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
    <span
      className={`font-heading font-black inline-block transition-colors duration-300 ${
        trend === 'increasing'
          ? 'text-emerald-600 dark:text-emerald-400'
          : trend === 'decreasing'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-slate-900 dark:text-white'
      }`}
    >
      <motion.span>{formatted}</motion.span>
    </span>
  );
};

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentTimeFull, setCurrentTimeFull] = useState('');
  const [subTab, setSubTab] = useState<string | null>(null);
  const [timeOffset, setTimeOffset] = useState<number>(0);

  // Cash Session State
  const {
    isSessionOpen,
    currentDrawerCash,
    activeSession,
    loadActiveSession,
    refreshTransactions,
  } = useCashSessionStore();

  const [isCashPopoverOpen, setIsCashPopoverOpen] = useState(false);
  const [activeTxType, setActiveTxType] = useState<CashTransactionType | null>(
    null
  );
  const cashContainerRef = useRef<HTMLDivElement>(null);

  // Logbook Telemetry
  const [logbookKpiData, setLogbookKpiData] = useState<LogbookKpiData>({
    checkins: 0,
    revenue: 0,
    newMembers: 0,
    revenueTrend: 'neutral',
  });

  // Sales Register Telemetry
  const [salesKpiData, setSalesKpiData] = useState<SalesKpiData>({
    revenue: 0,
    salesCount: 0,
    itemsSold: 0,
    revenueTrend: 'neutral',
  });

  // Products Inventory Telemetry
  const [productsKpiData, setProductsKpiData] = useState<ProductsKpiData>({
    total: 0,
    active: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0,
  });

  // Members Telemetry
  const [membersKpiData, setMembersKpiData] = useState<MembersKpiData>({
    total: 0,
    activeSubscriptions: 0,
    expiringSoon: 0,
    suspendedMembers: 0,
  });

  const [isKpiHovered, setIsKpiHovered] = useState(false);
  const [isKpiMobileOpen, setIsKpiMobileOpen] = useState(false);
  const kpiContainerRef = useRef<HTMLDivElement>(null);

  const { user, profile } = useAuthStore() as any;

  const isAdmin =
    user?.app_metadata?.role === 'Admin' ||
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'Admin' ||
    user?.user_metadata?.role === 'admin' ||
    profile?.role?.toLowerCase() === 'admin' ||
    isSuperAdmin(user?.email);

  const {
    unreadBadgeCount,
    isNotificationOpen,
    markBadgeSeen,
    toggleNotificationOpen,
    setNotificationOpen,
    subscribeRealtime,
  } = useNotificationStore();

  useEffect(() => {
    loadActiveSession();
  }, [loadActiveSession]);

  useEffect(() => {
    if (user?.email) {
      const unsubscribe = subscribeRealtime(user.email, profile?.role);
      return () => {
        unsubscribe();
      };
    }
  }, [user?.email, profile?.role, subscribeRealtime]);

  // Close popovers on route changes
  useEffect(() => {
    setIsKpiMobileOpen(false);
    setIsKpiHovered(false);
    setIsCashPopoverOpen(false);
  }, [location.pathname]);

  const handleToggleNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsKpiMobileOpen(false);
    setIsCashPopoverOpen(false);
    if (!isNotificationOpen) {
      markBadgeSeen();
    }
    toggleNotificationOpen();
  };

  const handleToggleKpi = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCashPopoverOpen(false);
    if (!isKpiMobileOpen && isNotificationOpen) {
      setNotificationOpen(false);
    }
    setIsKpiMobileOpen((prev) => !prev);
  };

  const handleToggleCashPopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsKpiMobileOpen(false);
    if (isNotificationOpen) {
      setNotificationOpen(false);
    }
    setIsCashPopoverOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleLogbookKpiUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<LogbookKpiData>;
      if (customEvent.detail) {
        setLogbookKpiData(customEvent.detail);
      }
    };

    const handleSalesKpiUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<SalesKpiData>;
      if (customEvent.detail) {
        setSalesKpiData(customEvent.detail);
      }
    };

    const handleProductsKpiUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<ProductsKpiData>;
      if (customEvent.detail) {
        setProductsKpiData(customEvent.detail);
      }
    };

    const handleMembersKpiUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MembersKpiData>;
      if (customEvent.detail) {
        setMembersKpiData(customEvent.detail);
      }
    };

    window.addEventListener('logbook-kpi-update', handleLogbookKpiUpdate);
    window.addEventListener('sales-kpi-update', handleSalesKpiUpdate);
    window.addEventListener('products-kpi-update', handleProductsKpiUpdate);
    window.addEventListener('members-kpi-update', handleMembersKpiUpdate);

    return () => {
      window.removeEventListener('logbook-kpi-update', handleLogbookKpiUpdate);
      window.removeEventListener('sales-kpi-update', handleSalesKpiUpdate);
      window.removeEventListener(
        'products-kpi-update',
        handleProductsKpiUpdate
      );
      window.removeEventListener('members-kpi-update', handleMembersKpiUpdate);
    };
  }, []);

  // Click outside to dismiss popups
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        kpiContainerRef.current &&
        !kpiContainerRef.current.contains(e.target as Node)
      ) {
        setIsKpiMobileOpen(false);
        setIsKpiHovered(false);
      }
      if (
        cashContainerRef.current &&
        !cashContainerRef.current.contains(e.target as Node)
      ) {
        setIsCashPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleSubTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<string | null>;
      setSubTab(customEvent.detail);
    };
    window.addEventListener('settings-subtab-change', handleSubTabChange);
    return () =>
      window.removeEventListener('settings-subtab-change', handleSubTabChange);
  }, []);

  useEffect(() => {
    const syncWithServer = async () => {
      try {
        const clientStartTime = Date.now();
        const { data, error } = await supabase.rpc('get_server_time');

        if (data && !error) {
          const serverTime = new Date(data).getTime();
          const clientEndTime = Date.now();
          const latency = (clientEndTime - clientStartTime) / 2;
          const offset = serverTime + latency - clientEndTime;
          setTimeOffset(offset);
        }
      } catch (err) {
        // Fallback to system time
      }
    };
    syncWithServer();
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const databaseNow = new Date(Date.now() + timeOffset);
      const timeStr = databaseNow.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      const dateStr = databaseNow.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      setCurrentTimeFull(`${dateStr} • ${timeStr}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timeOffset]);

  const isLogbookPath = location.pathname.startsWith('/logbook');
  const isSalesPath = location.pathname.startsWith('/sales');
  const isMembersPath = location.pathname.startsWith('/members');
  const isProductsView = location.pathname === '/sales/products';
  const isPlansView = location.pathname.includes('/plans');
  const showKpiWidget =
    isLogbookPath || isSalesPath || (isMembersPath && !isPlansView);

  const getSectionIcon = () => {
    const firstSegment =
      location.pathname.split('/').filter(Boolean)[0] || 'dashboard';

    switch (firstSegment) {
      case 'dashboard':
        return (
          <LayoutDashboard className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
      case 'logbook':
        return (
          <ClipboardList className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
      case 'members':
        return (
          <Users className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
      case 'sales':
        return (
          <ShoppingBag className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
      case 'reports':
        return (
          <BarChart3 className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
      case 'cash-management':
        return (
          <Wallet className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
      case 'settings':
      case 'system':
        return (
          <Settings className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
      default:
        return (
          <Layers className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />
        );
    }
  };

  const getBreadcrumbsString = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0) return 'DASHBOARD';

    let baseBreadcrumb = paths
      .map((p) => SEGMENT_MAP[p] || p.replace(/-/g, ' ').toUpperCase())
      .join(' / ');

    if (
      location.pathname.includes('/settings') ||
      location.pathname.includes('/system/account')
    ) {
      baseBreadcrumb = 'SETTINGS';
    }

    if (subTab) {
      return `${baseBreadcrumb} / ${subTab.toUpperCase()}`;
    }

    return baseBreadcrumb;
  };

  const renderStyledBreadcrumbs = () => {
    const rawString = getBreadcrumbsString();
    const segments = rawString.split(' / ');

    return segments.map((segment, index) => {
      const isFirst = index === 0;
      return (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="text-slate-400 dark:text-slate-600 mx-1 select-none">
              /
            </span>
          )}
          <span
            className={
              isFirst
                ? 'text-(--color-primary) font-bold'
                : 'text-[var(--color-text)] font-semibold'
            }
          >
            {segment}
          </span>
        </React.Fragment>
      );
    });
  };

  return (
    <header className="h-16 border-b border-[#123c73]/20 dark:border-[#bf0202]/45 shadow-[0_2px_8px_rgba(18,60,115,0.04)] bg-white/95 dark:bg-[var(--bg-card)]/80 backdrop-blur-md fixed top-0 left-0 right-0 flex items-center justify-between px-3 sm:px-4 md:px-6 z-40 select-none">
      {/* 1. LEFT TITLE & DESKTOP TELEMETRY */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
        {subTab && (
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('settings-go-back'))
            }
            aria-label="Go Back"
            className="lg:hidden h-8 w-8 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* BREADCRUMB TITLE */}
        <div className="flex items-center font-heading text-[11px] sm:text-xs lg:text-sm tracking-[0.6px] sm:tracking-[1.2px] uppercase whitespace-nowrap overflow-hidden text-ellipsis shrink-0">
          {getSectionIcon()}
          <span className="truncate">{renderStyledBreadcrumbs()}</span>
        </div>

        {/* TELEMETRY CAPSULE - HIDDEN ON MOBILE PORTRAIT (`hidden md:flex`) */}
        {showKpiWidget && (
          <div
            ref={kpiContainerRef}
            className="hidden md:flex items-center justify-start z-30 pointer-events-auto shrink-0"
          >
            <div
              className="relative"
              onMouseEnter={() => {
                if (window.matchMedia('(hover: hover)').matches) {
                  setIsKpiHovered(true);
                }
              }}
              onMouseLeave={() => {
                if (window.matchMedia('(hover: hover)').matches) {
                  setIsKpiHovered(false);
                }
              }}
            >
              <button
                type="button"
                onClick={handleToggleKpi}
                aria-label="Today's Metrics"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700/80 shadow-xs hover:border-emerald-500/50 cursor-pointer active:scale-95 transition-all select-none backdrop-blur-md"
              >
                {isMembersPath ? (
                  <>
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                      <Users className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="font-heading font-black text-sm tracking-tight text-slate-900 dark:text-white">
                        <AnimatedKpiNumber value={membersKpiData.total} />{' '}
                        <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">
                          Members
                        </span>
                      </span>
                    </div>
                    <span className="text-slate-300 dark:text-zinc-600 font-bold">
                      •
                    </span>
                    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <Award className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="font-heading font-bold text-xs">
                        <AnimatedKpiNumber
                          value={membersKpiData.activeSubscriptions}
                        />{' '}
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                          Active
                        </span>
                      </span>
                    </div>
                  </>
                ) : isProductsView ? (
                  <>
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <Package className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="font-heading font-black text-sm tracking-tight text-slate-900 dark:text-white">
                        <AnimatedKpiNumber value={productsKpiData.inStock} />{' '}
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                          In Stock
                        </span>
                      </span>
                    </div>
                    <span className="text-slate-300 dark:text-zinc-600 font-bold">
                      •
                    </span>
                    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="font-heading font-bold text-xs">
                        <AnimatedKpiNumber value={productsKpiData.lowStock} />{' '}
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                          Low
                        </span>
                      </span>
                    </div>
                  </>
                ) : isSalesPath ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <DynamicBanknoteIcon trend={salesKpiData.revenueTrend} />
                      <span className="font-heading font-black text-sm tracking-tight">
                        <AnimatedKpiCurrency
                          value={salesKpiData.revenue}
                          trend={salesKpiData.revenueTrend}
                        />
                      </span>
                    </div>
                    <span className="text-slate-300 dark:text-zinc-600 font-bold">
                      •
                    </span>
                    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <ShoppingBag className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="font-heading font-bold text-xs">
                        <AnimatedKpiNumber value={salesKpiData.salesCount} />{' '}
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                          Sales
                        </span>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <DynamicBanknoteIcon
                        trend={logbookKpiData.revenueTrend}
                      />
                      <span className="font-heading font-black text-sm tracking-tight">
                        <AnimatedKpiCurrency
                          value={logbookKpiData.revenue}
                          trend={logbookKpiData.revenueTrend}
                        />
                      </span>
                    </div>
                    <span className="text-slate-300 dark:text-zinc-600 font-bold">
                      •
                    </span>
                    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="font-heading font-bold text-xs">
                        <AnimatedKpiNumber value={logbookKpiData.checkins} />{' '}
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                          Check-ins
                        </span>
                      </span>
                    </div>
                  </>
                )}
              </button>

              {/* TELEMETRY DROPDOWN */}
              <AnimatePresence>
                {(isKpiHovered || isKpiMobileOpen) && (
                  <div className="absolute top-[calc(100%+8px)] left-0 w-96 z-50 pointer-events-auto">
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="w-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 backdrop-blur-xl select-none"
                    >
                      <div className="border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
                        <span className="text-[10px] font-heading font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block">
                          {isMembersPath
                            ? 'Member Directory Telemetry'
                            : isProductsView
                              ? 'Product Catalog Telemetry'
                              : isSalesPath
                                ? "Today's Sales Telemetry"
                                : "Today's Telemetry Overview"}
                        </span>
                      </div>

                      {isMembersPath ? (
                        <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 text-center">
                          <div className="px-1 flex flex-col items-center">
                            <Users className="w-4 h-4 text-blue-500 mb-1" />
                            <span className="text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold">
                              Total
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber value={membersKpiData.total} />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <Award className="w-4 h-4 text-emerald-500 mb-1" />
                            <span className="text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold">
                              Active
                            </span>
                            <span className="font-heading text-sm font-black text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={membersKpiData.activeSubscriptions}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <Clock className="w-4 h-4 text-amber-500 mb-1" />
                            <span className="text-[9px] font-heading text-amber-600 dark:text-amber-400 uppercase font-bold">
                              Expiring
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={membersKpiData.expiringSoon}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <UserX className="w-4 h-4 text-rose-500 mb-1" />
                            <span className="text-[9px] font-heading text-rose-600 dark:text-rose-400 uppercase font-bold">
                              Locked
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={membersKpiData.suspendedMembers}
                              />
                            </span>
                          </div>
                        </div>
                      ) : isProductsView ? (
                        <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 text-center">
                          <div className="px-1 flex flex-col items-center">
                            <Layers className="w-4 h-4 text-blue-500 mb-1" />
                            <span className="text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold">
                              Catalog
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={productsKpiData.active}
                              />
                              /
                              <AnimatedKpiNumber
                                value={productsKpiData.total}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <Package className="w-4 h-4 text-emerald-500 mb-1" />
                            <span className="text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold">
                              In Stock
                            </span>
                            <span className="font-heading text-sm font-black text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={productsKpiData.inStock}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mb-1" />
                            <span className="text-[9px] font-heading text-amber-600 dark:text-amber-400 uppercase font-bold">
                              Low Stock
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={productsKpiData.lowStock}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <PackageX className="w-4 h-4 text-rose-500 mb-1" />
                            <span className="text-[9px] font-heading text-rose-600 dark:text-rose-400 uppercase font-bold">
                              No Stock
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={productsKpiData.outOfStock}
                              />
                            </span>
                          </div>
                        </div>
                      ) : isSalesPath ? (
                        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800 text-center">
                          <div className="px-1 flex flex-col items-center">
                            <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1" />
                            <span className="text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold">
                              Sales
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={salesKpiData.salesCount}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <DynamicBanknoteIcon
                              trend={salesKpiData.revenueTrend}
                            />
                            <span className="text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold mt-1">
                              Revenue
                            </span>
                            <span className="font-heading text-sm font-black text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiCurrency
                                value={salesKpiData.revenue}
                                trend={salesKpiData.revenueTrend}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1" />
                            <span className="text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold">
                              Items
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={salesKpiData.itemsSold}
                              />
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800 text-center">
                          <div className="px-1 flex flex-col items-center">
                            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1" />
                            <span className="text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold">
                              Check-ins
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={logbookKpiData.checkins}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <DynamicBanknoteIcon
                              trend={logbookKpiData.revenueTrend}
                            />
                            <span className="text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold mt-1">
                              Revenue
                            </span>
                            <span className="font-heading text-sm font-black text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiCurrency
                                value={logbookKpiData.revenue}
                                trend={logbookKpiData.revenueTrend}
                              />
                            </span>
                          </div>
                          <div className="px-1 flex flex-col items-center">
                            <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mb-1" />
                            <span className="text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold">
                              New Subs
                            </span>
                            <span className="font-heading text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                              <AnimatedKpiNumber
                                value={logbookKpiData.newMembers}
                              />
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* 2. RIGHT SECTION: CASH PILL & CONTROLS */}
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 ml-auto shrink-0">
        {/* LIVE CASH DRAWER CAPSULE */}
        <div ref={cashContainerRef} className="relative">
          <button
            type="button"
            onClick={handleToggleCashPopover}
            className={`flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border transition-all text-xs active:scale-95 shadow-xs cursor-pointer select-none ${
              isSessionOpen
                ? 'border-emerald-500/30 bg-emerald-50/50 hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30'
                : 'border-slate-200 dark:border-zinc-700/80 bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700'
            }`}
            title="Cash Register Drawer Status"
          >
            <Wallet
              className={`w-3.5 h-3.5 ${
                isSessionOpen
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-500'
              }`}
            />
            <div className="flex items-center gap-1.5 font-mono font-bold">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isSessionOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span
                className={
                  isSessionOpen
                    ? 'text-emerald-700 dark:text-emerald-300 font-extrabold'
                    : 'text-rose-600 dark:text-rose-400 text-[10px]'
                }
              >
                {isSessionOpen
                  ? `₱${currentDrawerCash.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}`
                  : 'CLOSED'}
              </span>
            </div>
          </button>

          {/* QUICK CASH DRAWER ACTION CARD */}
          <AnimatePresence>
            {isCashPopoverOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 w-[calc(100vw-24px)] max-w-xs sm:w-80 z-50 pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="w-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 backdrop-blur-xl select-none space-y-3.5 text-left"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-emerald-500" />
                      <span className="text-[11px] font-heading font-black tracking-wider uppercase text-slate-800 dark:text-white">
                        PHYSICAL DRAWER CASH
                      </span>
                    </div>
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        isSessionOpen
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isSessionOpen ? 'ACTIVE' : 'CLOSED'}
                    </span>
                  </div>

                  {/* Cash Amount Box (Directly Revealed) */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700/60">
                    <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1">
                      Live In-Drawer Balance
                    </div>

                    <div className="text-2xl font-mono font-black text-slate-900 dark:text-white transition-all">
                      {isSessionOpen ? (
                        `₱${currentDrawerCash.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}`
                      ) : (
                        <span className="text-sm font-bold text-rose-500">
                          SESSION IS CLOSED
                        </span>
                      )}
                    </div>

                    {isSessionOpen && activeSession && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate">
                        Session #{activeSession.session_number} • Opener:{' '}
                        {activeSession.opened_by_name}
                      </p>
                    )}
                  </div>

                  {/* Quick Action Buttons (Cash In, Cash Out, Digital In) */}
                  {isSessionOpen ? (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCashPopoverOpen(false);
                          setActiveTxType('cash_in');
                        }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 active:scale-95 transition-all text-center cursor-pointer"
                      >
                        <ArrowDownRight className="w-4 h-4 mb-0.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[10px] font-bold">Cash In</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsCashPopoverOpen(false);
                          setActiveTxType('cash_out');
                        }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-500/20 active:scale-95 transition-all text-center cursor-pointer"
                      >
                        <ArrowUpRight className="w-4 h-4 mb-0.5 text-rose-600 dark:text-rose-400" />
                        <span className="text-[10px] font-bold">Cash Out</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsCashPopoverOpen(false);
                          setActiveTxType('digital_in');
                        }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-500/20 active:scale-95 transition-all text-center cursor-pointer"
                      >
                        <Smartphone className="w-4 h-4 mb-0.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-[10px] font-bold">Digital</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-1">
                      Drawer is closed. Open a session in Cash Management to log
                      transactions.
                    </div>
                  )}

                  {/* Cash Management Full Page Shortcut */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCashPopoverOpen(false);
                      navigate('/cash-management');
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Full Cash Management Ledger</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* TIME TELEMETRY (Desktop only) */}
        <div className="hidden lg:block text-[12px] xl:text-[13px] font-mono text-slate-500 dark:text-slate-400 select-none whitespace-nowrap">
          {currentTimeFull}
        </div>

        {/* NOTIFICATION BELL BUTTON - (Hidden on mobile portrait, shown on `hidden md:flex`) */}
        {isAdmin && (
          <div className="relative hidden md:flex">
            <button
              type="button"
              id="btn-topbar-notifications"
              onClick={handleToggleNotifications}
              aria-label="Toggle notifications"
              className={`relative h-9 w-9 rounded-xl border transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs active:scale-95 ${
                isNotificationOpen
                  ? 'bg-blue-600/10 border-blue-500 text-blue-600 dark:bg-red-500/20 dark:border-red-500 dark:text-red-400'
                  : unreadBadgeCount > 0
                    ? 'bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 border-red-500/30'
                    : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-700/80'
              }`}
            >
              <Bell
                className={`w-4 h-4 ${
                  unreadBadgeCount > 0 ? 'animate-bounce' : ''
                }`}
              />

              {unreadBadgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[8px] font-heading font-black flex items-center justify-center shadow-md border-2 border-white dark:border-[#161920]">
                  {formatBadgeCount(unreadBadgeCount)}
                </span>
              )}
            </button>

            <NotificationPopover
              isOpen={isNotificationOpen}
              onClose={() => setNotificationOpen(false)}
            />
          </div>
        )}

        {/* MOBILE MENU TRIGGER */}
        <button
          onClick={onMenuClick}
          aria-label="Open Navigation Drawer"
          title="Open Navigation"
          className="block lg:hidden text-slate-600 dark:text-slate-400 cursor-pointer p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* QUICK CASH TRANSACTION MODAL TRIGGERED DIRECTLY FROM TOPBAR */}
      {isSessionOpen && activeSession && activeTxType && (
        <CashTransactionModal
          isOpen={Boolean(activeTxType)}
          onClose={() => setActiveTxType(null)}
          type={activeTxType}
          sessionId={activeSession.id}
          currentDrawerCash={currentDrawerCash}
          onSuccess={async () => {
            await refreshTransactions();
            await loadActiveSession();
          }}
        />
      )}
    </header>
  );
};

export default Topbar;
