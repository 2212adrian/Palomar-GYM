// src/pages/system/security-and-permission/index.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert, Camera } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';
import { SecuritySettings } from './SecuritySettings';
import { PermissionsSettings } from './PermissionsSettings';

export { SecuritySettings } from './SecuritySettings';
export { PermissionsSettings } from './PermissionsSettings';

export const SecurityAndPermissions: React.FC = () => {
  const { user } = useAuthStore();
  const isSuperAdminUser = isSuperAdmin(user?.email);

  const [searchParams, setSearchParams] = useSearchParams();
  const initialSub = searchParams.get('sub') === 'device-permissions' ? 'permissions' : 'security';
  const [activeSubTab, setActiveSubTab] = useState<'security' | 'permissions'>(initialSub);

  // Sync subtab state with URL query param if present
  useEffect(() => {
    const sub = searchParams.get('sub');
    if (sub === 'device-permissions') {
      setActiveSubTab('permissions');
    } else if (sub === 'security') {
      setActiveSubTab('security');
    }
  }, [searchParams]);

  const handleSwitchTab = (tab: 'security' | 'permissions') => {
    setActiveSubTab(tab);
    setSearchParams(tab === 'permissions' ? { sub: 'device-permissions' } : { sub: 'security' });
  };

  // Facility Access & Security is for Super Admin only.
  // It becomes "Device Permission" for standard admin and has no other buttons to select between facility access vs hardware & device options.
  if (!isSuperAdminUser) {
    return (
      <div className="w-full">
        <PermissionsSettings />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Segmented Sub-Tab Switcher - Visible to Super Admin Only */}
      <div className="flex justify-center">
        <div className="inline-flex p-1.5 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-inner">
          <button
            type="button"
            onClick={() => handleSwitchTab('security')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-heading font-black tracking-wider uppercase transition-all cursor-pointer ${
              activeSubTab === 'security'
                ? 'bg-white dark:bg-zinc-800 text-red-600 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Facility Access & Security</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('permissions')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-heading font-black tracking-wider uppercase transition-all cursor-pointer ${
              activeSubTab === 'permissions'
                ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Hardware & Device Permissions</span>
          </button>
        </div>
      </div>

      {/* Sub-View Mount */}
      <div className="w-full">
        {activeSubTab === 'security' ? (
          <SecuritySettings />
        ) : (
          <PermissionsSettings />
        )}
      </div>
    </div>
  );
};
