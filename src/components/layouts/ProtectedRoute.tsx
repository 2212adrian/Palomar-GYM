// src/components/layouts/ProtectedRoute.tsx
import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, hasStoredAuthSession } from '../../stores/authStore';
import { useSecurityStore } from '../../stores/useSecurityStore';
import { supabase } from '../../lib/supabase/client';
import { UserX, Loader2 } from 'lucide-react';
import { isSuperAdmin } from '../../constants/auth';
import { SecurityAccessBlocker } from '../security/SecurityAccessBlocker';

interface ProtectedRouteProps {
  allowedRoles?: ('admin' | 'staff')[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
}) => {
  const { user, profile, loading, initialized } = useAuthStore() as any;
  const { config, fetchConfig, checkResult, runVerification } =
    useSecurityStore();
  const location = useLocation();

  const isSuperAdminUser = isSuperAdmin(user?.email);
  const effectiveRole = isSuperAdminUser ? 'admin' : profile?.role || 'staff';

  useEffect(() => {
    if (user?.id && initialized && !loading) {
      if (!isSuperAdminUser) {
        runVerification(effectiveRole, user?.email);
      } else {
        fetchConfig();
      }
    }
  }, [
    user?.id,
    user?.email,
    initialized,
    loading,
    effectiveRole,
    isSuperAdminUser,
    fetchConfig,
    runVerification,
  ]);

  if (!initialized || loading || (hasStoredAuthSession() && !user)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-[#0f1012]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    const redirectTarget = `/login${location.search}${location.hash}`;
    return <Navigate to={redirectTarget} state={{ from: location }} replace />;
  }

  const userStatus = isSuperAdminUser
    ? 'active'
    : profile?.status || user?.user_metadata?.status;

  if (userStatus === 'inactive') {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-white dark:bg-[#0f1012] p-4 text-center font-body select-none">
        <div className="max-w-md w-full bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-600 dark:text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
            <UserX className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-heading tracking-wider text-slate-900 dark:text-white uppercase">
              Account Suspended
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal font-bold">
              Your profile has been marked as inactive by a system
              administrator. You no longer have access to this terminal.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
            className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-heading tracking-widest uppercase transition-all cursor-pointer shadow-md"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const hasActiveSecurityRestrictions =
    Boolean(config.location_restriction_enabled) ||
    Boolean(config.wifi_restriction_enabled) ||
    Boolean(config.ip_restriction_enabled);

  const canBypass =
    isSuperAdminUser ||
    (location.pathname.startsWith('/settings') && effectiveRole === 'admin');

  if (hasActiveSecurityRestrictions && !canBypass) {
    if (checkResult === null) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center select-none text-white">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
          <h3 className="text-sm font-heading font-black uppercase tracking-wider">
            Verifying Terminal Security Access
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Validating network interface, physical Wi-Fi authorization, and GPS perimeter.
          </p>
        </div>
      );
    }

    if (!checkResult.allowed) {
      return (
        <SecurityAccessBlocker
          checkResult={checkResult}
          onRetry={async () => {
            await runVerification(effectiveRole, user?.email);
          }}
        />
      );
    }
  }

  if (allowedRoles) {
    if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
      const targetFallback =
        effectiveRole === 'staff' ? '/sales' : '/dashboard';
      return <Navigate to={targetFallback} replace />;
    }
  }

  return <Outlet />;
};
