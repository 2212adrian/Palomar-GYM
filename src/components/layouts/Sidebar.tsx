//src/components/layouts/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Menu, X, ChevronDown, LogOut, LayoutDashboard, 
  Users, ShoppingBag, ClipboardList, Settings
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';

// Texture imports for background accent layers
import axiomTexture from '../../assets/textures/hexagons.svg';
import TwillTexture from '../../assets/textures/hexagons.svg';

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
  description?: string; // Tier 3: Metadata / feature explanation
}

interface MenuItem {
  name: string;
  icon: React.ReactNode;
  roles?: ('admin' | 'staff')[];
  children?: ChildItem[];
}

// Sub-Component to dynamically resolve and render private avatar paths using signed URLs
const SidebarAvatar: React.FC<{ path: string | null | undefined; fallbackChar: string; isMini?: boolean }> = ({ path, fallbackChar, isMini }) => {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!path) {
        setSrcUrl(null);
        return;
      }
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
        setSrcUrl(path);
        return;
      }
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      try {
        const { data, error } = await supabase.storage
          .from('avatars')
          .createSignedUrl(cleanPath, 86400); // 24-hour token expiry

        if (error || !data?.signedUrl) {
          const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(cleanPath);
          setSrcUrl(pubData?.publicUrl || null); // Fixed property name
        } else {
          setSrcUrl(data.signedUrl);
        }
      } catch {
        const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(cleanPath);
        setSrcUrl(pubData?.publicUrl || null); // Fixed property name
      }
    };
    fetchSignedUrl();
  }, [path]);

  if (srcUrl) {
    return <img src={srcUrl} alt="Profile" className="w-full h-full rounded-full object-cover relative z-10" />;
  }

  return (
    <div className={`w-full h-full rounded-full bg-[#1b365d] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading relative z-10 ${isMini ? 'text-xs font-black' : 'text-sm'}`}>
      {fallbackChar}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  onLogout
}) => {
  const location = useLocation();
  const { user, profile } = useAuthStore() as any; 
  const [activeHeaderTab, setActiveHeaderTab] = useState<'profile' | 'target'>('profile');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  // Single-expand Accordion State: Only allows one dropdown to be active
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  // Dedicated Mobile Single-expand State
  const [mobileExpandedMenu, setMobileExpandedMenu] = useState<string | null>(null);

  // Synchronize internal theme state with global theme events
  useEffect(() => {
    const activeTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setTheme(activeTheme);

    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<'dark' | 'light'>;
      setTheme(customEvent.detail);
    };
    window.addEventListener('theme-changed', handleThemeEvent);
    return () => window.removeEventListener('theme-changed', handleThemeEvent);
  }, []);

  // Menu structure (Removed System to convert into static bottom buttons)
  const navigationMenu: MenuItem[] = [
    {
      name: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />,
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
          description: 'Set custom target limits (Day, Week, Month)',
          badge: 'GOALS' 
        }
      ]
    },
    {
      name: 'Members',
      icon: <Users className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />,
      roles: ['admin', 'staff'],
      children: [
        { 
          name: 'Check-In', 
          path: '/members/check-in', 
          description: 'Left Tab — Instant gate/logbook telemetry' 
        },
        { 
          name: 'Member List', 
          path: '/members/list', 
          description: 'Right Tab — Accounts & profiles' 
        },
        { 
          name: 'ID Maker', 
          path: '/members/id-maker', 
          description: 'Subscribed Only — Identity design suite',
          badge: 'PRO' 
        },
        { 
          name: 'Transactions', 
          path: '/members/transactions', 
          description: 'Renew or subscribe payment records' 
        },
        { 
          name: 'Membership Plans', 
          path: '/members/plans', 
          description: 'Creates custom QR Code for hardware access cards' 
        }
      ]
    },
    {
      name: 'Sales',
      icon: <ShoppingBag className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />,
      roles: ['admin', 'staff'],
      children: [
        { 
          name: 'Register Sale', 
          path: '/sales/register', 
          description: 'Left Tab — Cash register interface' 
        },
        { 
          name: 'Product List', 
          path: '/sales/products', 
          description: 'Right Tab — Inventory setup & custom Barcode generation' 
        }
      ]
    },
    {
      name: 'Reports',
      icon: <ClipboardList className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />,
      roles: ['admin'],
      children: [
        { 
          name: 'Incident Reports', 
          path: '/reports/incidents', 
          description: 'Infraction logs and security entries' 
        },
        { 
          name: 'BIR Records', 
          path: '/reports/bir', 
          description: 'Tax export sheets and sales book compliance' 
        }
      ]
    }
  ];

  const allowedMenu = navigationMenu.filter(
    item => !item.roles || (profile && item.roles.includes(profile.role))
  );

  const toggleSubmenu = (menuName: string) => {
    setExpandedMenu(prev => (prev === menuName ? null : menuName));
  };

  const fallbackCharacter = profile?.username?.[0]?.toUpperCase() || 'U';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .tech-scanline::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, transparent 50%, rgba(191, 2, 2, 0.15) 50%);
          background-size: 100% 4px;
          animation: scanline 6s linear infinite;
          pointer-events: none;
        }
      `}} />

      {/* ─── DESKTOP SIDEBAR ─── */}
      <aside 
        className="hidden lg:flex flex-col border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#141414] h-full relative select-none shrink-0 animate-fade-in"
        style={{
          width: collapsed ? '5rem' : '18rem',
          transition: 'width 300ms cubic-bezier(0.77, 0, 0.175, 1)'
        }}
      >
        <div 
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
          style={{ backgroundImage: `url(${axiomTexture})`, backgroundSize: '180px' }}
        />

        {/* ─── DESKTOP HEADER (EXPANDED STATE) ─── */}
        <div className={`border-b border-slate-200 dark:border-white/5 space-y-4 transition-all duration-300 overflow-hidden relative z-10 ${
          collapsed ? 'max-h-0 opacity-0 p-0 border-none pointer-events-none' : 'max-h-56 p-4 opacity-100'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="Icon" className="w-6 h-6 animate-pulse animate-duration-3000" />
              <span className="font-heading text-xs tracking-wider uppercase text-slate-800 dark:text-slate-200">WOLF PALOMAR GYM</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 border border-transparent hover:border-slate-200/50 dark:hover:border-white/5 cursor-pointer text-slate-500 dark:text-slate-400 transition-all duration-350"
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Header tab selectors */}
          <div className="flex border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden bg-slate-50 dark:bg-neutral-900/50 p-1 font-heading text-[10px] tracking-wider shadow-inner">
            <button 
              onClick={() => setActiveHeaderTab('profile')}
              className={`flex-1 py-1.5 rounded-md cursor-pointer transition-all duration-300 font-bold ${
                activeHeaderTab === 'profile' 
                  ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              PROFILE
            </button>
            <button 
              onClick={() => setActiveHeaderTab('target')}
              className={`flex-1 py-1.5 rounded-md cursor-pointer transition-all duration-300 font-bold ${
                activeHeaderTab === 'target' 
                  ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              TARGET
            </button>
          </div>

          {/* Header Content Panel (Adaptive contrast text colors corrected) */}
          <div className="relative h-18 overflow-hidden">
            {activeHeaderTab === 'profile' ? (
              <div className="flex items-center gap-3 animate-slide-up h-full">
                <div className="w-13 h-13 rounded-full border border-slate-200 dark:border-white/10 p-0.5 shrink-0 shadow-lg relative bg-slate-100 dark:bg-neutral-900 overflow-hidden">
                  <div 
                    className="absolute inset-0 opacity-[0.15] mix-blend-overlay" 
                    style={{ backgroundImage: `url(${TwillTexture})` }}
                  />
                  <SidebarAvatar path={profile?.avatar_url || user?.user_metadata?.avatar_url} fallbackChar={fallbackCharacter} />
                </div>
                <div className="overflow-hidden text-left">
                  <h4 className="font-heading text-xs tracking-wider uppercase truncate text-slate-800 dark:text-slate-200">{profile?.username || 'User'}</h4>
                  <p className="text-[9px] font-heading text-[#1b365d] dark:text-[#bf0202] uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    {profile?.role || 'Staff'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">{user?.email}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 animate-slide-up text-[10px] font-bold text-slate-500 dark:text-slate-400 h-full flex flex-col justify-center text-left">
                <div className="flex justify-between font-heading tracking-wider">
                  <span>REVENUE TARGET:</span>
                  <span className="text-slate-900 dark:text-white font-mono font-black">₱5,000 / ₱8,000</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-neutral-800 rounded-full overflow-hidden p-px shadow-inner relative">
                  <div 
                    className="h-full bg-linear-to-r from-blue-500 to-[#1b365d] dark:from-red-600 dark:to-[#bf0202] rounded-full shadow-lg transition-all duration-500" 
                    style={{ width: '62%' }}
                  />
                </div>
                <div className="flex justify-between text-[9px] tracking-widest font-heading">
                  <span className="text-emerald-500 font-extrabold">62% ACHIEVED</span>
                  <span>₱3,000 REMAINING</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── DESKTOP HEADER (COLLAPSED MINIRAIL) ─── */}
        <div className={`flex flex-col items-center gap-4 border-b border-slate-200 dark:border-white/5 relative z-10 transition-all duration-300 ${
          collapsed ? 'p-4 max-h-36 opacity-100' : 'max-h-0 opacity-0 p-0 border-none pointer-events-none overflow-hidden'
        }`}>
          <button
            onClick={() => setCollapsed(false)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 border border-transparent hover:border-slate-200/50 dark:hover:border-white/5 cursor-pointer text-slate-500 dark:text-slate-400 transition-all duration-350 shadow-sm"
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 p-0.5 shrink-0 shadow-lg relative bg-slate-100 dark:bg-neutral-900 overflow-hidden">
            <div 
              className="absolute inset-0 opacity-[0.15] mix-blend-overlay" 
              style={{ backgroundImage: `url(${TwillTexture})` }}
            />
            <SidebarAvatar path={profile?.avatar_url || user?.user_metadata?.avatar_url} fallbackChar={fallbackCharacter} isMini={true} />
          </div>
        </div>

        {/* ─── NAV NAVIGATION BUTTONS ─── */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-3 relative z-10 font-body">
          {allowedMenu.map((item, index) => {
            const isExpanded = !collapsed && expandedMenu === item.name;
            const isChildActive = item.children?.some(child => location.pathname === child.path);

            return (
              <div key={index} className="space-y-1.5">
                <div
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 relative border ${
                    isChildActive 
                      ? 'bg-slate-50 dark:bg-neutral-900/50 border-slate-200 dark:border-white/10 shadow-md' 
                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-neutral-900/30'
                  } ${collapsed ? 'justify-center' : ''}`}
                >
                  <span className={`absolute left-0 top-1/4 h-1/2 w-1 rounded-r-md transition-all duration-300 ${
                    isChildActive 
                      ? 'bg-[#1b365d] dark:bg-[#bf0202] scale-y-100 opacity-100 shadow-[0_0_8px_rgba(191,2,2,0.6)]' 
                      : 'bg-slate-300 dark:bg-neutral-700 scale-y-0 opacity-0'
                  }`} />

                  <Link
                    to={item.children?.[0]?.path || '#'}
                    className="flex items-center gap-3 flex-1 select-none cursor-pointer group"
                    title={collapsed ? item.name : undefined}
                  >
                    <span className={`transition-all duration-300 ${
                      isChildActive 
                        ? 'text-[#1b365d] dark:text-[#bf0202] drop-shadow-[0_0_6px_rgba(191,2,2,0.4)]' 
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-200'
                    }`}>
                      {item.icon}
                    </span>
                    <span className={`text-[11px] font-heading tracking-wider uppercase transition-all duration-300 origin-left overflow-hidden whitespace-nowrap ${
                      collapsed ? 'w-0 opacity-0 scale-x-0 hidden' : 'w-auto opacity-100 scale-x-100 block'
                    } ${isChildActive ? 'text-slate-900 dark:text-white font-black' : 'text-slate-500 dark:text-slate-400 font-bold group-hover:text-slate-800 dark:group-hover:text-slate-200'}`}>
                      {item.name}
                    </span>
                  </Link>

                  {!collapsed && item.children && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSubmenu(item.name);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer rounded-md hover:bg-slate-200/50 dark:hover:bg-neutral-800"
                      aria-label={`Toggle ${item.name} submenu`}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-[#1b365d] dark:text-[#bf0202]' : ''}`} />
                    </button>
                  )}
                </div>

                {!collapsed && item.children && (
                  <div 
                    className={`pl-6 ml-5 border-l border-slate-200 dark:border-white/5 space-y-3 overflow-hidden transition-all duration-500 ease-in-out ${
                      isExpanded ? 'max-h-96 opacity-100 py-1' : 'max-h-0 opacity-0 pointer-events-none'
                    }`}
                  >
                    {item.children.map((child, cIdx) => {
                      const isActive = location.pathname === child.path;
                      return (
                        <Link
                          key={cIdx}
                          to={child.path}
                          className="block relative group/item py-1.5 px-2 rounded-lg transition-all duration-200 hover:bg-slate-50 dark:hover:bg-neutral-900/30"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] uppercase tracking-wider font-heading transition-colors duration-200 ${
                              isActive 
                                ? 'text-[#1b365d] dark:text-[#bf0202] font-black' 
                                : 'text-slate-600 dark:text-slate-400 group-hover/item:text-slate-900 dark:group-hover/item:text-slate-200'
                            }`}>
                              {child.name}
                            </span>
                            {child.badge && (
                              <span className="text-[7px] font-heading font-black tracking-widest px-1.5 py-0.5 bg-red-500/15 text-[#bf0202] dark:text-[#bf0202] border border-red-500/20 rounded-md">
                                {child.badge}
                              </span>
                            )}
                          </div>
                          {child.description && (
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-0.5 leading-tight group-hover/item:text-slate-500 dark:group-hover/item:text-slate-400 transition-colors duration-200">
                              {child.description}
                            </p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer Controls - Re-engineered for perfect PC collapsed symmetry */}
        <div className={`border-t border-slate-200 dark:border-white/5 mt-auto relative z-10 bg-slate-50/30 dark:bg-neutral-950/20 transition-all duration-300 ${
          collapsed ? 'p-3 space-y-4' : 'p-4 space-y-3'
        }`}>
          <Link
            to="/system/account"
            className={`flex items-center justify-center rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200/50 dark:border-white/5 text-slate-700 dark:text-slate-300 hover:opacity-90 transition-all cursor-pointer ${
              collapsed ? 'w-11 h-11 mx-auto' : 'w-full p-3 gap-2.5 font-heading text-[10px] tracking-widest font-black'
            }`}
            title={collapsed ? "System Settings" : undefined}
          >
            <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className={`transition-all duration-300 origin-left ${collapsed ? 'w-0 opacity-0 scale-x-0 hidden' : 'w-auto opacity-100 scale-x-100 block'}`}>SETTINGS</span>
          </Link>

          <button
            onClick={onLogout}
            aria-label="Logout"
            title={collapsed ? "Logout" : undefined}
            className={`flex items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all cursor-pointer ${
              collapsed ? 'w-11 h-11 mx-auto' : 'w-full p-3 gap-2.5 font-heading text-[10px] tracking-widest font-black'
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className={`transition-all duration-300 origin-left ${collapsed ? 'w-0 opacity-0 scale-x-0 hidden' : 'w-auto opacity-100 scale-x-100 block'}`}>LOGOUT</span>
          </button>
        </div>
      </aside>

      {/* ─── MOBILE DRAWER (RIGHT SIDE) ─── */}
      <div className={`fixed inset-0 z-[300] lg:hidden ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div 
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside 
          className={`fixed top-0 right-0 bottom-0 w-80 max-w-full bg-white dark:bg-[#141414] border-l border-slate-200 dark:border-white/5 p-6 flex flex-col justify-between transition-transform duration-300 ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div 
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
            style={{ backgroundImage: `url(${axiomTexture})`, backgroundSize: '180px' }}
          />

          <div className="flex flex-col h-full justify-between relative z-10">
            <div className="space-y-6">
              
              {/* Mobile Header with brand naming updated */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-4">
                <span className="font-heading text-xs tracking-wider uppercase text-slate-800 dark:text-slate-200">WOLF PALOMAR GYM</span>

                <button 
                  onClick={() => setMobileOpen(false)} 
                  aria-label="Close Mobile Drawer"
                  title="Close Drawer"
                  className="text-slate-500 dark:text-slate-400 cursor-pointer p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200/50 dark:border-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile */}
              <div className="flex items-center gap-3 bg-slate-50/50 dark:bg-neutral-900/30 p-3 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-inner">
                <div className="w-12 h-12 rounded-full border border-slate-200 dark:border-white/10 p-0.5 shrink-0 bg-slate-100 dark:bg-neutral-950 overflow-hidden">
                  <SidebarAvatar path={profile?.avatar_url || user?.user_metadata?.avatar_url} fallbackChar={fallbackCharacter} />
                </div>
                <div className="overflow-hidden text-left">
                  <h4 className="font-heading text-xs tracking-wider uppercase text-slate-900 dark:text-white truncate">{profile?.username || 'User'}</h4>
                  <p className="text-[9px] font-heading text-[#1b365d] dark:text-[#bf0202] uppercase tracking-widest">{profile?.role || 'Staff'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">{user?.email}</p>
                </div>
              </div>

              {/* TIER 1 & TIER 2: MOBILE DE-COUPLED ACCORDION NAV */}
              <nav className="space-y-4 pt-2 overflow-y-auto max-h-[55vh] pr-1">
                {allowedMenu.map((item, idx) => {
                  const isMobileExpanded = mobileExpandedMenu === item.name;
                  const isChildActive = item.children?.some(child => location.pathname === child.path);

                  return (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-1 select-none">
                        <Link
                          to={item.children?.[0]?.path || '#'}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2 hover:opacity-85"
                        >
                          <span className={`transition-all duration-300 ${
                            isChildActive 
                              ? 'text-[#1b365d] dark:text-[#bf0202] drop-shadow-[0_0_6px_rgba(191,2,2,0.4)]' 
                              : 'text-slate-500 dark:text-slate-400'
                          }`}>
                            {item.icon}
                          </span>
                          <span className={`font-heading text-[10px] tracking-widest uppercase transition-colors duration-300 ${
                            isChildActive ? 'text-slate-900 dark:text-white font-black' : 'text-slate-400 dark:text-slate-300'
                          }`}>
                            {item.name}
                          </span>
                        </Link>

                        {item.children && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileExpandedMenu(prev => prev === item.name ? null : item.name);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            aria-label={`Toggle ${item.name} Sub-options`}
                          >
                            <ChevronDown 
                              className={`w-3.5 h-3.5 transition-transform duration-300 ${
                                isMobileExpanded ? 'rotate-180 text-[#1b365d] dark:text-[#bf0202]' : ''
                              }`} 
                            />
                          </button>
                        )}
                      </div>

                      {item.children && (
                        <div 
                          className={`pl-3 space-y-3 overflow-hidden transition-all duration-300 ease-in-out ${
                            isMobileExpanded ? 'max-h-64 opacity-100 py-1' : 'max-h-0 opacity-0 pointer-events-none'
                          }`}
                        >
                          {item.children.map((child, cIdx) => {
                            const isActive = location.pathname === child.path;
                            return (
                              <Link
                                key={cIdx}
                                to={child.path}
                                onClick={() => setMobileOpen(false)}
                                className="block group/mob"
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-[11px] font-heading tracking-wider uppercase ${
                                    isActive 
                                      ? 'text-[#1b365d] dark:text-[#bf0202] font-black' 
                                      : 'text-slate-600 dark:text-slate-300 group-hover/mob:text-slate-900 group-hover/mob:text-white'
                                  }`}>
                                    {child.name}
                                  </span>
                                  {child.badge && (
                                    <span className="text-[7px] font-heading font-black tracking-widest px-1 py-0.5 bg-red-500/10 text-[#bf0202] dark:text-[#bf0202] border border-red-500/20 rounded">
                                      {child.badge}
                                    </span>
                                  )}
                                </div>
                                {child.description && (
                                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                                    {child.description}
                                  </p>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>

            {/* Mobile Footer Buttons */}
            <div className="border-t border-slate-200 dark:border-white/5 pt-4 space-y-3 mt-auto">
              
              <Link
                to="/system/account"
                onClick={() => setMobileOpen(false)}
                className="w-full flex items-center justify-center gap-2.5 p-3.5 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-neutral-800 transition-all cursor-pointer font-heading text-[10px] tracking-widest font-black shadow-inner"
              >
                <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>SETTINGS</span>
              </Link>

              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all cursor-pointer font-heading text-[10px] tracking-widest font-black shadow-inner"
              >
                <LogOut className="w-4 h-4" />
                <span>LOGOUT</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};