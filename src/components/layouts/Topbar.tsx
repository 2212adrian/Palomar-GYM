import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';

interface TopbarProps {
  onMenuClick: () => void;
  className?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
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

  // Resolves the breadcrumbs path string (e.g., "SETTINGS / USER MANAGEMENT")
  const getBreadcrumbsString = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0) return 'DASHBOARD';
    
    let baseBreadcrumb = paths
      .map(p => p.replace(/-/g, ' ').toUpperCase())
      .join(' / ');

    if (location.pathname.includes('/system/account')) {
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
                ? "text-[#1b365d] dark:text-[#bf0202] font-semibold" 
                : "text-slate-900 dark:text-slate-100" 
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
    <header className="h-16 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#141414]/80 backdrop-blur-md fixed top-0 left-0 right-0 flex items-center justify-between px-6 z-200 select-none">
      
      {/* 
        Far Left Container:
        Displays a clean, square Chevron back button on mobile when subtabs are active.
      */}
      <div className="flex items-center min-w-10">
        {subTab && (
          <button
            onClick={handleGoBackTrigger}
            aria-label="Go Back"
            title="Go Back"
            className="lg:hidden h-9 w-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 animate-slide-up"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Centered Breadcrumbs Wrapper */}
      <div className="absolute left-1/2 -translate-x-1/2 font-heading text-xs tracking-[1.5px] uppercase whitespace-nowrap transition-all duration-300 ease-in-out">
        {renderStyledBreadcrumbs()}
      </div>

      {/* Real-time clock and mobile hamburger on the far right */}
      <div className="flex items-center gap-4 ml-auto">
        <div className="hidden sm:block text-[11px] font-mono text-slate-400 select-none">
          {currentTime}
        </div>

        {/* Mobile hamburger */}
        <button 
          onClick={onMenuClick}
          aria-label="Open Navigation Drawer"
          title="Open Navigation"
          className="block lg:hidden text-slate-500 dark:text-slate-400 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};