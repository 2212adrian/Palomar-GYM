  // src/components/layouts/Navbar.tsx
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
      /* 
        Responsive Layout styling:
        - Light Mode: Thin dark blue top accent line (border-[#123c73]/30) with upper glow drop shadow.
        - Dark Mode (dark:): Thin neon-red glowing top border (border-red-500/40) with upper glow drop shadow.
      */
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[var(--bg-card)]/95 border-t border-[#123c73]/30 shadow-[0_-2px_12px_rgba(18,60,115,0.12)] grid lg:hidden grid-cols-5 items-center px-4 z-[200] transition-all duration-300 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[460px] md:rounded-2xl md:border md:border-[#123c73]/40 md:shadow-2xl md:shadow-blue-900/10 dark:border-t dark:border-red-500/40 dark:shadow-[0_-2px_12px_rgba(239,68,68,0.18)] dark:md:border dark:md:border-red-500/50 dark:md:shadow-red-950/40">
        
        {/* 1. Sales (Left side - occupies 1 column) */}
        <Link 
          to="/sales" 
          className={`flex flex-col items-center gap-1 col-span-1 justify-center transition-all ${getActiveColor('/sales')}`}
        >
          <ShoppingBag className="w-4.5 h-4.5" />
          <span className="text-[9px] font-heading tracking-widest uppercase">Sales</span>
        </Link>

        {/* 2. Logbook (Left side - occupies 1 column) */}
        <Link 
          to="/logbook" 
          className={`flex flex-col items-center gap-1 col-span-1 justify-center transition-all ${getActiveColor('/logbook')}`}
        >
          <ClipboardList className="w-4.5 h-4.5" />
          <span className="text-[9px] font-heading tracking-widest uppercase">Logbook</span>
        </Link>

        {/* 3. Floating Scanner */}
        <div className="relative -top-4 col-span-1 flex justify-center">
          {/* Outer thin ring container adapts border and shadow to theme setting */}
          <div className="w-15 h-15 rounded-full border border-[#123c73]/30 dark:border-red-500/40 bg-[var(--bg-card)] flex items-center justify-center p-0.5 shadow-[0_0_12px_rgba(18,60,115,0.15)] dark:shadow-[0_0_12px_rgba(239,68,68,0.22)]">
            <Link 
              to="/scanner" 
              aria-label="Scan QR Code"
              title="Scan QR Code"
              className="w-12 h-12 bg-[#123c73] hover:bg-[#0c2950] dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-full flex items-center justify-center active:scale-95 transition-all relative group shadow-[0_0_10px_rgba(18,60,115,0.25)] dark:shadow-[0_0_10px_rgba(239,68,68,0.45)]"
            >
              {/* Ambient outer pulsing shadow halo */}
              <span className="absolute -inset-1 rounded-full bg-[#123c73] dark:bg-red-500 opacity-20 group-hover:opacity-35 blur-xs transition-opacity animate-pulse" />
              
              {/* Scanning icon element */}
              <Scan className="w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110" />
            </Link>
          </div>
        </div>

        {/* 4. Subscription (Right side - linked to Member Directory & Subscriptions) */}
        <Link 
          to="/members/plans" 
          className={`flex flex-col items-center gap-1 col-span-2 justify-center transition-all ${getActiveColor('/members')}`}
        >
          <Target className="w-4.5 h-4.5" />
          <span className="text-[9px] font-heading tracking-widest uppercase">Subscription</span>
        </Link>

      </nav>
    );
  };