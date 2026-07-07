import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

export const SystemLayout: React.FC = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [slideOut, setSlideOut] = useState(false);

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
    
    // ─── Reset the login intro keys so the animation plays on next mount ───
    sessionStorage.removeItem('loginIntroPlayed'); 
    sessionStorage.setItem('loginIntroDone', '0'); 
    
    setTimeout(async () => {
      await logout();
      // Explicitly pass the loggedOut state to reinforce the transition trigger
      navigate('/login', { replace: true, state: { loggedOut: true } });
    }, 1500);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-(--bg-page) text-slate-900 dark:text-slate-100 flex flex-row transition-colors duration-500 font-sans">
      
      {/* 1. SIDEBAR */}
      <Sidebar
        collapsed={desktopCollapsed}
        setCollapsed={setDesktopCollapsed}
        mobileOpen={mobileDrawerOpen}
        setMobileOpen={setMobileDrawerOpen}
        onLogout={handleLogout}
      />

      {/* 2. RIGHT CONTAINER VIEWPORT */}
      <div 
        className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative"
        style={{ transform: 'translate3d(0, 0, 0)' }}
      >
        
        <Topbar onMenuClick={() => setMobileDrawerOpen(prev => !prev)} />

        {/* Scrollable Main Content Pane (Set to lg:overflow-hidden to prevent outer scrollbar on PC) */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden relative min-w-0 px-4 pt-16 pb-20 h-full">
          {/* Applied margins & responsive padding for clean content layout spacing with zero top padding */}
          <main className="h-full pt-0 pb-4 sm:pt-0 sm:px-20 sm:pb-20 lg:pt-0 lg:px-16 lg:pb-16 overflow-y-auto">
            {/* Max width wrapper to prevent infinite horizontal stretch on ultra-wide screens */}
            <div className="max-w-[1600px] w-full mx-auto h-full">
              <Outlet />
            </div>
          </main>
        </div>

      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <Navbar />

      {/* 3. SEAMLESS INTRO/OUTRO OVERLAY CURTAIN */}
      <div 
        className={`fixed inset-0 z-16000 bg-(--bg-page) pointer-events-none transition-transform duration-1500 ease-[cubic-bezier(0.77,0,0.175,1)] ${
          (isLoggingOut || !slideOut) ? 'translate-x-0' : 'translate-x-full'
        }`} 
      />

    </div>
  );
};