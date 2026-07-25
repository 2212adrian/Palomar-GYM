// src/components/layouts/Topbar.tsx
import React, { useState, useEffect } from 'react';
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
  Layers 
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';

interface TopbarProps {
  onMenuClick: () => void;
  className?: string;
}

// Dictionary to map raw URL pathname segments to styled breadcrumb tags
const SEGMENT_MAP: Record<string, string> = {
  logbook: 'LOGBOOK',
  members: 'MEMBERS',
  list: 'MEMBER LIST',
  plans: 'MEMBERSHIP PLANS',
  dashboard: 'DASHBOARD',
  goals: 'REVENUE GOALS',
  sales: 'SALES',
  products: 'PRODUCT LIST',
  reports: 'REPORTS',
  bir: 'BIR RECORDS',
  settings: 'SETTINGS',
  'personal-account': 'PERSONAL ACCOUNT',
  'audit-logs': 'AUDIT LOGS'
};

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState('');
  const [subTab, setSubTab] = useState<string | null>(null);
  const [timeOffset, setTimeOffset] = useState<number>(0);

  // Retrieve user authentication info and profile state
  const { user, profile } = useAuthStore() as any;

  // Resolve admin state consistently with authorization helpers
  const isAdmin = 
    user?.app_metadata?.role === 'Admin' || 
    user?.app_metadata?.role === 'admin' || 
    user?.user_metadata?.role === 'Admin' || 
    user?.user_metadata?.role === 'admin' || 
    profile?.role?.toLowerCase() === 'admin' ||
    isSuperAdmin(user?.email);

  // Synchronize dynamic settings tab events
  useEffect(() => {
    const handleSubTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<string | null>;
      setSubTab(customEvent.detail);
    };
    window.addEventListener('settings-subtab-change', handleSubTabChange);
    return () => window.removeEventListener('settings-subtab-change', handleSubTabChange);
  }, []);

  // Sync clock offset with Supabase once on mount
  useEffect(() => {
    const syncWithServer = async () => {
      try {
        const clientStartTime = Date.now();
        const { data, error } = await supabase.rpc('get_server_time');
        
        if (data && !error) {
          const serverTime = new Date(data).getTime();
          const clientEndTime = Date.now();
          const latency = (clientEndTime - clientStartTime) / 2;
          const offset = (serverTime + latency) - clientEndTime;
          setTimeOffset(offset);
        }
      } catch (err) {
        console.warn('Failed to sync clock telemetry with Supabase, falling back to system time.');
      }
    };
    syncWithServer();
  }, []);

  // Real-time clock telemetry (runs every 1 second)
  useEffect(() => {
    const updateTime = () => {
      const databaseNow = new Date(Date.now() + timeOffset);
      setCurrentTime(
        databaseNow.toLocaleDateString('en-US', { 
          timeZone: 'Asia/Manila', 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        }) + 
        ' • ' + 
        databaseNow.toLocaleTimeString('en-US', { 
          timeZone: 'Asia/Manila', 
          hour: 'numeric', 
          minute: '2-digit', 
          second: '2-digit', 
          hour12: true 
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timeOffset]);

  // Derived slide view parameters matching Sales.tsx path-routing system
  const isLogbookPath = location.pathname.startsWith('/logbook');
  const isSalesPath = location.pathname.startsWith('/sales');
  const salesView = location.pathname === '/sales/products' ? 'inventory' : 'register';

  const isMembersPath = location.pathname.startsWith('/members');
  const membersView = location.pathname === '/members/plans' ? 'plans' : 'directory';

  const handleToggleSalesView = () => {
    if (salesView === 'register') {
      navigate('/sales/products');
    } else {
      navigate('/sales');
    }
  };
  // Dynamically resolve section icon matching current page route
  const getSectionIcon = () => {
    const firstSegment = location.pathname.split('/').filter(Boolean)[0] || 'dashboard';

    switch (firstSegment) {
      case 'dashboard':
        return <LayoutDashboard className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />;
      case 'logbook':
        return <ClipboardList className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />;
      case 'members':
        return <Users className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />;
      case 'sales':
        return <ShoppingBag className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />;
      case 'reports':
        return <BarChart3 className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />;
      case 'settings':
      case 'system':
        return <Settings className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />;
      default:
        return <Layers className="w-4 h-4 text-(--color-primary) shrink-0 mr-1.5" />;
    }
  };

  const getBreadcrumbsString = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0) return 'DASHBOARD';
    
    let baseBreadcrumb = paths
      .map(p => SEGMENT_MAP[p] || p.replace(/-/g, ' ').toUpperCase())
      .join(' / ');

    if (location.pathname.includes('/settings') || location.pathname.includes('/system/account')) {
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
            <span className="text-slate-400 dark:text-slate-600 mx-2 select-none">
              /
            </span>
          )}
          <span 
            className={
              isFirst 
                ? "text-(--color-primary) font-bold animate-fade-in" 
                : "text-[var(--color-text)] animate-fade-in" 
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

  return (
    <header className="h-16 border-b border-[#123c73]/25 dark:border-[#bf0202]/45 shadow-[0_2px_8px_rgba(18,60,115,0.05)] dark:shadow-[0_2px_8px_rgba(191,2,2,0.05)] bg-[var(--bg-card)]/80 backdrop-blur-md fixed top-0 left-0 right-0 flex items-center justify-between px-6 z-20 select-none">
      <div className="flex items-center gap-3.5 min-w-[200px]">
        {subTab && (
          <button
            type="button"
            onClick={handleGoBackTrigger}
            aria-label="Go Back"
            title="Go Back"
            className="xl:hidden h-9 w-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className="xl:hidden flex items-center font-heading text-[11px] sm:text-xs tracking-[1px] uppercase whitespace-nowrap overflow-hidden text-ellipsis max-w-55 sm:max-w-[320px]">
          {getSectionIcon()}
          <span>{renderStyledBreadcrumbs()}</span>
        </div>
      </div>

      <div className="hidden xl:flex items-center absolute left-1/2 -translate-x-1/2 font-heading text-sm tracking-[1.5px] uppercase whitespace-nowrap transition-all duration-300 ease-in-out">
        {getSectionIcon()}
        <span>{renderStyledBreadcrumbs()}</span>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        {/* Mobile slide transition button for Logbook */}
        {isLogbookPath && isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/members/list')}
            className="xl:hidden flex items-center gap-1 px-3 py-1.5 border border-[#123c73]/30 dark:border-red-500/40 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 text-[9px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up font-bold"
            title="Slide to Member Directory"
          >
            Members →
          </button>
        )}

        {/* Mobile slide transition button for Sales */}
        {isSalesPath && isAdmin && (
          <button
            type="button"
            onClick={handleToggleSalesView}
            className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 border border-[#123c73]/30 dark:border-red-500/40 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 text-[9px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up font-bold"
            title={salesView === 'register' ? "Slide to Inventory" : "Slide to Sales"}
          >
            {salesView === 'register' ? 'Products' : '← Sales'}
          </button>
        )}

        {/* Mobile slide transition button for Members */}
        {isMembersPath && isAdmin && (
          <div className="xl:hidden flex items-center gap-1.5">
            {membersView === 'directory' ? (
              <button
                type="button"
                onClick={() => navigate('/logbook')}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-[#123c73]/30 dark:border-red-500/40 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 text-[9px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up font-bold"
                title="Slide to Logbook"
              >
                ← Logbook
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/members/list')}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-[#123c73]/30 dark:border-red-500/40 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 text-[9px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up font-bold"
                title="Slide to Member Directory"
              >
                ← List
              </button>
            )}
          </div>
        )}

        <div className="hidden sm:block text-[15px] font-mono text-slate-400 select-none">
          {currentTime}
        </div>

        <button 
          onClick={onMenuClick}
          aria-label="Open Navigation Drawer"
          title="Open Navigation"
          className="block xl:hidden text-slate-500 dark:text-slate-400 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};