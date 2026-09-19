// src/components/layouts/SystemLayout.tsx
import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
} from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { supabase } from '../../lib/supabase/client';

import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { TabLoader } from '../ui/TabLoader';
import { CashFloatModal } from '../../pages/cash/components/CashFloatModal';
import { ScannerPage } from '../../pages/scanner/ScannerPage';
import { BackupSafetyBanner } from '../ui/BackupSafetyBanner';
import { CashSessionClosedBanner } from '../ui/CashSessionClosedBanner';
import { promptInitialPermissionsOnLogin } from '../../lib/permissions';

interface TabLoadingContextType {
  startLoading: (id: string) => void;
  stopLoading: (id: string) => void;
  isOnline: boolean;
}

export const TabLoadingContext = createContext<TabLoadingContextType>({
  startLoading: () => {},
  stopLoading: () => {},
  isOnline: true,
});

export const useTabLoading = () => useContext(TabLoadingContext);

export const SystemLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mainScrollRef = useRef<HTMLElement>(null);
  const logout = useAuthStore((state) => state.logout);

  // ─── Global Live Cash Drawer Sync (Keeps Topbar wallet counter live on every page) ───
  const loadActiveSession = useCashSessionStore(
    (state) => state.loadActiveSession
  );
  const loadHistory = useCashSessionStore((state) => state.loadHistory);
  const subscribeRealtime = useCashSessionStore(
    (state) => state.subscribeRealtime
  );

  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isAdmin = Boolean(
    user?.email &&
    (user.email.toLowerCase() === 'wolfpalomargym@gmail.com' ||
      profile?.role === 'admin')
  );

  // Auto-activate account status from 'pending' to 'active' upon entering the system/admin portal
  useEffect(() => {
    if (user?.id && profile?.status === 'pending') {
      supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', user.id)
        .then(({ error }) => {
          if (!error) {
            useAuthStore.setState((state) => ({
              profile: state.profile
                ? { ...state.profile, status: 'active' }
                : null,
            }));
          }
        });
    }
  }, [user?.id, profile?.status]);

  useEffect(() => {
    loadActiveSession();
    if (isAdmin) {
      loadHistory();
    }
    const unsubscribe = subscribeRealtime();
    return () => {
      unsubscribe();
    };
  }, [loadActiveSession, loadHistory, subscribeRealtime, isAdmin]);

  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutStarted, setLogoutStarted] = useState(false);
  const [logoutResting, setLogoutResting] = useState(false);

  // Initialize slideOut as FALSE if dashboard intro was scheduled
  const [slideOut, setSlideOut] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('playDashboardIntro') !== 'true';
    }
    return true;
  });

  const [curtainHidden, setCurtainHidden] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('playDashboardIntro') !== 'true';
    }
    return true;
  });

  // Tab transition & network state
  const [, setActivePath] = useState(location.pathname);
  const [activeTasks, setActiveTasks] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const isTabLoading = activeTasks.length > 0;

  // Scroll reset
  useEffect(() => {
    const forceScrollToTop = () => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = 0;
        mainScrollRef.current.scrollTo({
          top: 0,
          left: 0,
          behavior: 'instant' as ScrollBehavior,
        });
      }
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant' as ScrollBehavior,
      });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };

    forceScrollToTop();
    const rafId = requestAnimationFrame(() => {
      forceScrollToTop();
    });

    const t1 = setTimeout(forceScrollToTop, 100);
    const t2 = setTimeout(forceScrollToTop, 300);
    const t3 = setTimeout(forceScrollToTop, 800);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [location.pathname, location.key]);

  useEffect(() => {
    setActivePath(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const startLoading = (id: string) => {
    setActiveTasks((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const stopLoading = (id: string) => {
    setActiveTasks((prev) => prev.filter((t) => t !== id));
  };

  // Synchronized Intro Curtain Sweep
  useEffect(() => {
    const playIntro = sessionStorage.getItem('playDashboardIntro') === 'true';
    let hideTimer: ReturnType<typeof setTimeout>;

    if (playIntro) {
      setCurtainHidden(false);
      setSlideOut(false);

      const timer = setTimeout(() => {
        setSlideOut(true);
        sessionStorage.removeItem('playDashboardIntro');
      }, 50);

      hideTimer = setTimeout(() => {
        setCurtainHidden(true);
      }, 1600);

      return () => {
        clearTimeout(timer);
        clearTimeout(hideTimer);
      };
    } else {
      setSlideOut(true);
      setCurtainHidden(true);
    }

    const hasPrompted = sessionStorage.getItem(
      'palomar_initial_permissions_prompted'
    );
    if (!hasPrompted) {
      sessionStorage.setItem('palomar_initial_permissions_prompted', '1');
      setTimeout(() => {
        promptInitialPermissionsOnLogin().catch(() => {});
      }, 1000);
    }
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutStarted(false);
    setLogoutResting(false);
    setCurtainHidden(false);

    sessionStorage.removeItem('loginIntroPlayed');
    sessionStorage.setItem('loginIntroDone', '0');
    sessionStorage.removeItem('cash_session_closed_banner_dismissed');

    setTimeout(() => {
      setLogoutStarted(true);
    }, 20);

    setTimeout(() => {
      setLogoutResting(true);
    }, 1100);

    setTimeout(async () => {
      await logout();
      navigate('/login', { replace: true, state: { loggedOut: true } });
    }, 1800);
  };

  return (
    <TabLoadingContext.Provider value={{ startLoading, stopLoading, isOnline }}>
      <div className="relative h-[100dvh] overflow-hidden bg-slate-100/90 dark:bg-[#0b0e14] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-500 font-sans">
        {/* GLOBAL PERSISTENT RESTORATION VERIFICATION BANNER */}
        <BackupSafetyBanner />
        {/* CASH SESSION CLOSED NOTICE BANNER */}
        <CashSessionClosedBanner />

        {/* WORKSPACE & APPLICATION BODY */}
        <div className="relative flex-1 flex flex-row min-h-0 overflow-hidden">
          {/* TAB LOADING OVERLAY */}
          <TabLoader isVisible={isTabLoading} />

          {/* CASH FLOAT MODAL */}
          <CashFloatModal />

          {/* GLOBAL SMART SCANNER MODAL OVERLAY */}
          <ScannerPage />

          {/* SIDEBAR: border & shadow active on lg: screens */}
          <aside className="lg:relative lg:z-30 shrink-0 lg:shadow-[4px_0_24px_-4px_rgba(15,23,42,0.06)] dark:shadow-none lg:border-r border-slate-200/80 dark:border-slate-800/80">
            <Sidebar
              collapsed={desktopCollapsed}
              setCollapsed={setDesktopCollapsed}
              mobileOpen={mobileDrawerOpen}
              setMobileOpen={setMobileDrawerOpen}
              onLogout={handleLogout}
            />
          </aside>

          {/* RIGHT CONTAINER VIEWPORT */}
          <div
            className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative bg-[var(--bg-page,#f8fafc)] dark:bg-[#0d1117]"
            style={{ transform: 'translate3d(0, 0, 0)' }}
          >
            {/* Topbar */}
            <div className="relative z-20 shrink-0">
              <Topbar
                onMenuClick={() => setMobileDrawerOpen((prev) => !prev)}
              />
            </div>

            {/* Scrollable Main Content Pane */}
            <div className="flex-1 relative min-w-0 h-full flex flex-col min-h-0">
              {/* Subtle top edge scroll fade */}
              <div className="pointer-events-none absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-slate-200/30 dark:from-black/20 to-transparent z-10" />

              {/* 
                Phone & Tablet Scroll & Responsiveness Fix:
                - Changed overflow-x-hidden to overflow-x-auto so users CAN scroll right to reach off-screen buttons.
                - Added min-w-0 and touch-action pan-x pan-y for smooth mobile gesture scrolling.
                - Reduced tablet/mobile padding (px-2.5 sm:px-4 md:px-6) to save ~20px width on tablet screens.
              */}
              <main
                ref={mainScrollRef}
                className={`flex-1 pt-3 sm:pt-5 md:pt-6 pb-24 lg:pb-8 px-2.5 sm:px-4 md:px-6 xl:px-8 2xl:px-12 overflow-y-auto overflow-x-auto min-w-0 [touch-action:pan-x_pan-y] ${
                  isTabLoading
                    ? 'opacity-0 pointer-events-none'
                    : 'opacity-100 transition-opacity duration-300'
                }`}
              >
                <div className="max-w-[1600px] w-full mx-auto min-h-full flex flex-col min-w-0">
                  <Outlet />
                </div>
              </main>
            </div>
          </div>

          {/* MOBILE BOTTOM NAVIGATION */}
          <Navbar isMobileDrawerOpen={mobileDrawerOpen} />

          {/* SEAMLESS INTRO / OUTRO FLUIDISM CURTAIN */}
          {!curtainHidden && (
            <div
              className={`fixed inset-0 z-[16000] pointer-events-none transition-transform duration-[1500ms] ease-[cubic-bezier(0.77,0,0.175,1)] ${
                isLoggingOut
                  ? logoutStarted
                    ? 'translate-x-0 scale-x-[-1]'
                    : '-translate-x-[250%] scale-x-[-1]'
                  : slideOut
                    ? 'translate-x-[250%] scale-x-100'
                    : 'translate-x-0 scale-x-100'
              }`}
            >
              <div className="relative w-full h-full bg-[var(--bg-page,#f0f4f8)] bg-slate-100 dark:bg-[#0c0e12]">
                <div
                  className={`absolute top-0 right-full -translate-x-4 sm:-translate-x-10 h-full origin-right transition-transform duration-[1300ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    (isLoggingOut ? logoutResting : !slideOut)
                      ? 'scale-x-100'
                      : 'scale-x-[2.5] sm:scale-x-[8]'
                  }`}
                >
                  <div className="absolute top-0 right-8 sm:right-16 h-full w-8 sm:w-16 blur-xl sm:blur-2xl opacity-80 bg-gradient-to-l from-transparent to-blue-600 dark:to-red-600" />
                  <div className="absolute top-0 right-5 sm:right-10 h-full w-4 sm:w-8 bg-[#123c73] dark:bg-[#7a0000] opacity-90" />
                  <div className="absolute top-0 right-2.5 sm:right-5 h-full w-3 sm:w-6 bg-[#295c9a] dark:bg-[#a60303]" />
                  <div className="absolute top-0 right-1 sm:right-2 h-full w-2 sm:w-4 bg-[#539cff] dark:bg-[#e60000] shadow-[0_0_10px_rgba(83,156,255,0.8)] sm:shadow-[0_0_20px_rgba(83,156,255,0.8)] dark:shadow-[0_0_10px_rgba(230,0,0,0.8)] dark:sm:shadow-[0_0_20px_rgba(230,0,0,0.8)]" />
                  <div className="absolute top-0 right-0 h-full w-0.5 sm:w-0.75 bg-white dark:bg-red-100 shadow-[0_0_15px_rgba(255,255,255,1)] sm:shadow-[0_0_25px_rgba(255,255,255,1)] dark:shadow-[0_0_15px_rgba(255,100,100,1)] dark:sm:shadow-[0_0_25px_rgba(255,100,100,1)]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </TabLoadingContext.Provider>
  );
};

export default SystemLayout;
