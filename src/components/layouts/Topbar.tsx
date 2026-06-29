//src/components/layouts/Topbar.tsx
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';

interface TopbarProps {
  onMenuClick: () => void;
  className?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState('');

  // Real-time clock telemetry
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + 
        ' • ' + 
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // breadcrumbs resolver (System / Settings)
  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0) return 'DASHBOARD';
    return paths
      .map(p => p.replace(/-/g, ' ').toUpperCase())
      .join(' / ');
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#141414]/80 backdrop-blur-md fixed top-0 left-0 right-0 flex items-center justify-between px-6 z-200 select-none">
      
      {/* Centered Breadcrumbs */}
      <div className="absolute left-1/2 -translate-x-1/2 font-heading text-xs tracking-[1.5px] uppercase text-[#1b365d] dark:text-[#bf0202]">
        {getBreadcrumbs()}
      </div>

      {/* Real-time clock and mobile hamburger on the far right */}
      <div className="flex items-center gap-4 ml-auto">
        <div className="hidden sm:block text-[11px] font-mono text-slate-400 select-none">
          {currentTime}
        </div>

        {/* Mobile hamburger - Moved to top right */}
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