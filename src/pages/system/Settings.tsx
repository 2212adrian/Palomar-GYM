import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { PersonalAccount } from './PersonalAccount';
import { GymProfile } from './GymProfile';
import { RatesPayments } from './RatesPayments';
import { UserManagement } from './UserManagement';
import { DatabaseBackup } from './DatabaseBackup';
import { Notifications } from './Notifications';
import { AuditLogs } from './AuditLogs';
import { 
  User as UserIcon, 
  Building, 
  CreditCard, 
  Users, 
  Database, 
  Bell, 
  FileText 
} from 'lucide-react';

export type TabID = 'account' | 'gym-profile' | 'rates' | 'users' | 'backup' | 'notifications' | 'audit';

export interface TabItem {
  id: TabID;
  label: string;
  icon: React.ComponentType<any>;
  adminOnly: boolean;
}

const TABS: TabItem[] = [
  { id: 'account', label: 'Personal Account', icon: UserIcon, adminOnly: false },
  { id: 'gym-profile', label: 'Gym Profile', icon: Building, adminOnly: true },
  { id: 'rates', label: 'Rates & Payments', icon: CreditCard, adminOnly: true },
  { id: 'users', label: 'User Management', icon: Users, adminOnly: true },
  { id: 'backup', label: 'Database Backup', icon: Database, adminOnly: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, adminOnly: true },
  { id: 'audit', label: 'Audit Logs', icon: FileText, adminOnly: true },
];

export default function Settings() {
  const { user, profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabID>('account');
  const isScrollingRef = useRef(false);
  
  // Callback ref guarantees the IntersectionObserver binds correctly on mount
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  
  const userRole = profile?.role || user?.app_metadata?.role || 'staff';
  const isSuperAdmin = user?.email === 'wolf.palomar@gmail.com';
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const visibleTabs: TabItem[] = TABS.filter((tab: TabItem) => !tab.adminOnly || isAdmin);

  useEffect(() => {
    if (!scrollContainer) return;

    const observerOptions = {
      root: scrollContainer,
      rootMargin: '-10% 0px -40% 0px',
      threshold: [0, 0.15, 0.3]
    };

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      if (isScrollingRef.current) return;

      const activeEntries = entries.filter(entry => entry.isIntersecting);
      if (activeEntries.length > 0) {
        activeEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const topSectionId = activeEntries[0].target.id.replace('section-', '') as TabID;
        setActiveTab(topSectionId);
      }
    };

    const observer = new IntersectionObserver(handleIntersection, observerOptions);

    visibleTabs.forEach((tab: TabItem) => {
      const el = document.getElementById(`section-${tab.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [scrollContainer, visibleTabs]);

  const handleTabClick = (tabId: TabID) => {
    const targetElement = document.getElementById(`section-${tabId}`);
    if (targetElement) {
      isScrollingRef.current = true;
      setActiveTab(tabId);
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 700);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl lg:h-full flex flex-col overflow-hidden">
      {/* Header (fixed, no-shrink) */}
      <div className="mb-8 shrink-0">
        <h1 className="text-3xl font-heading tracking-wider text-slate-900 dark:text-slate-100 uppercase">System Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-body">
          Manage your account security, pre-register staff personnel, and update gym attributes.
        </p>
      </div>

      {/* Main split-view area (fits height to parent layout pane, prevents external layout overflow) */}
      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar Menu */}
        <div className="w-full lg:w-64 shrink-0 lg:h-full lg:overflow-y-auto scrollbar-none z-10 space-y-6">
          
          {/* Category: Personal Settings */}
          <div className="space-y-2">
            <span className="text-[10px] font-heading tracking-widest text-slate-400 dark:text-slate-500 uppercase block px-4">
              Personal Area
            </span>
            <nav className="flex flex-col gap-1">
              {visibleTabs.filter((tab: TabItem) => !tab.adminOnly).map((tab: TabItem) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`flex items-center gap-3 px-4 py-3 text-[10px] font-heading tracking-widest uppercase rounded-xl text-left transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-xs scale-[1.02]'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-900/50 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {isAdmin && (
            <hr className="border-slate-200 dark:border-white/5 mx-4" />
          )}

          {/* Category: Administration Console */}
          {isAdmin && (
            <div className="space-y-2">
              <span className="text-[10px] font-heading tracking-widest text-slate-400 dark:text-slate-500 uppercase block px-4">
                Admin Console
              </span>
              <nav className="flex flex-col gap-1">
                {visibleTabs.filter((tab: TabItem) => tab.adminOnly).map((tab: TabItem) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab.id)}
                      className={`flex items-center gap-3 px-4 py-3 text-[10px] font-heading tracking-widest uppercase rounded-xl text-left transition-all duration-200 cursor-pointer ${
                        isActive
                          ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-xs scale-[1.02]'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-900/50 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          )}
        </div>

        {/* Configuration Sections Panel List - Restored snap-y snap-mandatory classes */}
        <div 
          ref={setScrollContainer}
          className="flex-1 h-full overflow-y-auto snap-y snap-mandatory scroll-smooth pr-2"
        >
          
          {/* Section: Personal Account */}
          {visibleTabs.some((t: TabItem) => t.id === 'account') && (
            <section id="section-account" className="snap-start h-full min-h-full shrink-0 overflow-y-auto scrollbar-none bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 md:p-8">
              <PersonalAccount />
            </section>
          )}

          {/* Section: Gym Profile */}
          {visibleTabs.some((t: TabItem) => t.id === 'gym-profile') && (
            <section id="section-gym-profile" className="snap-start h-full min-h-full shrink-0 overflow-y-auto scrollbar-none bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 md:p-8">
              <GymProfile />
            </section>
          )}

          {/* Section: Rates & Payments */}
          {visibleTabs.some((t: TabItem) => t.id === 'rates') && (
            <section id="section-rates" className="snap-start h-full min-h-full shrink-0 overflow-y-auto scrollbar-none bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 md:p-8">
              <RatesPayments />
            </section>
          )}

          {/* Section: User Management */}
          {visibleTabs.some((t: TabItem) => t.id === 'users') && (
            <section id="section-users" className="snap-start h-full min-h-full shrink-0 overflow-y-auto scrollbar-none bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 md:p-8">
              <UserManagement />
            </section>
          )}

          {/* Section: Backup */}
          {visibleTabs.some((t: TabItem) => t.id === 'backup') && (
            <section id="section-backup" className="snap-start h-full min-h-full shrink-0 overflow-y-auto scrollbar-none bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 md:p-8">
              <DatabaseBackup />
            </section>
          )}

          {/* Section: Notifications */}
          {visibleTabs.some((t: TabItem) => t.id === 'notifications') && (
            <section id="section-notifications" className="snap-start h-full min-h-full shrink-0 overflow-y-auto scrollbar-none bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 md:p-8">
              <Notifications />
            </section>
          )}

          {/* Section: Audit Logs */}
          {visibleTabs.some((t: TabItem) => t.id === 'audit') && (
            <section id="section-audit" className="snap-start h-full min-h-full shrink-0 overflow-y-auto scrollbar-none bg-white dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm p-6 md:p-8 pb-12">
              <AuditLogs />
            </section>
          )}

        </div>
      </div>
    </div>
  );
}