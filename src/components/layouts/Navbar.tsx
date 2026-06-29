//src/components/layouts/Navbar.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, ClipboardList, Scan, Target } from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();

  const getActiveColor = (pathStartsWith: string) => {
    return location.pathname.startsWith(pathStartsWith) 
      ? 'text-[var(--color-primary)] font-bold' 
      : 'text-slate-500 dark:text-slate-400';
  };

  return (
    /* added 'lg:hidden' below to disable the bar on desktop screens */
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-[#141414]/95 border-t border-slate-200 dark:border-white/5 backdrop-blur-lg grid lg:hidden grid-cols-5 items-center px-4 z-[200]">
      
      {/* 1. Sales (Left side - occupies 1 column) */}
      <Link 
        to="/sales/register" 
        className={`flex flex-col items-center gap-1 col-span-1 justify-center transition-all ${getActiveColor('/sales')}`}
      >
        <ShoppingBag className="w-4.5 h-4.5" />
        <span className="text-[9px] font-heading tracking-widest uppercase">Sales</span>
      </Link>

      {/* 2. Logbook (Left side - occupies 1 column) */}
      <Link 
        to="/members/check-in" 
        className={`flex flex-col items-center gap-1 col-span-1 justify-center transition-all ${getActiveColor('/members/check-in')}`}
      >
        <ClipboardList className="w-4.5 h-4.5" />
        <span className="text-[9px] font-heading tracking-widest uppercase">Logbook</span>
      </Link>

      {/* 3. Floating Scanner (True Center - occupies 1 column) */}
      <div className="relative -top-3 col-span-1 flex justify-center">
        <Link 
          to="/scanner" 
          aria-label="Scan QR Code"
          title="Scan QR Code"
          className="w-14 h-14 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-full flex items-center justify-center shadow-lg shadow-blue-950/15 dark:shadow-red-950/45 border-4 border-white dark:border-[#141414] scale-110 active:scale-95 transition-all"
        >
          <Scan className="w-6 h-6 animate-pulse" />
        </Link>
      </div>

      {/* 4. Subscription (Right side - occupies 2 columns, centered inside the dead space) */}
      <Link 
        to="/subscriptions/new" 
        className={`flex flex-col items-center gap-1 col-span-2 justify-center transition-all ${getActiveColor('/subscriptions')}`}
      >
        <Target className="w-4.5 h-4.5" />
        <span className="text-[9px] font-heading tracking-widest uppercase">Subscription</span>
      </Link>

    </nav>
  );
};