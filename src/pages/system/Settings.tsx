//src/pages/system/Settings.tsx
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { PersonalAccount } from './PersonalAccount';
import { GymProfile } from './GymProfile';
import { RatesPayments } from './RatesPayments';
import { UserManagement } from './UserManagement';
import { DatabaseBackup } from './DatabaseBackup';
import { AuditLogs } from './AuditLogs';
import { 
  User as UserIcon, 
  Building, 
  CreditCard, 
  Users, 
  Database, 
  Bell, 
  FileText,
  ChevronRight,
  Save,
  Loader2,
  Sun,
  Moon
} from 'lucide-react';

export type TabID = 'account' | 'gym-profile' | 'rates' | 'users' | 'backup' | 'audit';

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
];

export default function Settings() {
  const { user, profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabID>('account');
  const [mobileView, setMobileView] = useState<'menu' | 'detail'>('menu');
  const [isChildDirty, setIsChildDirty] = useState<boolean>(false);
  const [isChildSaving, setIsChildSaving] = useState<boolean>(false);
  
  const userRole = profile?.role || user?.app_metadata?.role || 'staff';
  const isSuperAdmin = user?.email === 'wolf.palomar@gmail.com';
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const visibleTabs: TabItem[] = TABS.filter((tab: TabItem) => !tab.adminOnly || isAdmin);

  // Self-Contained Theme Sync
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
    // Broadcast custom event so Sidebar.tsx and other views stay in sync
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: nextTheme }));
  };

  // Sync internal theme state on global theme changes
  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<'dark' | 'light'>;
      setTheme(customEvent.detail);
    };
    window.addEventListener('theme-changed', handleThemeEvent);
    return () => window.removeEventListener('theme-changed', handleThemeEvent);
  }, []);

  // Dynamic topbar synchronization
  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    
    const delayTimeout = setTimeout(() => {
      if (isMobile) {
        if (mobileView === 'detail') {
          const activeLabel = TABS.find(t => t.id === activeTab)?.label || '';
          window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: activeLabel }));
        } else {
          window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: null }));
        }
      } else {
        const activeLabel = TABS.find(t => t.id === activeTab)?.label || '';
        window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: activeLabel }));
      }
    }, 100); 

    return () => clearTimeout(delayTimeout);
  }, [activeTab, mobileView]);

  // Listen to the settings dirty-state events broadcasted by child views
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

  // Listen to mobile Topbar Go Back triggers
  useEffect(() => {
    const handleSettingsGoBack = () => {
      handleGoBack();
    };
    window.addEventListener('settings-go-back', handleSettingsGoBack);
    return () => window.removeEventListener('settings-go-back', handleSettingsGoBack);
  }, [isChildDirty]);

  // Clean up subtab on unmount
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('settings-subtab-change', { detail: null }));
    };
  }, []);

  const handleTabClick = (tabId: TabID) => {
    // If navigating via the sidebar, discard unsaved changes to unlock viewports
    if (isChildDirty) {
      window.dispatchEvent(new CustomEvent('trigger-rates-cancel'));
    }

    setActiveTab(tabId);
    setMobileView('detail');
  };

  const handleGoBack = () => {
    if (isChildDirty) {
      window.dispatchEvent(new CustomEvent('trigger-rates-cancel'));
    }
    setMobileView('menu');
  };

  const handleTriggerChildSave = () => {
    window.dispatchEvent(new CustomEvent('trigger-rates-save'));
  };

  const handleTriggerChildCancel = () => {
    window.dispatchEvent(new CustomEvent('trigger-rates-cancel'));
  };

  return (
    /* 
      PAGE CONTAINER WRAPPER:
      Configured using 'lg:pb-2' to preserve exactly an 8px margin spacing 
      at the bottom of your PC viewport layout.
    */
    <div className="mx-auto pt-20 pb-36 px-4 sm:px-5 lg:pt-10 lg:px-8 lg:pb-2 max-w-360 lg:h-full flex flex-col overflow-hidden relative">
      
      {/* Dynamic Keyframe Animations */}
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

      {/* Header - Hidden on Mobile (Matched precisely with PersonalAccount format) */}
      <div className="hidden lg:block mb-8 shrink-0">
        <h1 className="text-xl font-heading tracking-widest text-slate-900 dark:text-slate-100 uppercase">
          System Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your account security, pre-register staff personnel, and update gym attributes.
        </p>
      </div>

      {/* Main Split-View Area */}
      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 overflow-hidden">
        
        {/* Mobile Navigation List */}
        <div className={`${mobileView === 'menu' ? 'block animate-slide-up' : 'hidden'} lg:hidden w-full shrink-0`}>
          <nav className="flex flex-col gap-4">
            {visibleTabs.map((tab: TabItem) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
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
                      <h3 className={`font-semibold text-sm lg:text-base transition-colors ${
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

            {/* Dynamic Theme Toggle in Mobile List (Placed uniquely below Audit Logs) */}
            <button
              onClick={toggleTheme}
              className="group/theme flex items-center justify-between p-4 rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-neutral-900/20 hover:bg-slate-100 dark:hover:bg-neutral-900/40 text-slate-700 dark:text-slate-300 transition-all duration-200 cursor-pointer text-left active:scale-95"
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
        <div className="hidden lg:flex flex-col gap-6 w-[280px] shrink-0 overflow-y-auto scrollbar-none">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-4">
              Personal Area
            </h4>
            <div className="flex flex-col gap-1">
              {visibleTabs.filter(t => !t.adminOnly).map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left cursor-pointer active:scale-98 ${
                      isActive
                        ? 'bg-blue-600 dark:bg-red-600 text-white font-semibold shadow-sm'
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
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left cursor-pointer active:scale-98 ${
                        isActive
                          ? 'bg-blue-600 dark:bg-red-600 text-white font-semibold shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Theme Toggle in PC Sidebar (Placed uniquely below Audit Logs) */}
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
          )}
        </div>

        {/* 
          CONDITIONAL MOUNT PANEL WORKSPACE:
          Wraps children conditionally, rendering only the active module in memory.
        */}
        <div className={`${mobileView === 'detail' ? 'flex' : 'hidden lg:flex'} flex-1 min-h-0 h-full lg:bg-white lg:dark:bg-[#141414] lg:rounded-xl lg:border lg:border-slate-200 lg:dark:border-white/5 lg:shadow-sm flex-col overflow-hidden`}>
          <div className="flex-1 h-full overflow-y-auto scroll-smooth pr-2 ml-8 mt-4 mb-4 mr-4">
            {activeTab === 'account' && <PersonalAccount />}
            {activeTab === 'gym-profile' && <GymProfile />}
            {activeTab === 'rates' && <RatesPayments />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'backup' && <DatabaseBackup />}
            {activeTab === 'audit' && <AuditLogs />}
          </div>
        </div>
      </div>

      {/* 
        FLOATING ACTION BAR:
        Displays Cancel (Discard) and Save Changes actions centered at the bottom.
      */}
      {isChildDirty && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 z-200 flex items-center gap-3 animate-slide-up">
          {/* Cancel & Discard Changes */}
          <button
            onClick={handleTriggerChildCancel}
            className="inline-flex items-center gap-1.5 px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-slate-200 text-[10px] font-heading tracking-widest uppercase rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer border border-slate-200 dark:border-white/5"
          >
            Cancel
          </button>

          {/* Save Changes */}
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