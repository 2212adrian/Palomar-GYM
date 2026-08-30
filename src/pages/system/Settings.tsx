// src/pages/system/Settings.tsx
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { PersonalAccount } from './PersonalAccount';
import { GymProfile } from './GymProfile';
import { RatesPayments } from './RatesPayments';
import { UserManagement } from './UserManagement';
import { DatabaseBackup } from './DatabaseBackup';
import { AuditLogs } from './AuditLogs';
import { isSuperAdmin } from '../../constants/auth';
import { SystemInformation } from './SystemInformation';
import { PermissionsSettings } from './PermissionsSettings';
import { 
  User as UserIcon, 
  Building, 
  CreditCard, 
  Users, 
  Database, 
  FileText,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Save,
  Loader2,
  Sun,
  Moon
} from 'lucide-react';

export type TabID = 'account' | 'permissions' | 'gym-profile' | 'rates' | 'users' | 'backup' | 'audit' | 'info';

export interface TabItem {
  id: TabID;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  adminOnly: boolean;
}

const TABS: TabItem[] = [
  { 
    id: 'account', 
    label: 'Personal Account', 
    description: 'Update your account credentials', 
    icon: UserIcon, 
    adminOnly: false 
  },
  {
    id: 'permissions',
    label: 'Device Permissions',
    description: 'Camera & notification access',
    icon: ShieldCheck,
    adminOnly: false
  },
  { 
    id: 'gym-profile', 
    label: 'Gym Profile', 
    description: 'Manage business information', 
    icon: Building, 
    adminOnly: true 
  },
  { 
    id: 'rates', 
    label: 'Rates & Payments', 
    description: 'Configure memberships', 
    icon: CreditCard, 
    adminOnly: true 
  },
  { 
    id: 'users', 
    label: 'User Management', 
    description: 'Manage staff accounts', 
    icon: Users, 
    adminOnly: true 
  },
  { 
    id: 'backup', 
    label: 'Database Backup', 
    description: 'Backup and restore data', 
    icon: Database, 
    adminOnly: true 
  },
  { 
    id: 'audit', 
    label: 'Audit Logs', 
    description: 'View security history', 
    icon: FileText, 
    adminOnly: true 
  },
  { 
    id: 'info', 
    label: 'System Information', 
    description: 'Storage metrics & specifications', 
    icon: FileText, 
    adminOnly: true 
  },
];

const TAB_URL_MAP: Record<TabID, string> = {
  'account': 'personal-account',
  'permissions': 'device-permissions',
  'gym-profile': 'gym-profile',
  'rates': 'rates-and-payments',
  'users': 'user-management',
  'backup': 'database-backup',
  'audit': 'audit-logs',
  'info': 'system-information' 
};

const URL_TAB_MAP: Record<string, TabID> = {
  'personal-account': 'account',
  'device-permissions': 'permissions',
  'gym-profile': 'gym-profile',
  'rates-and-payments': 'rates',
  'user-management': 'users',
  'database-backup': 'backup',
  'audit-logs': 'audit',
  'system-information': 'info'
};

