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

// Centralized directory of paths that actively query database APIs on mount
const DATA_LOADING_PATHS = [
  '/dashboard',
  '/sales/products',
  '/reports/incident-reports',
  '/system/audit-logs'
];

export const SystemLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);

  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [slideOut, setSlideOut] = useState(false);

  // Tab transition & network state
  const [activePath, setActivePath] = useState(location.pathname);
  const [activeTasks, setActiveTasks] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Determine if the URL path has changed but hasn't completed loading yet
  const isDataLoadingRoute = DATA_LOADING_PATHS.some(path => location.pathname.startsWith(path));
  const isRouteChanging = isDataLoadingRoute && (location.pathname !== activePath);
  const isTabLoading = activeTasks.length > 0 || isRouteChanging;

  // Handle route change transitions selectively based on destination and active loading scopes
  useEffect(() => {
    // 1. Disable loading overlay completely on any Settings views and sub-tabs
    if (location.pathname.startsWith('/settings')) {
      setActivePath(location.pathname);
      return;
    }

    // 2. Do not show the loading screen if the target route has nothing to load
    const isDataLoadingRoute = DATA_LOADING_PATHS.some(path => location.pathname.startsWith(path));
    if (!isDataLoadingRoute) {
      setActivePath(location.pathname);
      return;
    }

    // 3. Trigger transition loaders only on data-heavy views
    startLoading('route-transition');

    const timer = setTimeout(() => {
      setActivePath(location.pathname);
      stopLoading('route-transition');
    }, 650);

    return () => clearTimeout(timer);
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
    if (playIntro) {
      const timer = setTimeout(() => {
        setSlideOut(true);
        sessionStorage.removeItem('playDashboardIntro');
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSlideOut(true);
    }
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    sessionStorage.removeItem('loginIntroPlayed'); 
    sessionStorage.setItem('loginIntroDone', '0'); 
    
    setTimeout(async () => {
      await logout();
      navigate('/login', { replace: true, state: { loggedOut: true } });
    }, 1500);
  };

  return (
    <TabLoadingContext.Provider value={{ startLoading, stopLoading, isOnline }}>
      <div className="relative h-screen overflow-hidden bg-(--bg-page) text-slate-900 dark:text-slate-100 flex flex-row transition-colors duration-500 font-sans">
        
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
          {/* Topbar wrapped in relative z-50 to guarantee the content loader stays underneath */}
          <div className="relative z-50">
            <Topbar onMenuClick={() => setMobileDrawerOpen(prev => !prev)} />
          </div>

          {/* Scrollable Main Content Pane */}
          <div className="flex-1 overflow-y-auto lg:overflow-hidden relative min-w-0 px-4 pt-16 h-full">
            
            {/* TAB LOADING OVERLAY */}
            <TabLoader isVisible={isTabLoading} />

           {/* Main content viewport with conditional fade-out */}
            <main 
              className={`h-full pt-0 pb-4 sm:pt-0 sm:px-20 sm:pb-20 lg:pt-0 lg:px-16 lg:pb-16 overflow-y-auto ${
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

        {/* SEAMLESS INTRO/OUTRO OVERLAY CURTAIN */}
        <div 
          className={`fixed inset-0 z-16000 bg-(--bg-page) pointer-events-none transition-transform duration-1500 ease-[cubic-bezier(0.77,0,0.175,1)] ${
            (isLoggingOut || !slideOut) ? 'translate-x-0' : 'translate-x-full'
          }`} 
        />

      </div>
    </TabLoadingContext.Provider>
  );
};