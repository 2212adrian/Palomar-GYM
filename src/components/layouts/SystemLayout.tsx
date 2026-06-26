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

  // 1. Replaced showIntro with a clean, single-state slide tracker
  const [slideOut, setSlideOut] = useState(false);

  useEffect(() => {
    const playIntro = sessionStorage.getItem('playDashboardIntro') === 'true';
    if (playIntro) {
      // Swipe curtain off-screen to the right after brief paint delay
      const timer = setTimeout(() => {
        setSlideOut(true);
        sessionStorage.removeItem('playDashboardIntro');
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // If not playing intro (e.g. refreshed), start ready immediately
      setSlideOut(true);
    }
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true); // Slides curtain back in from the right (covers screen)
    sessionStorage.setItem('loginIntroDone', '0'); 
    setTimeout(async () => {
      await logout();
      navigate('/login', { replace: true });
    }, 1500);
  };

 return (
    <div className="relative h-screen overflow-hidden bg-[var(--bg-page)] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-500 font-sans">
      
      {/* 1. TOPBAR - Spans 100% width */}
      <Topbar onMenuClick={() => setMobileDrawerOpen(true)} />

      {/* 2. SPLIT LAYOUT PANEL (Now completely static and aligned under Topbar) */}
      <div className="flex flex-1 overflow-hidden admin-split-container">
        
        {/* Left Sidebar Pane */}
        <div className={`admin-left h-full z-40 transition-all duration-300 ${desktopCollapsed ? 'w-20' : 'w-72'}`}>
          <Sidebar
            collapsed={desktopCollapsed}
            setCollapsed={setDesktopCollapsed}
            mobileOpen={mobileDrawerOpen}
            setMobileOpen={setMobileDrawerOpen}
            onLogout={handleLogout}
          />
        </div>

        {/* Right Content Pane */}
        <div className="admin-right flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
          <main className="flex-1 p-6 pb-24 lg:pb-6">
            <Outlet />
          </main>
        </div>

      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <Navbar onMoreClick={() => setMobileDrawerOpen(true)} />

      {/* 3. SEAMLESS INTRO/OUTRO SLIDE OVERLAY (Curtain) */}
      {/* Kept permanently mounted in DOM to ensure smooth, un-interrupted transition directions both ways */}
      <div 
        className={`fixed inset-0 z-[16000] bg-[var(--bg-page)] pointer-events-none transition-transform duration-[1500ms] ease-[cubic-bezier(0.77,0,0.175,1)] ${
          (isLoggingOut || !slideOut) ? 'translate-x-0' : 'translate-x-full'
        }`} 
      />

    </div>
  );
};