// src/components/security/SecurityAccessBlocker.tsx
import React, { useState } from 'react';
import {
  ShieldAlert,
  MapPin,
  Wifi,
  RefreshCw,
  LogOut,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';
import { useSecurityStore } from '../../stores/useSecurityStore';
import { isSuperAdmin } from '../../constants/auth';
import type { SecurityAccessCheckResult } from '../../lib/securityAccessService';

interface SecurityAccessBlockerProps {
  checkResult: SecurityAccessCheckResult;
  onRetry: () => Promise<void>;
}

export const SecurityAccessBlocker: React.FC<SecurityAccessBlockerProps> = ({
  checkResult,
  onRetry,
}) => {
  const { user } = useAuthStore();
  const { config, setTemporaryOverride } = useSecurityStore();
  const [retrying, setRetrying] = useState(false);

  const isUserSuperAdmin = isSuperAdmin(user?.email);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signOut error
    }
    window.location.href = '/login';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 dark:bg-black/95 backdrop-blur-md p-4 select-none overflow-y-auto">
      <div className="max-w-lg w-full bg-white dark:bg-[#121316] border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-fade-in my-8">
        {/* Shield Icon */}
        <div className="w-18 h-18 bg-red-500/10 text-red-600 dark:text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20 shadow-inner">
          <ShieldAlert className="w-10 h-10" />
        </div>

        {/* Title and Explanation */}
        <div className="space-y-2">
          <span className="text-[10px] font-heading font-black tracking-widest uppercase text-red-600 dark:text-red-400">
            Facility Security Policy Active
          </span>
          <h2 className="text-xl sm:text-2xl font-heading tracking-widest text-slate-900 dark:text-white uppercase">
            Restricted Terminal Access
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            This staff terminal is protected by facility access controls. You must
            be physically on-site within the gym perimeter and connected to the
            authorized network to access management operations.
          </p>
        </div>

        {/* Diagnostic Status Cards */}
        <div className="space-y-3 text-left">
          {/* Location Check Result */}
          {config.location_restriction_enabled && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                checkResult.locationPassed
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-white/50 dark:bg-black/30 shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-red-500" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold uppercase tracking-wider">
                    Geofence Perimeter
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white dark:bg-black/50 border">
                    {checkResult.locationPassed ? 'PASSED' : 'BLOCKED'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-tight">
                  {checkResult.distanceMeters !== undefined ? (
                    <>
                      Distance to Gym: <strong>{checkResult.distanceMeters}m</strong>{' '}
                      (Permitted: {config.geofence_radius_meters}m).
                    </>
                  ) : (
                    'Location not verified. Device GPS permission may be denied.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Wi-Fi Check Result */}
          {config.wifi_restriction_enabled && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                checkResult.wifiPassed
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-white/50 dark:bg-black/30 shrink-0 mt-0.5">
                <Wifi className="w-4 h-4 text-blue-500" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold uppercase tracking-wider">
                    Authorized Wi-Fi Network
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white dark:bg-black/50 border">
                    {checkResult.wifiPassed ? 'PASSED' : 'BLOCKED'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-tight">
                  {checkResult.isWifi
                    ? `Connected via Wi-Fi${checkResult.activeSsid ? ` (${checkResult.activeSsid})` : ''}.`
                    : 'Terminal is not connected to a local Wi-Fi interface.'}
                </p>
              </div>
            </div>
          )}

          {/* Specific Error Messages */}
          {checkResult.errors.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Action Required
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1 opacity-90">
                {checkResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-heading font-black tracking-widest uppercase transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            <span>{retrying ? 'Verifying Coordinates...' : 'Re-check Security Access'}</span>
          </button>

          {/* Superadmin Emergency Override */}
          {isUserSuperAdmin && (
            <button
              type="button"
              onClick={() => setTemporaryOverride(true)}
              className="w-full py-2.5 bg-purple-600/10 hover:bg-purple-600/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 rounded-xl text-xs font-heading font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Superadmin Emergency Override</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-heading font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out & Return to Login</span>
          </button>
        </div>
      </div>
    </div>
  );
};