export default function Settings() {
  const { user, profile } = useAuthStore();
  const { activeTab: urlTabParam } = useParams<{ activeTab: string }>();
  const navigate = useNavigate();

  const activeTab = useMemo<string>(() => {
    if (!urlTabParam) return 'personal-account';
    return urlTabParam;
  }, [urlTabParam]);

  const activeTabId = useMemo<TabID>(() => {
    if (!urlTabParam) return 'account';
    return URL_TAB_MAP[urlTabParam] || 'account';
  }, [urlTabParam]);

  const [mobileView, setMobileView] = useState<'menu' | 'detail'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      const path = window.location.pathname;
      if (path.includes('/settings/') && !path.endsWith('/settings')) {
        return 'detail';
      }
    }
    return 'menu';
  });

  const [navigatingTab, setNavigatingTab] = useState<string | null>(null);
  const [isChildDirty, setIsChildDirty] = useState<boolean>(false);
  const [isChildSaving, setIsChildSaving] = useState<boolean>(false);
  
  const userRole = profile?.role || user?.app_metadata?.role || 'staff';
  const isAdmin = userRole === 'admin' || isSuperAdmin(user?.email);
  const visibleTabs: TabItem[] = TABS.filter((tab: TabItem) => !tab.adminOnly || isAdmin);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const root = document.documentElement;
    root.classList.toggle('dark', nextTheme === 'dark');
    root.classList.toggle('light', nextTheme === 'light');
    localStorage.setItem('theme', nextTheme);
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: nextTheme }));
  };

  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<'dark' | 'light'>;
      setTheme(customEvent.detail);
    };
    window.addEventListener('theme-changed', handleThemeEvent);
    return () => window.removeEventListener('theme-changed', handleThemeEvent);
  }, []);

  useEffect(() => {
    if (urlTabParam && urlTabParam === navigatingTab) {
      setMobileView('detail');
      setNavigatingTab(null);
    }
  }, [urlTabParam, navigatingTab]);

  useEffect(() => {
    if (!urlTabParam) {
      setMobileView('menu');
    } else {
      setMobileView('detail');
    }
  }, [urlTabParam]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1280 && !urlTabParam) {
      navigate('/settings/personal-account', { replace: true });
    }
  }, [urlTabParam, navigate]);

  useEffect(() => {
    const isMobile = window.innerWidth < 1280;
    
    const delayTimeout = setTimeout(() => {
      if (isMobile) {
        if (mobileView === 'detail') {
          const activeLabel = TABS.find(t => t.id === activeTabId)?.label || '';
          window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: activeLabel }));
        } else {
          window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: null }));
        }
      } else {
        const activeLabel = TABS.find(t => t.id === activeTabId)?.label || '';
        window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: activeLabel }));
      }
    }, 100); 

    return () => clearTimeout(delayTimeout);
  }, [activeTabId, mobileView]);

  useEffect(() => {
    const handleDirtyState = (e: Event) => {
      const customEvent = e as CustomEvent<{ isDirty: boolean; isSaving: boolean }>;
      setIsChildDirty(customEvent.detail.isDirty);
      setIsChildSaving(customEvent.detail.isSaving);
    };

    window.addEventListener('settings-dirty-state', handleDirtyState);
    return () => {
      window.removeEventListener('settings-dirty-state', handleDirtyState);
    };
  }, []);

  useEffect(() => {
    const handleSettingsGoBack = () => {
      handleGoBack();
    };
    window.addEventListener('settings-go-back', handleSettingsGoBack);
    return () => window.removeEventListener('settings-go-back', handleSettingsGoBack);
  }, [isChildDirty]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: null }));
    };
  }, []);

  const handleTabClick = (tabId: TabID) => {
    if (isChildDirty) {
      window.dispatchEvent(new CustomEvent('trigger-rates-cancel'));
    }

    const pathSegment = TAB_URL_MAP[tabId];
    if (pathSegment) {
      if (urlTabParam === pathSegment) {
        setMobileView('detail');
      } else {
        setNavigatingTab(pathSegment);
        navigate(`/settings/${pathSegment}`);
      }
    }
  };

  const handleGoBack = () => {
    if (isChildDirty) {
      window.dispatchEvent(new CustomEvent('trigger-rates-cancel'));
    }
    setMobileView('menu');
    navigate('/settings'); 
  };

  const handleTriggerChildSave = () => {
    window.dispatchEvent(new CustomEvent('trigger-rates-save'));
  };

  const handleTriggerChildCancel = () => {
    window.dispatchEvent(new CustomEvent('trigger-rates-cancel'));
  };

  return (
    <div className={`mx-auto pt-4 pb-16 ${activeTabId === 'audit' ? 'px-0 sm:px-3' : 'px-4 sm:px-3'} xl:pt-4 xl:px-4 xl:pb-2 max-w-full w-full h-auto xl:h-[calc(100vh-7.5rem)] xl:max-h-[820px] xl:min-h-[580px] flex flex-col overflow-visible xl:overflow-hidden relative`}>
      
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Header */}
      <div className="hidden xl:block mb-6 shrink-0">
        <h1 className="text-xl font-heading tracking-widest text-slate-900 dark:text-slate-100 uppercase">
          System Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your account security, pre-register staff personnel, and update gym attributes.
        </p>
      </div>

      {/* Main Split-View Area */}
      <div className="flex flex-col xl:flex-row gap-8 flex-1 min-h-0 overflow-hidden">
        
        {/* Mobile / Tablet Navigation List */}
        <div className={`${mobileView === 'menu' ? 'block animate-slide-up' : 'hidden'} xl:hidden w-full shrink-0 overflow-y-auto h-full scrollbar-none pb-12`}>
          <nav className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2 sm:px-0">
            {visibleTabs.map((tab: TabItem) => {
              const Icon = tab.icon;
              const isActive = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer active:scale-95 text-left ${
                    isActive
                      ? 'bg-blue-600 dark:bg-red-600 text-white border-blue-600 dark:border-red-600 shadow-md'
                      : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-red-500 hover:bg-blue-500/5 dark:hover:bg-red-500/10'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-white/15 text-white' 
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 dark:group-hover:text-red-500'
                    }`}>
                      <Icon className="w-6 h-6 shrink-0" />
                    </div>
                    <div>
                      <h3 className={`font-semibold text-sm xl:text-base transition-colors ${
                        isActive ? 'text-white' : 'text-slate-800 dark:text-slate-100'
                      }`}>
                        {tab.label}
                      </h3>
                      <p className={`text-xs transition-colors mt-0.5 ${
                        isActive ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {tab.description}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 shrink-0 transition-transform ${
                    isActive ? 'text-white translate-x-1' : 'text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-red-500'
                  }`} />
                </button>
              );
            })}

            {/* Dynamic Theme Toggle in Mobile List */}
            <button
              onClick={toggleTheme}
              className="group/theme flex items-center justify-between p-4 rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-neutral-900/20 hover:bg-slate-100 dark:hover:bg-neutral-900/40 text-slate-700 dark:text-slate-300 transition-all duration-200 cursor-pointer text-left active:scale-95 md:col-span-2"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-white dark:bg-[#111315] border border-slate-200/50 dark:border-white/5 shadow-xs">
                  {theme === 'dark' ? (
                    <Sun className="w-6 h-6 text-amber-400 shrink-0" />
                  ) : (
                    <Moon className="w-6 h-6 text-indigo-400 shrink-0" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                    {theme === 'dark' ? 'LIGHT THEME' : 'DARK THEME'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {theme === 'dark' ? 'Switch to Light Mode layout' : 'Switch to Dark Mode layout'}
                  </p>
                </div>
              </div>
              <div className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden" aria-hidden="true">
                {theme === 'dark' ? (
                  <>
                    <span className="w-3.5 h-3.5 bg-[#f0f4f8]" />
                    <span className="w-3.5 h-3.5 bg-[#123c73]" />
                    <span className="w-3.5 h-3.5 bg-[#ffffff]" />
                  </>
                ) : (
                  <>
                    <span className="w-3.5 h-3.5 bg-[#0c0e12]" />
                    <span className="w-3.5 h-3.5 bg-[#bf0202]" />
                    <span className="w-3.5 h-3.5 bg-[#161920]" />
                  </>
                )}
              </div>
            </button>
          </nav>
        </div>

        {/* PC Sidebar Navigation */}
        <div className="hidden xl:flex flex-col gap-6 w-70 shrink-0 overflow-y-auto scrollbar-none">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-4">
              Personal Area
            </h4>
            <div className="flex flex-col gap-1">
              {visibleTabs.filter(t => !t.adminOnly).map(tab => {
                const Icon = tab.icon;
                const isActive = activeTabId === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left cursor-pointer active:scale-98 ${
                      isActive
                        ? 'bg-blue-600 dark:bg-[#bf0202] text-white font-semibold shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-4">
                Admin Console
              </h4>
              <div className="flex flex-col gap-1">
                {visibleTabs.filter(t => t.adminOnly).map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTabId === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left cursor-pointer active:scale-98 ${
                        isActive
                          ? 'bg-blue-600 dark:bg-[#bf0202] text-white font-semibold shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dynamic Theme Toggle in PC Sidebar */}
          <div className="px-4 pt-4 border-t border-slate-200 dark:border-white/5 mt-2 animate-slide-up">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-dashed border-slate-200 dark:border-white/10 hover:border-blue-500 dark:hover:border-red-500 bg-slate-50/50 dark:bg-neutral-900/20 hover:bg-slate-100 dark:hover:bg-neutral-900/40 text-slate-700 dark:text-slate-300 transition-all cursor-pointer group/theme"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white dark:bg-[#111315] shadow-xs border border-slate-200/50 dark:border-white/5">
                  {theme === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
                  )}
                </div>
                <span className="text-[10px] font-heading font-black tracking-widest uppercase text-slate-800 dark:text-slate-200">
                  {theme === 'dark' ? 'LIGHT THEME' : 'DARK THEME'}
                </span>
              </div>
              <div className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden scale-90" aria-hidden="true">
                {theme === 'dark' ? (
                  <>
                    <span className="w-2.5 h-2.5 bg-[#f0f4f8]" />
                    <span className="w-2.5 h-2.5 bg-[#123c73]" />
                    <span className="w-2.5 h-2.5 bg-[#ffffff]" />
                  </>
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 bg-[#0c0e12]" />
                    <span className="w-2.5 h-2.5 bg-[#bf0202]" />
                    <span className="w-2.5 h-2.5 bg-[#161920]" />
                  </>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Conditional Workspace Frame */}
        <div className={`${mobileView === 'detail' ? 'flex' : 'hidden xl:flex'} flex-1 min-h-0 h-full xl:bg-white xl:dark:bg-[#111317] xl:rounded-xl xl:border xl:border-slate-200 xl:dark:border-white/5 xl:shadow-sm flex-col overflow-hidden`}>
          
          {/* Back Navigation Bar */}
          {mobileView === 'detail' && (
            <div className="hidden md:flex xl:hidden px-4 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#111315]/50 items-center shrink-0">
              <button
                onClick={handleGoBack}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all active:scale-95 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Settings list
              </button>
            </div>
          )}

          {/* Dynamic inner margin class applied to restore standard PC padding (xl:p-5) on Audit Logs */}
          <div className={`flex-1 h-full overflow-y-auto scroll-smooth ${activeTabId === 'audit' || activeTabId === 'info' ? 'px-0 py-3 xl:p-5' : 'p-3 sm:p-4 md:p-5'}`}>
            {activeTab === 'personal-account' && <PersonalAccount />}
            {activeTab === 'device-permissions' && <PermissionsSettings />}
            {activeTab === 'gym-profile' && <GymProfile />}
            {activeTab === 'rates-and-payments' && <RatesPayments />}
            {activeTab === 'user-management' && <UserManagement />}
            {activeTab === 'database-backup' && <DatabaseBackup />}
            {activeTab === 'audit-logs' && <AuditLogs />}
            {activeTab === 'system-information' && <SystemInformation />}
          </div>
        </div>
      </div>

      {/* FLOATING ACTION BAR */}
      {isChildDirty && (
        <div className="fixed bottom-24 xl:bottom-10 left-1/2 -translate-x-1/2 z-200 flex items-center gap-3 animate-slide-up">
          <button
            onClick={handleTriggerChildCancel}
            className="inline-flex items-center gap-1.5 px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-slate-200 text-[10px] font-heading tracking-widest uppercase rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer border border-slate-200 dark:border-white/5"
          >
            Cancel
          </button>

          <button
            onClick={handleTriggerChildSave}
            disabled={isChildSaving}
            className="inline-flex items-center gap-2.5 px-6 py-3 bg-blue-600 dark:bg-[#bf0202] text-white text-[10px] font-heading tracking-widest uppercase rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer border border-blue-500/20 dark:border-red-500/20"
          >
            {isChildSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4 animate-pulse" />
            )}
            Save Changes
          </button>
        </div>
      )}

    </div>
  );
}