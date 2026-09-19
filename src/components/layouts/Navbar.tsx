// src/components/layouts/Navbar.tsx
import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ClipboardList,
  Scan,
  Target,
  Lock,
  Package,
  Users,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { useNavbarStore } from '../../stores/useNavbarStore';
import { useScannerStore } from '../../stores/useScannerStore';
import {
  useNotificationStore,
  formatBadgeCount,
} from '../../stores/useNotificationStore';

interface NavbarProps {
  isMobileDrawerOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  isMobileDrawerOpen = false,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSessionOpen } = useCashSessionStore();
  const { user, profile } = useAuthStore() as any;

  const isAdmin = Boolean(
    isSuperAdmin(user?.email) || profile?.role === 'admin'
  );

  // Global persistent floating sub-menu tracker
  const { activeFloating, setActiveFloating, closeFloating } = useNavbarStore();

  // Scanner modal controller
  const { openScanner } = useScannerStore();
  const isScannerModalOpen = useScannerStore((s) => s.isOpen);

  // Real-time notification counters
  const { stockAlertsCount, expiringSubsCount } = useNotificationStore();

  const isSalesRegisterActive = location.pathname === '/sales';
  const isProductsActive = location.pathname.startsWith('/sales/products');
  const isLogbookActive = location.pathname === '/logbook';
  const isMemberListActive = location.pathname.startsWith('/members/list');
  const isPlansActive = location.pathname.startsWith('/members/plans');

  const isSalesDomainActive = isSalesRegisterActive || isProductsActive;
  const isLogbookDomainActive = isLogbookActive || isMemberListActive;

  // Auto-collapse when leaving sales or logbook domains
  useEffect(() => {
    if (!isSalesDomainActive && !isLogbookDomainActive) {
      closeFloating();
    }
  }, [
    location.pathname,
    isSalesDomainActive,
    isLogbookDomainActive,
    closeFloating,
  ]);

  const handleScannerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    closeFloating();
    if (!isSessionOpen) {
      toast.warning(
        'Scanner is locked: Cash drawer session is closed. Open a cash session in Cash Management to record check-ins or sales.',
        { toastId: 'scanner-session-closed' }
      );
      return;
    }
    openScanner();
  };

  const handleSalesClick = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    if (activeFloating === 'sales') {
      closeFloating();
    } else {
      setActiveFloating('sales');
      if (!isSalesDomainActive) {
        navigate('/sales');
      }
    }
  };

  const handleLogbookClick = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    if (activeFloating === 'logbook') {
      closeFloating();
    } else {
      setActiveFloating('logbook');
      if (!isLogbookDomainActive) {
        navigate('/logbook');
      }
    }
  };

  return (
    <>
      {/* Invisible backdrop dismiss catcher */}
      {!isMobileDrawerOpen && activeFloating && (
        <div
          className="fixed inset-0 z-[195] lg:hidden bg-transparent select-none"
          onClick={closeFloating}
        />
      )}

      {/* =========================================================
          MOBILE & TABLET FLOATING DOCK NAVBAR
         ========================================================= */}
      <div
        className={`lg:hidden fixed z-[200] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        bottom-0 left-0 right-0 w-full pb-[env(safe-area-inset-bottom,0px)]
        md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-[460px] md:max-w-[calc(100vw-2rem)] md:pb-0 ${
          isMobileDrawerOpen
            ? 'pointer-events-none opacity-0 invisible translate-y-12'
            : 'opacity-100 translate-y-0'
        }`}
      >
        {/* ─── ANIMATED FLOATING SUB-MENUS (SALES & LOGBOOK) ─── */}
        <AnimatePresence>
          {isAdmin && activeFloating === 'sales' && (
            <motion.div
              key="sub-sales"
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-3 sm:left-6 md:left-3 bottom-[calc(4.85rem+env(safe-area-inset-bottom,0px))] md:bottom-20 z-30 pointer-events-auto"
            >
              <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 dark:bg-[#12151c]/95 backdrop-blur-xl border border-slate-200/90 dark:border-zinc-700/80 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/5">
                <button
                  type="button"
                  onClick={() => {
                    navigate('/sales');
                    closeFloating();
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-heading text-[11px] tracking-wider uppercase font-black transition-all cursor-pointer select-none ${
                    isSalesRegisterActive
                      ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                  <span>Register</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigate('/sales/products');
                    closeFloating();
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-heading text-[11px] tracking-wider uppercase font-black transition-all cursor-pointer select-none ${
                    isProductsActive
                      ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span>Products</span>
                  {stockAlertsCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-heading font-black flex items-center justify-center shadow-xs">
                      {formatBadgeCount(stockAlertsCount)}
                    </span>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {isAdmin && activeFloating === 'logbook' && (
            <motion.div
              key="sub-logbook"
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-16 sm:left-24 md:left-24 bottom-[calc(4.85rem+env(safe-area-inset-bottom,0px))] md:bottom-20 z-30 pointer-events-auto"
            >
              <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 dark:bg-[#12151c]/95 backdrop-blur-xl border border-slate-200/90 dark:border-zinc-700/80 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/5">
                <button
                  type="button"
                  onClick={() => {
                    navigate('/logbook');
                    closeFloating();
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-heading text-[11px] tracking-wider uppercase font-black transition-all cursor-pointer select-none ${
                    isLogbookActive
                      ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <span>Logbook</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigate('/members/list');
                    closeFloating();
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-heading text-[11px] tracking-wider uppercase font-black transition-all cursor-pointer select-none ${
                    isMemberListActive
                      ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>Members</span>
                  {expiringSubsCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[9px] font-heading font-black flex items-center justify-center shadow-xs animate-pulse">
                      {formatBadgeCount(expiringSubsCount)}
                    </span>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── DOCK SHELL CONTAINER ─── */}
        <div className="relative bg-white/95 dark:bg-[#12151c]/95 backdrop-blur-xl border-t md:border border-slate-200/90 dark:border-zinc-800/90 md:rounded-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <nav className="relative h-16 w-full flex items-center justify-between px-3 md:px-4">
            {/* LEFT WING (50%): SALES & LOGBOOK */}
            <div className="w-1/2 flex items-center justify-around pr-7">
              {/* Sales Tab */}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleSalesClick}
                  className={`group flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-90 cursor-pointer ${
                    isSalesDomainActive
                      ? 'text-[#123c73] dark:text-[#bf0202] font-black'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <ShoppingBag
                      className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                        isSalesDomainActive ? 'stroke-[2.5]' : 'stroke-2'
                      }`}
                    />
                    {stockAlertsCount > 0 && (
                      <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#12151c]" />
                    )}
                  </div>
                  <span className="text-[10px] font-heading tracking-wider uppercase leading-none flex items-center gap-0.5">
                    Sales
                    <ChevronDown
                      className={`w-2.5 h-2.5 transition-transform duration-300 ${
                        activeFloating === 'sales'
                          ? 'rotate-180 text-[#123c73] dark:text-[#bf0202]'
                          : 'opacity-50'
                      }`}
                    />
                  </span>
                </button>
              ) : (
                <Link
                  to="/sales"
                  className={`group flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-90 ${
                    isSalesDomainActive
                      ? 'text-[#123c73] dark:text-[#bf0202] font-black'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ShoppingBag
                    className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                      isSalesDomainActive ? 'stroke-[2.5]' : 'stroke-2'
                    }`}
                  />
                  <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                    Sales
                  </span>
                </Link>
              )}

              {/* Logbook Tab */}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleLogbookClick}
                  className={`group flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-90 cursor-pointer ${
                    isLogbookDomainActive
                      ? 'text-[#123c73] dark:text-[#bf0202] font-black'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <ClipboardList
                      className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                        isLogbookDomainActive ? 'stroke-[2.5]' : 'stroke-2'
                      }`}
                    />
                    {expiringSubsCount > 0 && (
                      <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white dark:ring-[#12151c] animate-pulse" />
                    )}
                  </div>
                  <span className="text-[10px] font-heading tracking-wider uppercase leading-none flex items-center gap-0.5">
                    Logbook
                    <ChevronDown
                      className={`w-2.5 h-2.5 transition-transform duration-300 ${
                        activeFloating === 'logbook'
                          ? 'rotate-180 text-[#123c73] dark:text-[#bf0202]'
                          : 'opacity-50'
                      }`}
                    />
                  </span>
                </button>
              ) : (
                <Link
                  to="/logbook"
                  className={`group flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-90 ${
                    isLogbookDomainActive
                      ? 'text-[#123c73] dark:text-[#bf0202] font-black'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ClipboardList
                    className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                      isLogbookDomainActive ? 'stroke-[2.5]' : 'stroke-2'
                    }`}
                  />
                  <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                    Logbook
                  </span>
                </Link>
              )}
            </div>

            {/* DEAD CENTER: ELEVATED QR SCANNER FAB */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-4 z-10 flex flex-col items-center select-none">
              <button
                type="button"
                onClick={handleScannerClick}
                aria-label="Scan QR Code"
                title={
                  !isSessionOpen
                    ? 'Scanner locked: Cash drawer session is closed'
                    : 'Scan QR Code / Barcode'
                }
                className={`group relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 active:scale-90 border-[4px] border-slate-100 dark:border-[#0d1117] shadow-xl cursor-pointer ${
                  !isSessionOpen
                    ? 'bg-slate-400 dark:bg-zinc-700 text-white/70 opacity-60 cursor-not-allowed'
                    : isScannerModalOpen
                      ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-blue-500/40 dark:shadow-red-500/40 scale-105 ring-2 ring-emerald-400'
                      : 'bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white shadow-slate-900/30'
                }`}
              >
                <Scan
                  className={`w-6 h-6 transition-all duration-300 group-hover:scale-110 ${
                    isScannerModalOpen ? 'rotate-90 text-emerald-300' : ''
                  }`}
                />
                {!isSessionOpen && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 rounded-full flex items-center justify-center text-white border-2 border-white dark:border-[#12151c] shadow-md">
                    <Lock className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </button>
            </div>

            {/* RIGHT WING (50%): SUBSCRIPTION */}
            <div className="w-1/2 flex items-center justify-center pl-7">
              <Link
                to="/members/plans"
                onClick={closeFloating}
                className={`group flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-90 ${
                  isPlansActive
                    ? 'text-[#123c73] dark:text-[#bf0202] font-black'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Target
                  className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                    isPlansActive ? 'stroke-[2.5]' : 'stroke-2'
                  }`}
                />
                <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                  Subscription
                </span>
              </Link>
            </div>
          </nav>
        </div>
      </div>

      {/* =========================================================
          DESKTOP FLOATING SCANNER BUTTON (>= 1024px)
         ========================================================= */}
      <div className="fixed bottom-8 right-8 z-[200] hidden lg:block">
        <button
          type="button"
          onClick={handleScannerClick}
          aria-label="Scan QR Code"
          title={
            !isSessionOpen
              ? 'Scanner locked: Cash drawer session is closed'
              : 'Scan QR Code / Barcode'
          }
          className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 active:scale-90 border-2 shadow-xl ${
            !isSessionOpen
              ? 'bg-slate-400 dark:bg-zinc-700 text-white opacity-60 cursor-not-allowed border-slate-300 dark:border-zinc-600'
              : isScannerModalOpen
                ? 'bg-[#123c73] dark:bg-[#bf0202] text-emerald-400 border-blue-400 dark:border-red-400 ring-4 ring-emerald-500/20'
                : 'bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white border-white/20 hover:scale-105 cursor-pointer shadow-slate-950/40'
          }`}
        >
          <Scan className="w-6 h-6" />
          {!isSessionOpen && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 rounded-full flex items-center justify-center text-white border-2 border-white dark:border-zinc-900 shadow-md">
              <Lock className="w-3 h-3 stroke-[3]" />
            </div>
          )}
        </button>
      </div>
    </>
  );
};

export default Navbar;
