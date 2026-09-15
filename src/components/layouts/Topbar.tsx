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
  ChevronRight,
  Package,
  AlertTriangle,
  PackageX,
  Bell,
  Wallet,
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

// THEME-AWARE ANIMATED CURRENCY TICKER
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
  const [, setCurrentTimeShort] = useState('');
  const [subTab, setSubTab] = useState<string | null>(null);
  const [timeOffset, setTimeOffset] = useState<number>(0);

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
    if (user?.email) {
      const unsubscribe = subscribeRealtime(user.email, profile?.role);
      return () => {
        unsubscribe();
      };
    }
  }, [user?.email, profile?.role, subscribeRealtime]);

  // Close dropdowns on route changes
  useEffect(() => {
    setIsKpiMobileOpen(false);
    setIsKpiHovered(false);
  }, [location.pathname]);

  const handleToggleNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsKpiMobileOpen(false);
    if (!isNotificationOpen) {
      markBadgeSeen();
    }
    toggleNotificationOpen();
  };

  const handleToggleKpi = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isKpiMobileOpen && isNotificationOpen) {
      setNotificationOpen(false);
    }
    setIsKpiMobileOpen((prev) => !prev);
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

    // Initial hydration from session caches
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const cachedLogbook = sessionStorage.getItem(
        `logbook_sanitized_${todayStr}`
      );
      if (cachedLogbook) {
        const parsed = JSON.parse(cachedLogbook);
        if (Array.isArray(parsed)) {
          const revenue = parsed.reduce(
            (acc: number, log: any) =>
              log.paymentStatus === 'Paid'
                ? acc + (Number(log.amountPaid) || 0)
                : acc,
            0
          );
          setLogbookKpiData({
            checkins: parsed.length,
            revenue,
            newMembers: parsed.filter(
              (l: any) =>
                l.customerType === 'New Membership' || l.isSubscription
            ).length,
            revenueTrend: 'neutral',
          });
        }
      }

      const cachedSales = sessionStorage.getItem(`sales_sanitized_${todayStr}`);
      if (cachedSales) {
        const parsedSales = JSON.parse(cachedSales);
        if (Array.isArray(parsedSales)) {
          const revenue = parsedSales.reduce(
            (acc: number, t: any) => acc + (Number(t.total_amount) || 0),
            0
          );
          const itemsSold = parsedSales.reduce((acc: number, tx: any) => {
            if (tx.items && Array.isArray(tx.items)) {
              return (
                acc +
                tx.items.reduce(
                  (sum: number, item: any) =>
                    sum + (Number(item.quantity) || 0),
                  0
                )
              );
            }
            return acc + (Number(tx.quantity) || 1);
          }, 0);
          setSalesKpiData({
            revenue,
            salesCount: parsedSales.length,
            itemsSold,
            revenueTrend: 'neutral',
          });
        }
      }
    } catch (e) {}

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        kpiContainerRef.current &&
        !kpiContainerRef.current.contains(e.target as Node)
      ) {
        setIsKpiMobileOpen(false);
        setIsKpiHovered(false);
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
        console.warn(
          'Failed to sync clock telemetry with Supabase, falling back to system time.'
        );
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

      setCurrentTimeShort(timeStr);
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
  const salesView = isProductsView ? 'inventory' : 'register';

  // Live Cash Management Session State
  const { isSessionOpen, currentDrawerCash } = useCashSessionStore();

  const handleToggleSalesView = () => {
    if (salesView === 'register') {
      navigate('/sales/products');
    } else {
      navigate('/sales');
    }
  };

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

  const handleGoBackTrigger = () => {
    window.dispatchEvent(new CustomEvent('settings-go-back'));
  };

  const showKpiWidget =
    isLogbookPath || isSalesPath || (isMembersPath && !isPlansView);

  return (
    <header className="h-16 border-b border-[#123c73]/20 dark:border-[#bf0202]/45 shadow-[0_2px_8px_rgba(18,60,115,0.04)] bg-white/95 dark:bg-[var(--bg-card)]/80 backdrop-blur-md fixed top-0 left-0 right-0 flex items-center justify-between px-2.5 sm:px-4 md:px-6 z-40 select-none">
      {/* 1. LEFT TITLE & TELEMETRY SECTION */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
        {subTab && (
          <button
            type="button"
            onClick={handleGoBackTrigger}
            aria-label="Go Back"
            title="Go Back"
            className="lg:hidden h-8 w-8 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center font-heading text-[10px] sm:text-xs lg:text-sm tracking-[0.6px] sm:tracking-[1.2px] uppercase whitespace-nowrap overflow-hidden text-ellipsis shrink-0">
          {getSectionIcon()}
          <span className="truncate">{renderStyledBreadcrumbs()}</span>
        </div>

        {/* TELEMETRY CAPSULE (Moved next to title to never collide with Drawer Closed) */}
        {showKpiWidget && (
          <div
            ref={kpiContainerRef}
            className="flex items-center justify-start z-30 pointer-events-auto shrink-0"
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
              aria-label="Today's Revenue & Metrics"
              className="flex items-center gap-1 sm:gap-2.5 md:gap-3 px-2 py-1 sm:px-4 sm:py-1.5 rounded-full bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700/80 shadow-xs hover:border-emerald-500/50 cursor-pointer active:scale-95 transition-all select-none backdrop-blur-md"
            >
              {isMembersPath ? (
                <>
                  <div className="flex items-center gap-1 sm:gap-1.5 text-blue-600 dark:text-blue-400">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 shrink-0" />
                    <span className="font-heading font-black text-[11px] sm:text-sm tracking-tight text-slate-900 dark:text-white">
                      <AnimatedKpiNumber value={membersKpiData.total} />{' '}
                      <span className="text-[9px] sm:text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">
                        Members
                      </span>
                    </span>
                  </div>

                  <div className="hidden md:flex items-center gap-1.5">
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
                  </div>
                </>
              ) : isProductsView ? (
                <>
                  <div className="flex items-center gap-1 sm:gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0" />
                    <span className="font-heading font-black text-[11px] sm:text-sm tracking-tight text-slate-900 dark:text-white">
                      <AnimatedKpiNumber value={productsKpiData.inStock} />{' '}
                      <span className="text-[9px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                        In Stock
                      </span>
                    </span>
                  </div>

                  <div className="hidden md:flex items-center gap-1.5">
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
                  </div>
                </>
              ) : isSalesPath ? (
                <>
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <DynamicBanknoteIcon trend={salesKpiData.revenueTrend} />
                    <span className="font-heading font-black text-[11px] sm:text-sm tracking-tight">
                      <AnimatedKpiCurrency
                        value={salesKpiData.revenue}
                        trend={salesKpiData.revenueTrend}
                      />
                    </span>
                  </div>

                  <div className="hidden md:flex items-center gap-1.5">
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
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <DynamicBanknoteIcon trend={logbookKpiData.revenueTrend} />
                    <span className="font-heading font-black text-[11px] sm:text-sm tracking-tight">
                      <AnimatedKpiCurrency
                        value={logbookKpiData.revenue}
                        trend={logbookKpiData.revenueTrend}
                      />
                    </span>
                  </div>

                  <div className="hidden md:flex items-center gap-1.5">
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
                  </div>
                </>
              )}
            </button>

            {/* FLOATING TELEMETRY DROPDOWN */}
            <AnimatePresence>
              {(isKpiHovered || isKpiMobileOpen) && (
                <div className="absolute top-[calc(100%+8px)] left-0 w-[calc(100vw-24px)] max-w-sm sm:w-96 sm:max-w-none z-50 pointer-events-auto">
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="w-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3 sm:p-4 backdrop-blur-xl select-none"
                  >
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 text-center sm:text-left">
                      <span className="text-[9px] font-heading font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block">
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
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <Users className="w-4 h-4 text-blue-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold truncate max-w-full">
                            Total
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber value={membersKpiData.total} />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <Award className="w-4 h-4 text-emerald-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold truncate max-w-full">
                            Active
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={membersKpiData.activeSubscriptions}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <Clock className="w-4 h-4 text-amber-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-amber-600 dark:text-amber-400 uppercase font-bold truncate max-w-full">
                            Expiring
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={membersKpiData.expiringSoon}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <UserX className="w-4 h-4 text-rose-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-rose-600 dark:text-rose-400 uppercase font-bold truncate max-w-full">
                            Locked
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={membersKpiData.suspendedMembers}
                            />
                          </span>
                        </div>
                      </div>
                    ) : isProductsView ? (
                      <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 text-center">
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <Layers className="w-4 h-4 text-blue-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold truncate max-w-full">
                            Catalog
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber value={productsKpiData.active} />
                            /
                            <AnimatedKpiNumber value={productsKpiData.total} />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <Package className="w-4 h-4 text-emerald-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold truncate max-w-full">
                            In Stock
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={productsKpiData.inStock}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <AlertTriangle className="w-4 h-4 text-amber-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-amber-600 dark:text-amber-400 uppercase font-bold truncate max-w-full">
                            Low Stock
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={productsKpiData.lowStock}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <PackageX className="w-4 h-4 text-rose-500 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-rose-600 dark:text-rose-400 uppercase font-bold truncate max-w-full">
                            No Stock
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={productsKpiData.outOfStock}
                            />
                          </span>
                        </div>
                      </div>
                    ) : isSalesPath ? (
                      <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800 text-center">
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold truncate max-w-full">
                            Sales
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={salesKpiData.salesCount}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <DynamicBanknoteIcon
                            trend={salesKpiData.revenueTrend}
                          />
                          <span className="text-[8px] sm:text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold mt-1 truncate max-w-full">
                            Revenue
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiCurrency
                              value={salesKpiData.revenue}
                              trend={salesKpiData.revenueTrend}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold truncate max-w-full">
                            Items
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber value={salesKpiData.itemsSold} />
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800 text-center">
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold truncate max-w-full">
                            Check-ins
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiNumber
                              value={logbookKpiData.checkins}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <DynamicBanknoteIcon
                            trend={logbookKpiData.revenueTrend}
                          />
                          <span className="text-[8px] sm:text-[9px] font-heading text-emerald-600 dark:text-emerald-400 uppercase font-bold mt-1 truncate max-w-full">
                            Revenue
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                            <AnimatedKpiCurrency
                              value={logbookKpiData.revenue}
                              trend={logbookKpiData.revenueTrend}
                            />
                          </span>
                        </div>
                        <div className="px-1 flex flex-col items-center min-w-0">
                          <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mb-1 shrink-0" />
                          <span className="text-[8px] sm:text-[9px] font-heading text-slate-500 dark:text-slate-400 uppercase font-bold truncate max-w-full">
                            New Subs
                          </span>
                          <span className="font-heading text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
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

      {/* 2. RIGHT SECTION: ACTIONS & BELL */}
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 ml-auto shrink-0">
        {isLogbookPath && isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/members/list')}
            className="lg:hidden h-8 sm:h-9 px-2 sm:px-3 border border-slate-200 dark:border-zinc-700/80 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-white text-[10px] sm:text-[11px] font-heading font-black tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 shadow-xs flex items-center gap-1 select-none"
            title="Slide to Member Directory"
          >
            <Users className="w-3.5 h-3.5 text-(--color-primary) shrink-0" />
            <span className="hidden sm:inline">MEMBERS</span>
            <ChevronRight className="hidden sm:inline w-3 h-3 text-(--color-primary) shrink-0" />
          </button>
        )}

        {isMembersPath && isAdmin && !isPlansView && (
          <button
            type="button"
            onClick={() => navigate('/logbook')}
            className="lg:hidden h-8 sm:h-9 px-2 sm:px-3 border border-slate-200 dark:border-zinc-700/80 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-white text-[10px] sm:text-[11px] font-heading font-black tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 shadow-xs flex items-center gap-1 select-none"
            title="Slide to Logbook"
          >
            <ClipboardList className="w-3.5 h-3.5 text-(--color-primary) shrink-0" />
            <span className="hidden sm:inline">LOGBOOK</span>
          </button>
        )}

        {isSalesPath && isAdmin && (
          <button
            type="button"
            onClick={handleToggleSalesView}
            className="lg:hidden h-8 sm:h-9 px-2 sm:px-3 border border-slate-200 dark:border-zinc-700/80 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-white text-[10px] sm:text-[11px] font-heading font-black tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 shadow-xs flex items-center gap-1 select-none"
            title={
              salesView === 'register' ? 'Slide to Inventory' : 'Slide to Sales'
            }
          >
            {salesView === 'register' ? (
              <>
                <Package className="w-3.5 h-3.5 text-(--color-primary) shrink-0" />
                <span className="hidden sm:inline">PRODUCTS</span>
                <ChevronRight className="hidden sm:inline w-3 h-3 text-(--color-primary) shrink-0" />
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5 text-(--color-primary) shrink-0" />
                <span className="hidden sm:inline">SALES</span>
              </>
            )}
          </button>
        )}

        {/* LIVE CASH DRAWER CAPSULE */}
        <button
          type="button"
          onClick={() => navigate('/cash-management')}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700/80 bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 transition-all text-xs active:scale-95 shadow-xs cursor-pointer select-none"
          title="Cash Register Drawer Status (Click to open Cash Management)"
        >
          <Wallet
            className={`w-3.5 h-3.5 ${
              isSessionOpen ? 'text-emerald-500' : 'text-rose-500'
            }`}
          />
          <div className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSessionOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="hidden sm:inline font-mono font-bold text-slate-800 dark:text-slate-200">
              {isSessionOpen
                ? `₱${currentDrawerCash.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                  })}`
                : 'DRAWER CLOSED'}
            </span>
            <span className="sm:hidden font-mono font-bold text-slate-800 dark:text-slate-200">
              {isSessionOpen ? `₱${currentDrawerCash.toFixed(0)}` : 'CLOSED'}
            </span>
          </div>
        </button>

        {/* TIME TELEMETRY (Desktop only) */}
        <div className="hidden lg:block text-[12px] xl:text-[13px] font-mono text-slate-500 dark:text-slate-400 select-none whitespace-nowrap">
          {currentTimeFull}
        </div>

        {/* NOTIFICATION BELL BUTTON */}
        {isAdmin && (
          <div className="relative">
            <button
              type="button"
              id="btn-topbar-notifications"
              onClick={handleToggleNotifications}
              aria-label="Toggle notifications"
              className={`relative h-8 sm:h-9 w-8 sm:w-9 rounded-xl border transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs active:scale-95 ${
                isNotificationOpen
                  ? 'bg-blue-600/10 border-blue-500 text-blue-600 dark:bg-red-500/20 dark:border-red-500 dark:text-red-400'
                  : unreadBadgeCount > 0
                    ? 'bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 border-red-500/30'
                    : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-700/80'
              }`}
            >
              <Bell
                className={`w-4 h-4 ${unreadBadgeCount > 0 ? 'animate-bounce' : ''}`}
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

        {/* MOBILE MENU */}
        <button
          onClick={onMenuClick}
          aria-label="Open Navigation Drawer"
          title="Open Navigation"
          className="block lg:hidden text-slate-600 dark:text-slate-400 cursor-pointer p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};

export default Topbar;
