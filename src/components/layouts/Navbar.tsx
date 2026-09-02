// src/components/layouts/Navbar.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, ClipboardList, Scan, Target } from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();

  const isScannerActive = location.pathname.startsWith('/scanner');

  const checkIsActive = (path: string, exact: boolean = false) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <>
      {/* =========================================================
          MOBILE & TABLET NAVBAR
          - Mobile (<768px): Full-width bottom dock
          - Tablet (768px - 1023px): Centered floating pill
         ========================================================= */}
      <div
        className="lg:hidden fixed z-[200] transition-all duration-300
        /* Mobile: Sticky bottom attached dock */
        bottom-0 left-0 right-0 w-full pb-[env(safe-area-inset-bottom)] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-zinc-800/80 shadow-lg
        /* Tablet: Centered floating pill */
        md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-[440px] md:max-w-[calc(100vw-2rem)] md:pb-0 md:rounded-full md:border md:border-slate-200 dark:md:border-zinc-800 md:shadow-2xl"
      >
        <nav className="relative h-16 w-full flex items-center justify-between px-3">
          {/* LEFT WING (50% width): Holds Sales & Logbook evenly spaced */}
          <div className="w-1/2 flex items-center justify-around pr-7">
            <Link
              to="/sales"
              className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 ${
                checkIsActive('/sales', true)
                  ? 'text-[var(--color-primary)] font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                Sales
              </span>
            </Link>

            <Link
              to="/logbook"
              className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 ${
                checkIsActive('/logbook')
                  ? 'text-[var(--color-primary)] font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ClipboardList className="w-5 h-5" />
              <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                Logbook
              </span>
            </Link>
          </div>

          {/* EXACT DEAD CENTER: QR Scanner Button */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 z-10">
            <Link
              to="/scanner"
              aria-label="Scan QR Code"
              title="Scan QR Code / Barcode"
              className={`flex items-center justify-center w-13 h-13 rounded-full transition-all duration-200 active:scale-90 border-4 border-white dark:border-zinc-900 shadow-md ${
                isScannerActive
                  ? 'bg-blue-600 dark:bg-red-600 text-white shadow-blue-500/30 dark:shadow-red-500/30 scale-105'
                  : 'bg-[#123c73] hover:bg-[#0c2950] dark:bg-red-600 dark:hover:bg-red-700 text-white shadow-slate-950/20'
              }`}
            >
              <Scan
                className={`w-6 h-6 transition-transform duration-200 ${isScannerActive ? 'rotate-90 text-emerald-300' : ''}`}
              />
            </Link>
          </div>

          {/* RIGHT WING (50% width): Holds Subscription centered on its own */}
          <div className="w-1/2 flex items-center justify-center pl-7">
            <Link
              to="/members/plans"
              className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 ${
                checkIsActive('/members/plans')
                  ? 'text-[var(--color-primary)] font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Target className="w-5 h-5" />
              <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                Subscription
              </span>
            </Link>
          </div>
        </nav>
      </div>

      {/* =========================================================
          DESKTOP FLOATING SCANNER BUTTON (>= 1024px)
         ========================================================= */}
      <div className="fixed bottom-8 right-8 z-[200] hidden lg:block">
        <Link
          to="/scanner"
          aria-label="Scan QR Code"
          title="Scan QR Code / Barcode"
          className={`flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200 active:scale-90 border-2 shadow-lg cursor-pointer ${
            isScannerActive
              ? 'bg-[#123c73] dark:bg-red-600 text-emerald-400 border-blue-400 dark:border-red-400 shadow-blue-900/20'
              : 'bg-[#123c73] hover:bg-[#0c2950] dark:bg-red-600 dark:hover:bg-red-700 text-white border-white/20 hover:scale-105'
          }`}
        >
          <Scan className="w-6 h-6" />
        </Link>
      </div>
    </>
  );
};
