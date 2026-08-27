// src/components/layouts/Sidebar.tsx
import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, X, ChevronDown, LogOut, LayoutDashboard, 
  Users, ShoppingBag, ClipboardList, Settings, Loader2
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';

// Package version retrieval matching Login.tsx reference
import pkg from '../../../package.json';

// Texture imports for background accent layers
import axiomTexture from '../../assets/textures/hexagons.svg';

const APP_VERSION = pkg.version || '0.15.0';

import { SidebarProfileFlipper } from './SidebarProfileFlipper';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (o: boolean) => void;
  onLogout: () => void;
}

interface ChildItem {
  name: string;
  path: string;
  roles?: ('admin' | 'staff')[];
  badge?: string;
  description?: string;
}

interface MenuItem {
  name: string;
  icon: React.ReactNode;
  roles?: ('admin' | 'staff')[];
  path?: string;
  children?: ChildItem[];
}

// Memoized Avatar Sub-Component
const SidebarAvatar: React.FC<{ path: string | null | undefined; fallbackChar: string; isMini?: boolean }> = memo(({ path, fallbackChar, isMini }) => {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchSignedUrl = async () => {
      if (!path) {
        if (isMounted) setSrcUrl(null);
        return;
      }
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
        if (isMounted) setSrcUrl(path);
        return;
      }
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      try {
        const { data, error } = await supabase.storage
          .from('avatars')
          .createSignedUrl(cleanPath, 86400);

        if (error || !data?.signedUrl) {
          const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(cleanPath);
          if (isMounted) setSrcUrl(pubData?.publicUrl || null);
        } else {
          if (isMounted) setSrcUrl(data.signedUrl);
        }
      } catch {
        const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(cleanPath);
        if (isMounted) setSrcUrl(pubData?.publicUrl || null);
      }
    };
    fetchSignedUrl();
    return () => { isMounted = false; };
  }, [path]);

  if (srcUrl) {
    return <img src={srcUrl} alt="Profile" className="w-full h-full rounded-full object-cover relative z-10" />;
  }

  return (
    <div className={`w-full h-full rounded-full bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading relative z-10 ${isMini ? 'text-[10px] font-black' : 'text-sm font-bold'}`}>
      {fallbackChar}
    </div>
  );
});

