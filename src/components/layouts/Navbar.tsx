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

export const Navbar: React.FC<NavbarProps> = ({ isMobileDrawerOpen = false }) => {
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

  // SALES Tap Handler
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

  // LOGBOOK Tap Handler
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
      {/* Tap-outside transparent catcher (NO blur, NO dark tint) */}
      {!isMobileDrawerOpen && activeFloating && (
        <div
          className="fixed inset-0 z-[195] lg:hidden bg-transparent"
          onClick={closeFloating}
        />
      )}

      {/* =========================================================
          MOBILE & TABLET NAVBAR
         ========================================================= */}
      <div
        className={`lg:hidden fixed z-[200] transition-all duration-300
        bottom-0 left-0 right-0 w-full pb-[env(safe-area-inset-bottom)] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-zinc-800/80 shadow-lg
        md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-[440px] md:max-w-[calc(100vw-2rem)] md:pb-0 md:rounded-full md:border md:border-slate-200 dark:md:border-zinc-800 md:shadow-2xl ${
          isMobileDrawerOpen
            ? 'pointer-events-none opacity-0 invisible translate-y-12'
            : 'opacity-100 translate-y-0'
        }`}
      >
        {/* ─── FLOATING SUB-MENU: SALES ─── */}
        {isAdmin && activeFloating === 'sales' && (
          <div className="absolute left-3 sm:left-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[calc(5.75rem)] z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 dark:bg-[#161920]/95 border border-slate-200/80 dark:border-white/10 shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  navigate('/sales');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-heading text-[10.5px] tracking-wider uppercase font-black transition-all cursor-pointer ${
                  isSalesRegisterActive
                    ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span>Sales</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigate('/sales/products');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-heading text-[10.5px] tracking-wider uppercase font-black transition-all cursor-pointer ${
                  isProductsActive
                    ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Package className="w-3.5 h-3.5 shrink-0" />
                <span>Products</span>
                {stockAlertsCount > 0 && (
                  <span className="min-w-[17px] h-[17px] px-1 rounded-full bg-amber-500 text-white text-[8px] font-heading font-black flex items-center justify-center shadow-xs">
                    {formatBadgeCount(stockAlertsCount)}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ─── FLOATING SUB-MENU: LOGBOOK & MEMBER LIST ─── */}
        {isAdmin && activeFloating === 'logbook' && (
          <div className="absolute left-14 sm:left-24 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[calc(5.75rem)] z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 dark:bg-[#161920]/95 border border-slate-200/80 dark:border-white/10 shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  navigate('/logbook');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-heading text-[10.5px] tracking-wider uppercase font-black transition-all cursor-pointer ${
                  isLogbookActive
                    ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                <span>Logbook</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigate('/members/list');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-heading text-[10.5px] tracking-wider uppercase font-black transition-all cursor-pointer ${
                  isMemberListActive
                    ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Member List</span>
                {expiringSubsCount > 0 && (
                  <span className="min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[8px] font-heading font-black flex items-center justify-center shadow-xs animate-pulse">
                    {formatBadgeCount(expiringSubsCount)}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        <nav className="relative h-16 w-full flex items-center justify-between px-3">
          {/* LEFT WING (50% width): Holds Sales & Logbook evenly spaced */}
          <div className="w-1/2 flex items-center justify-around pr-7">
            {/* Sales Button */}
            {isAdmin ? (
              <button
                type="button"
                onClick={handleSalesClick}
                className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 cursor-pointer ${
                  isSalesDomainActive
                    ? 'text-[var(--color-primary)] font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={
                  activeFloating === 'sales'
                    ? 'Collapse Sales menu'
                    : 'Expand Sales menu'
                }
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="text-[10px] font-heading tracking-wider uppercase leading-none flex items-center gap-0.5">
                  Sales
                  <ChevronDown
                    className={`w-2.5 h-2.5 transition-transform duration-300 ${
                      activeFloating === 'sales'
                        ? 'rotate-180 text-[var(--color-primary)]'
                        : 'opacity-60'
                    }`}
                  />
                </span>
              </button>
            ) : (
              <Link
                to="/sales"
                className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 ${
                  isSalesDomainActive
                    ? 'text-[var(--color-primary)] font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                  Sales
                </span>
              </Link>
            )}

            {/* Logbook Button */}
            {isAdmin ? (
              <button
                type="button"
                onClick={handleLogbookClick}
                className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 cursor-pointer ${
                  isLogbookDomainActive
                    ? 'text-[var(--color-primary)] font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={
                  activeFloating === 'logbook'
                    ? 'Collapse Logbook menu'
                    : 'Expand Logbook menu'
                }
              >
                <ClipboardList className="w-5 h-5" />
                <span className="text-[10px] font-heading tracking-wider uppercase leading-none flex items-center gap-0.5">
                  Logbook
                  <ChevronDown
                    className={`w-2.5 h-2.5 transition-transform duration-300 ${
                      activeFloating === 'logbook'
                        ? 'rotate-180 text-[var(--color-primary)]'
                        : 'opacity-60'
                    }`}
                  />
                </span>
              </button>
            ) : (
              <Link
                to="/logbook"
                className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 ${
                  isLogbookDomainActive
                    ? 'text-[var(--color-primary)] font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ClipboardList className="w-5 h-5" />
                <span className="text-[10px] font-heading tracking-wider uppercase leading-none">
                  Logbook
                </span>
              </Link>
            )}
          </div>

          {/* EXACT DEAD CENTER: QR Scanner Button */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 z-10">
            <button
              type="button"
              onClick={handleScannerClick}
              aria-label="Scan QR Code"
              title={
                !isSessionOpen
                  ? 'Scanner locked: Cash drawer session is closed'
                  : 'Scan QR Code / Barcode'
              }
              className={`relative flex items-center justify-center w-13 h-13 rounded-full transition-all duration-200 active:scale-90 border-4 border-white dark:border-zinc-900 shadow-md cursor-pointer ${
                !isSessionOpen
                  ? 'bg-slate-400 dark:bg-zinc-700 text-white opacity-70 cursor-not-allowed'
                  : isScannerModalOpen
                    ? 'bg-blue-600 dark:bg-red-600 text-white shadow-blue-500/30 dark:shadow-red-500/30 scale-105'
                    : 'bg-[#123c73] hover:bg-[#0c2950] dark:bg-red-600 dark:hover:bg-red-700 text-white shadow-slate-950/20'
              }`}
            >
              <Scan
                className={`w-6 h-6 transition-transform duration-200 ${
                  isScannerModalOpen ? 'rotate-90 text-emerald-300' : ''
                }`}
              />
              {!isSessionOpen && (
                <div className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-rose-600 rounded-full flex items-center justify-center text-white border-2 border-white dark:border-zinc-900 shadow-sm">
                  <Lock className="w-2.5 h-2.5 stroke-[3]" />
                </div>
              )}
            </button>
          </div>

          {/* RIGHT WING (50% width): Holds Subscription centered on its own */}
          <div className="w-1/2 flex items-center justify-center pl-7">
            <Link
              to="/members/plans"
              onClick={closeFloating}
              className={`flex flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 ${
                isPlansActive
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
        <button
          type="button"
          onClick={handleScannerClick}
          aria-label="Scan QR Code"
          title={
            !isSessionOpen
              ? 'Scanner locked: Cash drawer session is closed'
              : 'Scan QR Code / Barcode'
          }
          className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200 active:scale-90 border-2 shadow-lg ${
            !isSessionOpen
              ? 'bg-slate-400 dark:bg-zinc-700 text-white opacity-70 cursor-not-allowed border-slate-300 dark:border-zinc-600'
              : isScannerModalOpen
                ? 'bg-[#123c73] dark:bg-red-600 text-emerald-400 border-blue-400 dark:border-red-400 shadow-blue-900/20'
                : 'bg-[#123c73] hover:bg-[#0c2950] dark:bg-red-600 dark:hover:bg-red-700 text-white border-white/20 hover:scale-105 cursor-pointer'
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
