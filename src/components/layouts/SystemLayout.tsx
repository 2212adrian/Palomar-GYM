// src/components/layouts/SystemLayout.tsx
import React, { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { TabLoader } from '../ui/TabLoader';

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
  const logout = useAuthStore((state) => state.logout);

  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutStarted, setLogoutStarted] = useState(false);
  const [logoutResting, setLogoutResting] = useState(false);
  const [slideOut, setSlideOut] = useState(false);

  // Unmount curtain after animation completes so it never hangs around
  const [curtainHidden, setCurtainHidden] = useState(false);

  // Tab transition & network state
  const [,setActivePath] = useState(location.pathname);
  const [activeTasks, setActiveTasks] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Upgraded: tab loader is now strictly bound to heavy background tasks
  const isTabLoading = activeTasks.length > 0;

  // Track path mutations instantly without triggering artificial loading screen blocks
  useEffect(() => {
    setActivePath(location.pathname);
  }, [location.pathname]);

  // Monitor network connection status
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

  useEffect(() => {
    const playIntro = sessionStorage.getItem('playDashboardIntro') === 'true';
    let hideTimer: ReturnType<typeof setTimeout>;

    if (playIntro) {
      setCurtainHidden(false);
      const timer = setTimeout(() => {
        setSlideOut(true);
        sessionStorage.removeItem('playDashboardIntro');
      }, 50);

      // Hide curtain completely 1600ms after slide starts
      hideTimer = setTimeout(() => {
        setCurtainHidden(true);
      }, 1600);

      return () => {
        clearTimeout(timer);
        clearTimeout(hideTimer);
      };
    } else {
      setSlideOut(true);
      hideTimer = setTimeout(() => {
        setCurtainHidden(true);
      }, 1600);
      return () => clearTimeout(hideTimer);
    }
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutStarted(false);
    setLogoutResting(false);
    setCurtainHidden(false);

    sessionStorage.removeItem('loginIntroPlayed'); 
    sessionStorage.setItem('loginIntroDone', '0'); 
    
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
      <div className="relative h-screen overflow-hidden bg-(--bg-page) text-slate-900 dark:text-slate-100 flex flex-row transition-colors duration-500 font-sans">
        
        {/* TAB LOADING OVERLAY */}
        <TabLoader isVisible={isTabLoading} />

        {/* SIDEBAR */}
        <Sidebar
          collapsed={desktopCollapsed}
          setCollapsed={setDesktopCollapsed}
          mobileOpen={mobileDrawerOpen}
          setMobileOpen={setMobileDrawerOpen}
          onLogout={handleLogout}
        />

        {/* RIGHT CONTAINER VIEWPORT */}
        <div 
          className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative"
          style={{ transform: 'translate3d(0, 0, 0)' }}
        >
          {/* Topbar wrapped in relative z-50 */}
          <div className="relative z-50">
            <Topbar onMenuClick={() => setMobileDrawerOpen(prev => !prev)} />
          </div>

          {/* Scrollable Main Content Pane */}
          <div className="flex-1 relative min-w-0 px-1 sm:px-4 pt-14 sm:pt-16 h-full flex flex-col">
            <main 
              className={`flex-1 pt-0 pb-8 sm:px-8 lg:px-16 overflow-y-auto ${
                isTabLoading 
                  ? 'opacity-0 pointer-events-none' 
                  : 'opacity-100 transition-opacity duration-300'
              }`}
            >
              <div className="max-w-[1600px] w-full mx-auto h-full">
                <Outlet />
              </div>
            </main>
          </div>

        </div>

        {/* MOBILE BOTTOM NAVIGATION */}
        <Navbar />

        {/* SEAMLESS INTRO / OUTRO FLUIDISM CURTAIN */}
        {!curtainHidden && (
          <div
            className={`fixed inset-0 z-[16000] pointer-events-none transition-transform duration-[1500ms] ease-[cubic-bezier(0.77,0,0.175,1)] ${
              isLoggingOut
                ? (logoutStarted ? "translate-x-0 scale-x-[-1]" : "-translate-x-[250%] scale-x-[-1]")
                : (slideOut ? "translate-x-[250%] scale-x-100" : "translate-x-0 scale-x-100")
            }`}
          >
            <div className="relative w-full h-full bg-(--bg-page)">
              <div 
                className={`absolute top-0 right-full -translate-x-4 sm:-translate-x-10 h-full origin-right transition-transform duration-[1300ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  (isLoggingOut ? logoutResting : !slideOut) 
                    ? "scale-x-100" 
                    : "scale-x-[2.5] sm:scale-x-[8]"
                }`}
              >
                <div
                  className="
                    absolute
                    top-0
                    right-8
                    sm:right-16
                    h-full
                    w-8
                    sm:w-16
                    blur-xl
                    sm:blur-2xl
                    opacity-80
                    bg-gradient-to-l
                    from-transparent
                    to-blue-600
                    dark:to-red-600
                  "
                />

                <div
                  className="
                    absolute
                    top-0
                    right-5
                    sm:right-10
                    h-full
                    w-4
                    sm:w-8
                    bg-[#123c73]
                    dark:bg-[#7a0000]
                    opacity-90
                  "
                />

                <div
                  className="
                    absolute
                    top-0
                    right-2.5
                    sm:right-5
                    h-full
                    w-3
                    sm:w-6
                    bg-[#295c9a]
                    dark:bg-[#a60303]
                  "
                />

                <div
                  className="
                    absolute
                    top-0
                    right-1
                    sm:right-2
                    h-full
                    w-2
                    sm:w-4
                    bg-[#539cff]
                    dark:bg-[#e60000]
                    shadow-[0_0_10px_rgba(83,156,255,0.8)]
                    sm:shadow-[0_0_20px_rgba(83,156,255,0.8)]
                    dark:shadow-[0_0_10px_rgba(230,0,0,0.8)]
                    dark:sm:shadow-[0_0_20px_rgba(230,0,0,0.8)]
                  "
                />

                <div
                  className="
                    absolute
                    top-0
                    right-0
                    h-full
                    w-[2px]
                    sm:w-[3px]
                    bg-white
                    dark:bg-red-100
                    shadow-[0_0_15px_rgba(255,255,255,1)]
                    sm:shadow-[0_0_25px_rgba(255,255,255,1)]
                    dark:shadow-[0_0_15px_rgba(255,100,100,1)]
                    dark:sm:shadow-[0_0_25px_rgba(255,100,100,1)]
                  "
                />
              </div>

            </div>
          </div>
        )}
      </div>
    </TabLoadingContext.Provider>
  );
};

export default SystemLayout;