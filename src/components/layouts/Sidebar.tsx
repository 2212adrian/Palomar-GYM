//src/components/layouts/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  X, ChevronDown, ChevronRight, LogOut, LayoutDashboard, 
  Users, ShoppingBag, ClipboardList, Settings, Sun, Moon 
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (o: boolean) => void;
  onLogout: () => void;
}

interface MenuItem {
  name: string;
  icon: React.ReactNode;
  roles?: ('admin' | 'staff')[];
  children?: { name: string; path: string; roles?: ('admin' | 'staff')[] }[];
}

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
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  // ─── Self-Contained Theme Synchronization ───
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark',  theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const navigationMenu: MenuItem[] = [
    {
      name: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
      roles: ['admin'],
      children: [
        { name: 'Revenue Summary', path: '/dashboard' },
        { name: 'Revenue Goals', path: '/dashboard/goals' }
      ]
    },
    {
      name: 'Members',
      icon: <Users className="w-5 h-5" />,
      roles: ['admin', 'staff'],
      children: [
        { name: 'Check-In', path: '/members/check-in' },
        { name: 'Member List', path: '/members/list' },
        { name: 'ID Maker', path: '/members/id-maker' },
        { name: 'Transactions', path: '/members/transactions' },
        { name: 'Membership Plans', path: '/members/plans' }
      ]
    },
    {
      name: 'Sales',
      icon: <ShoppingBag className="w-5 h-5" />,
      roles: ['admin', 'staff'],
      children: [
        { name: 'Register Sale', path: '/sales/register' },
        { name: 'Product List', path: '/sales/products' }
      ]
    },
    {
      name: 'Reports',
      icon: <ClipboardList className="w-5 h-5" />,
      roles: ['admin'],
      children: [
        { name: 'Incident Reports', path: '/reports/incidents' },
        { name: 'BIR Records', path: '/reports/bir' }
      ]
    },
    {
      name: 'System',
      icon: <Settings className="w-5 h-5" />,
      roles: ['admin'],
      children: [
        { name: 'Audit Logs', path: '/system/audit-logs' },
        { name: 'Settings', path: '/system/settings' }
      ]
    }
  ];

  const allowedMenu = navigationMenu.filter(
    item => !item.roles || (profile && item.roles.includes(profile.role))
  );

  const toggleSubmenu = (menuName: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuName) ? prev.filter(m => m !== menuName) : [...prev, menuName]
    );
  };

  return (
    <>
      {/* ─── DESKTOP SIDEBAR (LEFT) ─── */}
      <aside 
        className="hidden lg:flex flex-col border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#141414] h-full w-full transition-all duration-300 z-300"
      >
        {!collapsed && (
          <div className="p-4 border-b border-slate-200 dark:border-white/5 space-y-4">
            <div className="flex border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden bg-slate-50 dark:bg-neutral-900/50 p-1 font-heading text-[10px] tracking-wider">
              <button 
                onClick={() => setActiveHeaderTab('profile')}
                className={`flex-1 py-1.5 rounded-md cursor-pointer ${activeHeaderTab === 'profile' ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white' : 'text-slate-400'}`}
              >
                PROFILE
              </button>
              <button 
                onClick={() => setActiveHeaderTab('target')}
                className={`flex-1 py-1.5 rounded-md cursor-pointer ${activeHeaderTab === 'target' ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white' : 'text-slate-400'}`}
              >
                TARGET
              </button>
            </div>

            {activeHeaderTab === 'profile' ? (
              <div className="flex items-center gap-3 animate-slide-up">
                <div className="w-12 h-12 rounded-full border border-slate-200 dark:border-white/10 p-0.5 shrink-0">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-[#1b365d] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-sm">
                      {profile?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <div className="overflow-hidden">
                  <h4 className="font-heading text-xs tracking-wider uppercase truncate">{profile?.username || 'User'}</h4>
                  <p className="text-[9px] font-heading text-[#1b365d] dark:text-[#bf0202] uppercase tracking-widest">{profile?.role || 'Staff'}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 animate-slide-up text-[10px] font-bold text-slate-400">
                <div className="flex justify-between">
                  <span>Daily Revenue:</span>
                  <span className="text-slate-900 dark:text-white">₱5,000 / ₱8,000</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div className="w-[62%] h-full bg-[#1b365d] dark:bg-[#bf0202]" />
                </div>
                <div className="flex justify-between">
                  <span>Weekly Goal:</span>
                  <span className="text-slate-900 dark:text-white">62% reached</span>
                </div>
              </div>
            )}
          </div>
        )}

        {collapsed && (
          <div className="p-4 flex justify-center border-b border-slate-200 dark:border-white/5">
            <img src="/favicon.svg" alt="Icon" className="w-8 h-8" />
          </div>
        )}

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {allowedMenu.map((item, index) => {
            const isExpanded = expandedMenus.includes(item.name);
            return (
              <div key={index} className="space-y-1">
                <button
                  onClick={() => !collapsed && toggleSubmenu(item.name)}
                  aria-label={`Toggle ${item.name} Menu`}
                  title={item.name}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer hover:bg-slate-100 dark:hover:bg-neutral-900/50 ${
                    collapsed ? 'justify-center' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 dark:text-slate-400">{item.icon}</span>
                    {!collapsed && <span className="text-xs font-heading tracking-wider uppercase">{item.name}</span>}
                  </div>
                  {!collapsed && (isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />)}
                </button>

                {!collapsed && isExpanded && item.children && (
                  <div className="pl-8 space-y-1 animate-slide-up border-l border-slate-200 dark:border-white/5 ml-5">
                    {item.children.map((child, cIdx) => (
                      <Link
                        key={cIdx}
                        to={child.path}
                        className={`block py-2 text-[10px] uppercase tracking-wider font-heading hover:text-[#1b365d] dark:hover:text-[#bf0202] transition-colors ${
                          location.pathname === child.path ? 'text-[#1b365d] dark:text-[#bf0202] font-black' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-white/5 space-y-2 mt-auto">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle Sidebar Collapse"
            title="Toggle Sidebar size"
            className="hidden lg:flex w-full items-center justify-center p-2 rounded-lg bg-slate-100 dark:bg-neutral-900 hover:opacity-90 transition-all cursor-pointer font-heading text-[9px] tracking-widest text-slate-400"
          >
            {collapsed ? 'EXPAND' : 'COLLAPSE'}
          </button>
          <button
            onClick={onLogout}
            aria-label="Logout"
            title="Logout"
            className={`w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all cursor-pointer font-heading text-[10px] tracking-widest ${
              collapsed ? 'px-0' : ''
            }`}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>LOGOUT</span>}
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
          className={`absolute top-0 right-0 bottom-0 w-80 max-w-full bg-white dark:bg-[#141414] border-l border-slate-200 dark:border-white/5 p-6 flex flex-col justify-between transition-transform duration-300 ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="space-y-6">
            
            {/* Mobile Drawer Header (With self-contained Light/Dark toggle button) */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-4">
              
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex items-center gap-2.5 bg-slate-100 dark:bg-neutral-900/80 border border-slate-200 dark:border-white/10 rounded-full px-3 py-1.5 shadow-sm cursor-pointer hover:opacity-95 transition-all"
              >
                {/* Palette preview squares */}
                <div className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden" aria-hidden="true">
                  {theme === 'dark' ? (
                    <>
                      <span className="w-2.5 h-2.5 bg-[#0f1012]" />
                      <span className="w-2.5 h-2.5 bg-[#bf0202]" />
                      <span className="w-2.5 h-2.5 bg-[#13161a]" />
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 bg-[#ffffff]" />
                      <span className="w-2.5 h-2.5 bg-[#1b365d]" />
                      <span className="w-2.5 h-2.5 bg-[#f3f4f6]" />
                    </>
                  )}
                </div>
                <span className="text-slate-700 dark:text-slate-300 text-[9px] font-black tracking-widest flex items-center gap-1 font-body">
                  {theme === 'dark' ? (
                    <><Sun className="w-3 h-3 text-amber-400" /><span>LIGHT</span></>
                  ) : (
                    <><Moon className="w-3 h-3 text-indigo-400" /><span>DARK</span></>
                  )}
                </span>
              </button>

              <button 
                onClick={() => setMobileOpen(false)} 
                aria-label="Close Mobile Drawer"
                title="Close Drawer"
                className="text-slate-500 dark:text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border border-slate-200 dark:border-white/10 p-0.5 shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full bg-[#1b365d] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-sm">
                    {profile?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <div className="overflow-hidden">
                <h4 className="font-heading text-xs tracking-wider uppercase text-slate-900 dark:text-white truncate">{profile?.username || 'User'}</h4>
                <p className="text-[9px] font-heading text-[#1b365d] dark:text-[#bf0202] uppercase tracking-widest">{profile?.role || 'Staff'}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>

            <nav className="space-y-4 pt-4 overflow-y-auto max-h-[60vh]">
              {allowedMenu.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="font-heading text-[10px] tracking-widest text-slate-400 dark:text-slate-500 uppercase border-b border-slate-200 dark:border-white/5 pb-1">
                    {item.name}
                  </div>
                  <div className="pl-2 space-y-2">
                    {item.children?.map((child, cIdx) => (
                      <Link
                        key={cIdx}
                        to={child.path}
                        onClick={() => setMobileOpen(false)}
                        className={`block text-[11px] font-heading tracking-wider uppercase ${
                          location.pathname === child.path 
                            ? 'text-[#1b365d] dark:text-[#bf0202] font-black' 
                            : 'text-slate-600 dark:text-slate-300 hover:text-[#1b365d] dark:hover:text-[#bf0202]'
                        }`}
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <div className="border-t border-slate-200 dark:border-white/5 pt-4">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all cursor-pointer font-heading text-[10px] tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              <span>LOGOUT SYSTEM</span>
            </button>
          </div>
        </aside>
      </div>
    </>
  );
};