SidebarAvatar.displayName = 'SidebarAvatar';

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  onLogout
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore() as any; 

  // Accordion Expand States
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [mobileExpandedMenu, setMobileExpandedMenu] = useState<string | null>(null);

  // Logout Inline Confirmation States
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [showMobileLogoutConfirm, setShowMobileLogoutConfirm] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileLogoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic Settings Active State Check
  const isSettingsActive = useMemo(() => {
    const currentPath = location.pathname.toLowerCase();
    return currentPath.startsWith('/settings') || currentPath.startsWith('/system/account');
  }, [location.pathname]);

  // Dynamic Navigation Menu Structure
  const navigationMenu: MenuItem[] = useMemo(() => {
    const isMemberSection = location.pathname.startsWith('/members');

    return [
      {
        name: 'DASHBOARD',
        icon: <LayoutDashboard className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />,
        roles: ['admin'],
        children: [
          { 
            name: 'Revenue Summary', 
            path: '/dashboard', 
            description: 'Sales & Logbook real-time metrics' 
          },
          { 
            name: 'Revenue Goals', 
            path: '/dashboard/goals', 
            description: 'Set custom goal limits (Day, Week, Month)',
            badge: 'GOALS' 
          }
        ]
      },
      {
        name: 'LOGBOOK & PLANS',
        icon: isMemberSection ? <Users className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" /> : <ClipboardList className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />,
        roles: ['admin', 'staff'],
        children: [
          { 
            name: 'Logbook', 
            path: '/logbook', 
            description: 'Instant gate/logbook telemetry' 
          },
          { 
            name: 'Member List', 
            path: '/members/list', 
            description: 'Accounts & profiles',
            roles: ['admin']
          },
          { 
            name: 'Membership Plans', 
            path: '/members/plans', 
            description: 'Creates custom QR Code for hardware access cards' 
          }
        ]
      },
      {
        name: 'SALES',
        icon: <ShoppingBag className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />,
        roles: ['admin', 'staff'],
        children: [
          { 
            name: 'Register Sale', 
            path: '/sales', 
            description: 'Point of Registry Sales' 
          },
          { 
            name: 'Product List', 
            path: '/sales/products', 
            description: 'Product Inventory & Barcode generation',
            roles: ['admin']
          }
        ]
      },
      {
        name: 'INCIDENT REPORTS',
        icon: <ClipboardList className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />,
        roles: ['admin', 'staff'],
        path: '/reports'
      }
    ];
  }, [location.pathname]);

  // Role Filtering
  const allowedMenu = useMemo(() => {
    return navigationMenu
      .filter(item => !item.roles || (profile && item.roles.includes(profile.role)))
      .map(item => {
        if (item.children) {
          return {
            ...item,
            children: item.children.filter(child => !child.roles || (profile && child.roles.includes(profile.role)))
          };
        }
        return item;
      })
      .filter(item => item.path || (item.children && item.children.length > 0));
  }, [navigationMenu, profile]);

  // Helper for active child path matching
  const isPathActive = (childPath: string) => {
    const current = location.pathname.toLowerCase().replace(/\/$/, '');
    const target = childPath.toLowerCase().replace(/\/$/, '');
    return current === target;
  };

  // Auto-expand accordion matching active route
  useEffect(() => {
    const activeParent = allowedMenu.find(item => 
      item.children?.some(child => isPathActive(child.path))
    );
    if (activeParent) {
      setExpandedMenu(activeParent.name);
      setMobileExpandedMenu(activeParent.name);
    } else {
      setExpandedMenu(null);
      setMobileExpandedMenu(null);
    }
  }, [location.pathname, allowedMenu]);

  // Parent menu click handler
  const handleParentMenuClick = (item: MenuItem, isMobile = false) => {
    if (item.path && (!item.children || item.children.length === 0)) {
      navigate(item.path);
      if (isMobile) setMobileOpen(false);
      return;
    }

    const visibleChildren = item.children || [];
    const activeChild = visibleChildren.find(child => isPathActive(child.path));

    if (!isMobile && collapsed) {
      if (activeChild) return;
      if (visibleChildren[0]?.path) {
        navigate(visibleChildren[0].path);
      }
      return;
    }

    const currentExpanded = isMobile ? mobileExpandedMenu : expandedMenu;
    const setExpanded = isMobile ? setMobileExpandedMenu : setExpandedMenu;

    if (currentExpanded === item.name) {
      setExpanded(null);
    } else {
      setExpanded(item.name);
      if (!activeChild && visibleChildren[0]?.path) {
        navigate(visibleChildren[0].path);
      }
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', currentUser.id)
          .maybeSingle();

        const goalName = profileData?.username || currentUser.email || 'Unknown User';

        await logAudit(
          'USER_LOGOUT',
          `User "${goalName}" logged out successfully.`,
          currentUser.id
        );
      }
    } catch (err) {
      console.warn('Could not register logout audit record:', err);
    } finally {
      onLogout();
    }
  };

  const triggerDesktopConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (showLogoutConfirm || isLoggingOut) return;

    setShowLogoutConfirm(true);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    logoutTimerRef.current = setTimeout(() => setShowLogoutConfirm(false), 5000);
  };

  const cancelDesktopConfirm = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isLoggingOut) return;
    setShowLogoutConfirm(false);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
  };

  const triggerMobileConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (showMobileLogoutConfirm || isLoggingOut) return;

    setShowMobileLogoutConfirm(true);
    if (mobileLogoutTimerRef.current) clearTimeout(mobileLogoutTimerRef.current);
    mobileLogoutTimerRef.current = setTimeout(() => setShowMobileLogoutConfirm(false), 5000);
  };

  const cancelMobileConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoggingOut) return;
    setShowMobileLogoutConfirm(false);
    if (mobileLogoutTimerRef.current) clearTimeout(mobileLogoutTimerRef.current);
  };

  useEffect(() => {
    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (mobileLogoutTimerRef.current) clearTimeout(mobileLogoutTimerRef.current);
    };
  }, []);

  const fallbackCharacter = profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'W';

  return (
    <>
      {/* ─── DESKTOP SIDEBAR ─── */}
      <aside 
        className="hidden lg:flex flex-col border-r border-slate-200/80 dark:border-white/5 bg-[#f0f4f8] dark:bg-[#0c0e12] h-full relative z-20 select-none shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] transform-gpu will-change-[width]"
        style={{ width: collapsed ? '5.25rem' : '20rem' }}
      >
        <div 
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03] pointer-events-none rounded-r-2xl overflow-hidden" 
          style={{ backgroundImage: `url(${axiomTexture})`, backgroundSize: '180px' }}
        />

        {/* DESKTOP HEADER (EXPANDED STATE) */}
        <div className={`transition-all duration-300 ease-in-out relative z-10 shrink-0 ${
          collapsed ? 'max-h-0 opacity-0 pointer-events-none overflow-hidden' : 'max-h-[380px] opacity-100'
        }`}>
          <div className="relative bg-white/80 dark:bg-[var(--bg-card)]/80 border-b border-slate-200/80 dark:border-white/10 p-4 shadow-xs backdrop-blur-md overflow-hidden">
            <div className="absolute top-0 right-0 md:right-auto md:left-0 w-36 h-20 pointer-events-none overflow-hidden select-none z-0 md:-scale-x-100">
              <svg viewBox="0 0 160 80" className="w-full h-full" preserveAspectRatio="none">
                <path 
                  d="M 25 0 C 65 0, 95 15, 110 38 C 125 60, 142 75, 160 80 L 160 0 Z" 
                  className="fill-[#123c73] opacity-80 dark:fill-[#bf0202] dark:opacity-90 transition-colors duration-300" 
                />
              </svg>
            </div>
            <div className="relative z-10 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-black p-1 flex items-center justify-center border border-slate-700/60 shadow-xs shrink-0">
                    <img src="/favicon.svg" alt="Wolf Palomar Logo" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex flex-col whitespace-nowrap overflow-hidden">
                    <span className="font-heading text-xs font-black tracking-wider uppercase text-slate-900 dark:text-white leading-tight">
                      WOLF PALOMAR GYM
                    </span>
                    <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                      v{APP_VERSION}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse Sidebar"
                  title="Collapse Sidebar"
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-white/90 dark:bg-neutral-800 text-slate-600 dark:text-slate-200 border border-slate-200/80 dark:border-white/10 shadow-xs hover:bg-slate-100 dark:hover:bg-neutral-700 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              <div className="h-px bg-gradient-to-r from-slate-200 via-slate-200/50 to-transparent dark:from-white/10 dark:via-white/5" />

              <SidebarProfileFlipper 
                profile={profile} 
                user={user} 
                fallbackCharacter={fallbackCharacter} 
                avatarElement={<SidebarAvatar path={profile?.avatar_url || user?.user_metadata?.avatar_url} fallbackChar={fallbackCharacter} />} 
              />
            </div>
          </div>
        </div>

        {/* DESKTOP HEADER (COLLAPSED MINIRAIL) */}
        <div className={`flex flex-col items-center gap-4 border-b border-slate-200/80 dark:border-white/5 relative z-10 shrink-0 transition-all duration-300 ease-in-out ${
          collapsed ? 'p-4 max-h-36 opacity-100' : 'max-h-0 opacity-0 p-0 border-none pointer-events-none overflow-hidden'
        }`}>
          <button
            onClick={() => setCollapsed(false)}
            className="p-2.5 rounded-2xl bg-white dark:bg-[#161920] hover:bg-slate-100 dark:hover:bg-[#1e232d] border border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-300 transition-all shadow-xs cursor-pointer"
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 p-0.5 shrink-0 shadow-xs relative bg-slate-100 dark:bg-neutral-900 overflow-hidden">
            <SidebarAvatar path={profile?.avatar_url || user?.user_metadata?.avatar_url} fallbackChar={fallbackCharacter} isMini={true} />
          </div>
        </div>

        {/* ACCORDION NAVIGATION BUTTONS */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 relative z-10 font-body">
          {allowedMenu.map((item, index) => {
            const visibleChildren = item.children || [];
            const isSingleItem = Boolean(item.path && visibleChildren.length === 0);
            const isSingleActive = isSingleItem && item.path ? isPathActive(item.path) : false;
            const isChildActive = visibleChildren.some(child => isPathActive(child.path));
            const isExpanded = !collapsed && expandedMenu === item.name;

            if (isSingleItem && item.path) {
              return (
                <div key={index} className="space-y-2">
                  <Link
                    to={item.path}
                    className={`flex items-center font-heading text-xs tracking-wider uppercase transition-all duration-200 relative border cursor-pointer group ${
                      collapsed 
                        ? 'w-11 h-11 mx-auto rounded-xl justify-center p-0 shrink-0' 
                        : 'w-full h-[56px] px-4 rounded-[16px] justify-between'
                    } ${
                      isSingleActive
                        ? 'bg-[#123c73]/10 text-[#123c73] dark:bg-white/10 dark:text-white border-[#123c73]/30 dark:border-white/20 font-black shadow-xs' 
                        : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-[#161920] dark:text-slate-200 dark:hover:bg-[#1e232d] border-slate-200/80 dark:border-white/5 shadow-xs'
                    }`}
                    title={collapsed ? item.name : undefined}
                  >
                    <div className="flex items-center gap-3 shrink-0 min-w-0">
                      <span className={isSingleActive ? 'text-[#123c73] dark:text-white' : 'text-slate-400 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <span className="whitespace-nowrap font-bold truncate">
                          {item.name}
                        </span>
                      )}
                    </div>
                  </Link>
                </div>
              );
            }

            return (
              <div key={index} className="space-y-2">
                <button
                  onClick={() => handleParentMenuClick(item, false)}
                  className={`flex items-center font-heading text-xs tracking-wider uppercase transition-all duration-200 relative border cursor-pointer group ${
                    collapsed 
                      ? 'w-11 h-11 mx-auto rounded-xl justify-center p-0 shrink-0' 
                      : 'w-full h-[56px] px-4 rounded-[16px] justify-between'
                  } ${
                    (isExpanded || isChildActive)
                      ? 'bg-[#123c73]/10 text-[#123c73] dark:bg-white/10 dark:text-white border-[#123c73]/30 dark:border-white/20 font-black shadow-xs' 
                      : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-[#161920] dark:text-slate-200 dark:hover:bg-[#1e232d] border-slate-200/80 dark:border-white/5 shadow-xs'
                  }`}
                  title={collapsed ? item.name : undefined}
                >
                  <div className="flex items-center gap-3 shrink-0 min-w-0">
                    <span className={(isExpanded || isChildActive) ? 'text-[#123c73] dark:text-white' : 'text-slate-400 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <span className="whitespace-nowrap font-bold truncate">
                        {item.name}
                      </span>
                    )}
                  </div>

                  {!collapsed && (
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-white' : 'opacity-60'}`} />
                  )}
                </button>

                {!collapsed && (
                  <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}>
                    <div className="overflow-hidden">
                      <div className="bg-white dark:bg-[#161920] rounded-[16px] p-3 space-y-2 border border-slate-200/80 dark:border-white/5 shadow-inner">
                        {visibleChildren.map((child, cIdx) => {
                          const isActive = isPathActive(child.path);
                          return (
                            <Link
                              key={cIdx}
                              to={child.path}
                              className={`block p-3 rounded-xl transition-all duration-200 border ${
                                isActive 
                                  ? 'bg-[#123c73]/15 dark:bg-white/10 border-[#123c73]/30 dark:border-white/20 shadow-xs' 
                                  : 'hover:bg-slate-100/60 dark:hover:bg-neutral-800/60 border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                                    isActive 
                                      ? 'bg-[#123c73] dark:bg-white dark:shadow-[0_0_8px_rgba(255,255,255,0.6)] scale-125' 
                                      : 'bg-slate-300 dark:bg-slate-600'
                                  }`} />
                                  <span className={`text-[11px] font-heading tracking-wider uppercase transition-colors ${
                                    isActive 
                                      ? 'text-[#123c73] dark:text-white font-black' 
                                      : 'text-slate-700 dark:text-slate-300 font-bold'
                                  }`}>
                                    {child.name}
                                  </span>
                                </div>

                                {child.badge && (
                                  <span className="text-[7px] font-heading font-black tracking-widest px-1.5 py-0.5 bg-red-500/15 text-[#bf0202] dark:text-red-400 border border-red-500/20 rounded-md shrink-0">
                                    {child.badge}
                                  </span>
                                )}
                              </div>

                              {child.description && (
                                <p className={`text-[10px] font-normal mt-1 pl-4 leading-relaxed ${
                                  isActive ? 'text-[#123c73]/80 dark:text-white/80' : 'text-slate-400 dark:text-slate-500'
                                }`}>
                                  {child.description}
                                </p>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* FOOTER ACTION CONTROLS */}
        <div className={`border-t border-slate-200/80 dark:border-white/5 mt-auto relative z-20 shrink-0 transition-all duration-300 ${
          collapsed ? 'p-3' : 'p-4'
        }`}>
          {collapsed ? (
            <div className="space-y-3 relative">
              <Link
                to="/settings"
                className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl border transition-all cursor-pointer shadow-xs ${
                  isSettingsActive
                    ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white border-transparent shadow-md font-black'
                    : 'bg-white dark:bg-[#161920] border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1e232d]'
                }`}
                title="System Settings"
              >
                <Settings className={`w-4 h-4 shrink-0 ${isSettingsActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              </Link>

              <div className="relative">
                <button
                  onClick={triggerDesktopConfirm}
                  aria-label="Logout"
                  title="Logout"
                  className="w-11 h-11 mx-auto flex items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                </button>

                {showLogoutConfirm && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={cancelDesktopConfirm} />
                    <div className="absolute left-full bottom-0 ml-3 z-50 flex items-center justify-between gap-3 rounded-[16px] bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/10 p-3 shadow-2xl font-heading text-xs tracking-wider whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-150">
                      <span className="text-[10px] font-black text-slate-900 dark:text-white mr-1">
                        {isLoggingOut ? 'PROCESSING...' : 'ARE YOU SURE?'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={isLoggingOut}
                          onClick={cancelDesktopConfirm}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700 font-bold transition-all cursor-pointer text-[10px]"
                        >
                          NO
                        </button>
                        <button
                          disabled={isLoggingOut}
                          onClick={handleLogout}
                          className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all cursor-pointer text-[10px] flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'YES'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div>
              {showLogoutConfirm ? (
                <div className="flex items-center justify-between rounded-[16px] bg-red-500/15 border border-red-500/35 text-red-500 w-full p-2.5 font-heading text-[10px] tracking-widest font-black transition-all">
                  <span className="text-[9px] mr-1 shrink-0">{isLoggingOut ? 'PROCESSING...' : 'ARE YOU SURE?'}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={isLoggingOut}
                      onClick={cancelDesktopConfirm}
                      className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 font-bold transition-all cursor-pointer text-[10px]"
                    >
                      NO
                    </button>
                    <button
                      disabled={isLoggingOut}
                      onClick={handleLogout}
                      className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all cursor-pointer text-[10px] flex items-center justify-center gap-1.5"
                    >
                      {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'YES'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    to="/settings"
                    className={`h-[52px] rounded-[16px] border transition-all flex items-center justify-center gap-2 font-heading text-[11px] tracking-widest font-black shadow-xs cursor-pointer ${
                      isSettingsActive
                        ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white border-transparent shadow-md'
                        : 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-slate-200 border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-[#1e232d]'
                    }`}
                  >
                    <Settings className={`w-4 h-4 shrink-0 ${isSettingsActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>SETTINGS</span>
                  </Link>

                  <button
                    onClick={triggerDesktopConfirm}
                    className="h-[52px] rounded-[16px] bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 dark:border-red-500/30 hover:bg-red-500/20 dark:hover:bg-red-500/25 transition-all flex items-center justify-center gap-2 font-heading text-[11px] tracking-widest font-black shadow-xs cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>LOGOUT</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ─── MOBILE DRAWER ─── */}
      <div className={`fixed inset-0 z-[300] lg:hidden ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div 
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
        />

        <aside 
          className={`fixed top-0 right-0 bottom-0 w-85 max-w-full bg-[#f0f4f8] dark:bg-[#0c0e12] border-l border-slate-200/80 dark:border-white/5 flex flex-col transition-transform duration-300 ease-out shadow-2xl overflow-hidden ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div 
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
            style={{ backgroundImage: `url(${axiomTexture})`, backgroundSize: '180px' }}
          />

          <div className="flex flex-col h-full relative z-10 min-h-0">
            {/* MOBILE HEADER */}
            <div className="relative bg-white/80 dark:bg-neutral-900/80 border-b border-slate-200/80 dark:border-white/10 p-5 shadow-xs backdrop-blur-md overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-36 h-20 pointer-events-none overflow-hidden select-none z-0">
                <svg viewBox="0 0 160 80" className="w-full h-full" preserveAspectRatio="none">
                  <path 
                    d="M 25 0 C 65 0, 95 15, 110 38 C 125 60, 142 75, 160 80 L 160 0 Z" 
                    className="fill-[#123c73] opacity-80 dark:fill-[#bf0202] dark:opacity-90 transition-colors duration-300" 
                  />
                </svg>
              </div>

              <div className="relative z-10 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-black p-1 flex items-center justify-center border border-slate-700/60 shadow-xs shrink-0">
                      <img src="/favicon.svg" alt="Wolf Palomar Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-heading text-xs font-black tracking-wider uppercase text-slate-900 dark:text-white leading-tight">
                        WOLF PALOMAR GYM
                      </span>
                      <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                        v{APP_VERSION}
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setMobileOpen(false)}
                    aria-label="Close Drawer"
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/90 dark:bg-neutral-800 text-slate-700 dark:text-slate-100 border border-slate-200/80 dark:border-white/10 shadow-xs hover:bg-slate-100 dark:hover:bg-neutral-700 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                <div className="h-px bg-gradient-to-r from-slate-200 via-slate-200/50 to-transparent dark:from-white/10 dark:via-white/5" />

                <SidebarProfileFlipper 
                  profile={profile} 
                  user={user} 
                  fallbackCharacter={fallbackCharacter} 
                  avatarElement={<SidebarAvatar path={profile?.avatar_url || user?.user_metadata?.avatar_url} fallbackChar={fallbackCharacter} />} 
                />
              </div>
            </div>

            {/* Mobile Accordion Nav Stack */}
            <nav className="flex-1 min-h-0 overflow-y-auto space-y-3.5 p-5 pt-3">
              {allowedMenu.map((item, idx) => {
                const visibleChildren = item.children || [];
                const isSingleItem = Boolean(item.path && visibleChildren.length === 0);
                const isSingleActive = isSingleItem && item.path ? isPathActive(item.path) : false;
                const isMobileExpanded = mobileExpandedMenu === item.name;

                if (isSingleItem && item.path) {
                  return (
                    <div key={idx} className="space-y-2">
                      <Link
                        to={item.path}
                        onClick={() => setMobileOpen(false)}
                        className={`w-full h-[56px] px-4 rounded-[16px] flex items-center justify-between font-heading text-xs tracking-wider uppercase transition-all duration-200 border cursor-pointer ${
                          isSingleActive 
                            ? 'bg-[#123c73]/10 text-[#123c73] dark:bg-white/10 dark:text-white border-[#123c73]/30 dark:border-white/20 font-black shadow-xs' 
                            : 'bg-white text-slate-700 dark:bg-[#161920] dark:text-slate-200 border-slate-200/80 dark:border-white/5 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={isSingleActive ? 'text-[#123c73] dark:text-white' : 'text-slate-400 dark:text-slate-400'}>
                            {item.icon}
                          </span>
                          <span className="font-bold">{item.name}</span>
                        </div>
                      </Link>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="space-y-2">
                    <button
                      onClick={() => handleParentMenuClick(item, true)}
                      className={`w-full h-[56px] px-4 rounded-[16px] flex items-center justify-between font-heading text-xs tracking-wider uppercase transition-all duration-200 border cursor-pointer ${
                        isMobileExpanded 
                          ? 'bg-[#123c73]/10 text-[#123c73] dark:bg-white/10 dark:text-white border-[#123c73]/30 dark:border-white/20 font-black shadow-xs' 
                          : 'bg-white text-slate-700 dark:bg-[#161920] dark:text-slate-200 border-slate-200/80 dark:border-white/5 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={isMobileExpanded ? 'text-[#123c73] dark:text-white' : 'text-slate-400 dark:text-slate-400'}>
                          {item.icon}
                        </span>
                        <span className="font-bold">{item.name}</span>
                      </div>

                      <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMobileExpanded ? 'rotate-180 text-white' : 'opacity-60'}`} />
                    </button>

                    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      isMobileExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}>
                      <div className="overflow-hidden">
                        <div className="bg-white dark:bg-[#161920] rounded-[16px] p-3 space-y-2 border border-slate-200/80 dark:border-white/5 shadow-inner">
                          {visibleChildren.map((child, cIdx) => {
                            const isActive = isPathActive(child.path);
                            return (
                              <Link
                                key={cIdx}
                                to={child.path}
                                onClick={() => setMobileOpen(false)}
                                className={`block p-3 rounded-xl transition-all duration-200 border ${
                                  isActive 
                                    ? 'bg-[#123c73]/15 dark:bg-white/10 border-[#123c73]/30 dark:border-white/20 shadow-xs' 
                                    : 'hover:bg-slate-100/60 dark:hover:bg-neutral-800/60 border-transparent'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                                      isActive 
                                        ? 'bg-[#123c73] dark:bg-white dark:shadow-[0_0_8px_rgba(255,255,255,0.6)] scale-125' 
                                        : 'bg-slate-300 dark:bg-slate-600'
                                    }`} />
                                    <span className={`text-[11px] font-heading tracking-wider uppercase transition-colors ${
                                      isActive 
                                        ? 'text-[#123c73] dark:text-white font-black' 
                                        : 'text-slate-700 dark:text-slate-300 font-bold'
                                    }`}>
                                      {child.name}
                                    </span>
                                  </div>

                                  {child.badge && (
                                    <span className="text-[7px] font-heading font-black tracking-widest px-1.5 py-0.5 bg-red-500/15 text-[#bf0202] dark:text-red-400 border border-red-500/20 rounded-md">
                                      {child.badge}
                                    </span>
                                  )}
                                </div>

                                {child.description && (
                                  <p className={`text-[10px] font-normal mt-1 pl-4 leading-relaxed ${
                                    isActive ? 'text-[#123c73]/80 dark:text-white/80' : 'text-slate-400 dark:text-slate-500'
                                  }`}>
                                    {child.description}
                                  </p>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* Mobile Footer Sticky Action Controls */}
            <div className="border-t border-slate-200/80 dark:border-white/5 p-5 pt-4 mt-auto shrink-0 bg-[#f0f4f8] dark:bg-[#0c0e12]">
              {showMobileLogoutConfirm ? (
                <div className="w-full flex items-center justify-between p-2.5 rounded-[16px] bg-red-500/15 border border-red-500/35 text-red-500 font-heading text-[10px] tracking-widest font-black transition-all">
                  <span className="text-[9px]">{isLoggingOut ? 'PROCESSING...' : 'ARE YOU SURE?'}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={isLoggingOut}
                      onClick={cancelMobileConfirm}
                      className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]"
                    >
                      NO
                    </button>
                    <button
                      disabled={isLoggingOut}
                      onClick={handleLogout}
                      className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] flex items-center gap-1.5"
                    >
                      {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'YES'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    to="/settings"
                    onClick={() => setMobileOpen(false)}
                    className={`h-[52px] rounded-[16px] border transition-all flex items-center justify-center gap-2 font-heading text-[11px] tracking-widest font-black shadow-xs cursor-pointer ${
                      isSettingsActive
                        ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white border-transparent shadow-md'
                        : 'bg-white dark:bg-[#161920] text-[#123c73] dark:text-slate-200 border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-[#1e232d]'
                    }`}
                  >
                    <Settings className={`w-4 h-4 ${isSettingsActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>SETTINGS</span>
                  </Link>

                  <button
                    onClick={triggerMobileConfirm}
                    className="h-[52px] rounded-[16px] bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 dark:border-red-500/30 hover:bg-red-500/20 dark:hover:bg-red-500/25 transition-all flex items-center justify-center gap-2 font-heading text-[11px] tracking-widest font-black shadow-xs cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>LOGOUT</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};