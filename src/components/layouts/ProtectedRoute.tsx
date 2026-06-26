import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

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

  // Verify role authorizations on custom restricted nodes
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    const targetFallback = profile.role === 'staff' ? '/sales/register' : '/dashboard';
    return <Navigate to={targetFallback} replace />;
  }

  return <Outlet />;
};