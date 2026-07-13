// src/components/layouts/Topbar.tsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';

interface TopbarProps {
  onMenuClick: () => void;
  className?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState('');
  const [subTab, setSubTab] = useState<string | null>(null);
  const [timeOffset, setTimeOffset] = useState<number>(0);

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
  const isSalesPath = location.pathname.startsWith('/sales');
  const salesView = location.pathname === '/sales/products' ? 'inventory' : 'register';

  const handleToggleSalesView = () => {
    if (salesView === 'register') {
      navigate('/sales/products');
    } else {
      navigate('/sales/register');
    }
  };

  // Resolves the breadcrumbs path string (e.g., "SETTINGS / USER MANAGEMENT")
  const getBreadcrumbsString = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0) return 'DASHBOARD';
    
    let baseBreadcrumb = paths
      .map(p => p.replace(/-/g, ' ').toUpperCase())
      .join(' / ');

    if (location.pathname.includes('/settings') || location.pathname.includes('/system/account')) {
      baseBreadcrumb = 'SETTINGS';
    }

    // BREADCRUMBS FIX: Dynamically update based on the sliding viewport state
    if (isSalesPath) {
      baseBreadcrumb = salesView === 'register' ? 'SALES / REGISTER' : 'SALES / INVENTORY';
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
                ? "text-[var(--color-primary)] font-bold" 
                : "text-[var(--color-text)]" 
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
      
      {/* Far Left Container */}
      <div className="flex items-center gap-3.5 min-w-[200px]">
        {subTab && (
          <button
            onClick={handleGoBackTrigger}
            aria-label="Go Back"
            title="Go Back"
            className="xl:hidden h-9 w-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Mobile / Tablet Breadcrumbs */}
        <div className="xl:hidden font-heading text-[11px] sm:text-xs tracking-[1px] uppercase whitespace-nowrap overflow-hidden text-ellipsis max-w-55 sm:max-w-[320px]">
          {renderStyledBreadcrumbs()}
        </div>
      </div>

      {/* Centered Breadcrumbs Wrapper (Desktop Viewports Only) */}
      <div className="hidden xl:block absolute left-1/2 -translate-x-1/2 font-heading text-sm tracking-[1.5px] uppercase whitespace-nowrap transition-all duration-300 ease-in-out">
        {renderStyledBreadcrumbs()}
      </div>

      {/* Real-time clock and mobile navigation items */}
      <div className="flex items-center gap-4 ml-auto">
        
        {/* MOBILE SLIDE NAVIGATION TRIGGER */}
        {isSalesPath && (
          <button
            onClick={handleToggleSalesView}
            className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 border border-[#123c73]/30 dark:border-red-500/40 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 text-[9px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up"
            title={salesView === 'register' ? "Slide to Inventory" : "Slide to Register"}
          >
            {salesView === 'register' ? 'Products →' : '← Register'}
          </button>
        )}

        <div className="hidden sm:block text-[15px] font-mono text-slate-400 select-none">
          {currentTime}
        </div>

        {/* Mobile hamburger */}
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