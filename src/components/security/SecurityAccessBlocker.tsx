// src/components/security/SecurityAccessBlocker.tsx
import React, { useState } from 'react';
import {
  ShieldAlert,
  Globe,
  MapPin,
  Wifi,
  RefreshCw,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';
import { useSecurityStore } from '../../stores/useSecurityStore';
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
  const { config } = useSecurityStore();
  const [retrying, setRetrying] = useState(false);

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
            This terminal is protected by facility access controls. You must
            connect through the gym router's authorized network and meet active
            security policies to access staff operations and authentication.
          </p>
        </div>

        {/* Diagnostic Status Cards */}
        <div className="space-y-3 text-left">
          {/* Strategy 1: Gym Router Public IP Check */}
          {config.ip_restriction_enabled && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                checkResult.ipPassed
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-white/50 dark:bg-black/30 shrink-0 mt-0.5">
                <Globe className="w-4 h-4 text-blue-500" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold uppercase tracking-wider">
                    Gym Router IP Verification
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white dark:bg-black/50 border">
                    {checkResult.ipPassed ? 'PASSED' : 'BLOCKED'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-tight">
                  Terminal IP:{' '}
                  <strong className="font-mono">
                    {checkResult.currentIP || 'Unknown'}
                  </strong>
                </p>
              </div>
            </div>
          )}

          {/* Wi-Fi Interface Check */}
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
                    : 'Device is not connected to a physical local Wi-Fi network.'}
                </p>
              </div>
            </div>
          )}

          {/* Location Geofence Check */}
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
                      Distance: <strong>{checkResult.distanceMeters}m</strong>{' '}
                      (Max permitted: {config.geofence_radius_meters}m).
                    </>
                  ) : (
                    'Location not verified.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Error Details */}
          {checkResult.errors.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Connection Requirement
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
            <RefreshCw
              className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`}
            />
            <span>
              {retrying ? 'Verifying Network...' : 'Re-check Connection'}
            </span>
          </button>

          {/* Only display sign out if user has an existing session */}
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-heading font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
