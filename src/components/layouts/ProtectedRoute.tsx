//src/components/layouts/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { UserX } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: ('admin' | 'staff')[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, profile, loading, initialized } = useAuthStore() as any;
  const location = useLocation();

  if (!initialized || loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-[#0f1012]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent"></div>
      </div>
    );
  }

  // Redirect to login if user is not authenticated, preserving hash parameters
  if (!user) {
    const redirectTarget = `/login${location.search}${location.hash}`;
    return <Navigate to={redirectTarget} state={{ from: location }} replace />;
  }

  // Guard: Intercept and display suspension notice to deactivated users
  const userStatus = profile?.status || user?.user_metadata?.status;

  
  // Guard: Intercept and display suspension notice to deactivated users
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
              Your profile has been marked as inactive by a system administrator. You no longer have access to this terminal.
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

  // Verify role authorizations on custom restricted nodes
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    const targetFallback = profile.role === 'staff' ? '/sales/register' : '/dashboard';
    return <Navigate to={targetFallback} replace />;
  }

  return <Outlet />;
};