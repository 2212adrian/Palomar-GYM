// src/routes/index.tsx
import React, { useState, useEffect, createContext } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Login } from '../pages/auth/Login';
import { Dashboard } from '../pages/dashboard/Dashboard';
import { RevenueGoalsPage } from '../pages/dashboard/RevenueGoalsPage';
import { IncidentReports } from '../pages/reports/IncidentReports';
import { ProtectedRoute } from '../components/layouts/ProtectedRoute';
import { SystemLayout } from '../components/layouts/SystemLayout';
import { DownloadPage } from '../pages/download/DownloadPage';

// Security Access Guard and Stores
import { SecurityAccessBlocker } from '../components/security/SecurityAccessBlocker';
import { useSecurityStore } from '../stores/useSecurityStore';
import { useAuthStore, hasStoredAuthSession } from '../stores/authStore';
import { checkIsSuperAdminUser } from '../lib/securityAccessService';
import { supabase } from '../lib/supabase/client';
import { toast } from 'react-toastify';

// Mount actual pages instead of placeholders
import Settings from '../pages/system/Settings';
import { ForgotPassword } from '../pages/auth/ForgotPassword';
import { ConfirmSignUp } from '../pages/auth/ConfirmSignUp';
import { StaffPlansConsole } from '../pages/members/components/SubscriptionPlan';

// Import Anonymous Pre-Registration Page
import { OnlineRegistrationPage } from '../pages/members/components/OnlineRegistrationPage';

// Import Sales / Inventory component
import { Sales } from '../pages/sales/Sales';
import { LogbookPage } from '../pages/logbook/LogbookPage';

// Import Cash Management Page
import { CashManagementPage } from '../pages/cash/CashManagementPage';

export const isAppOrPWA = (): boolean => {
  if (typeof window === 'undefined') return false;

  const isCapacitor =
    Capacitor.isNativePlatform() ||
    Boolean(
      (
        window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }
      )?.Capacitor?.isNativePlatform?.()
    );

  const isPWA =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true ||
    document.referrer.includes('android-app://');

  return isCapacitor || isPWA;
};

/**
 * Smart entry resolver for the root `/` path:
 * 1. Checks if the incoming URL contains Supabase auth tokens or hash parameters.
 *    If Supabase redirects to "/" instead of the specific path, this intercepts
 *    the hash and routes the user to the correct setup page.
 * 2. Waits for session verification to finish so logged-in users are not bounced to /login.
 * 3. Directs authenticated users to /dashboard, or unauthenticated users to /login.
 */
const RootEntry: React.FC = () => {
  const { user, initialized, loading } = useAuthStore();

  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    const search = window.location.search;

    // Detect Supabase Password Recovery callback
    if (hash.includes('type=recovery')) {
      return <Navigate to={`/forgot-password${hash}`} replace />;
    }

    // Detect Supabase Sign-up or Invite confirmation callback
    if (
      hash.includes('type=signup') ||
      hash.includes('type=invite') ||
      hash.includes('type=email_change')
    ) {
      return <Navigate to={`/confirm-signup${hash}`} replace />;
    }

    // Detect PKCE auth code exchange
    if (search.includes('code=')) {
      return <Navigate to={`/confirm-signup${search}`} replace />;
    }
  }

  // Wait for session check to complete before any redirection
  if (!initialized || loading || (hasStoredAuthSession() && !user)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-[#0f1012]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
};

/**
 * Fallback resolver for wildcard `*` route.
 * Redirects unknown URLs directly to the registration page.
 */
const FallbackEntry: React.FC = () => {
  return <Navigate to="/register" replace />;
};

/**
 * Security Guard for the /login page:
 * - When Wi-Fi / location restrictions are active, unauthorized terminals and anonymous
 *   users outside the facility cannot access the staff login form.
 * - Waits for session check to complete: if already authenticated, navigates to /dashboard immediately.
 * - Subscribes to Supabase Realtime so that when an admin turns off the restriction,
 *   the blocker disappears in real-time without reloading the page.
 */
const LoginRouteGuard: React.FC = () => {
  const { user, initialized, loading } = useAuthStore();
  const {
    config,
    fetchConfig,
    checkResult,
    runVerification,
    subscribeRealtime,
  } = useSecurityStore();

  useEffect(() => {
    // Keep a live realtime connection open on /login
    const unsubscribe = subscribeRealtime();

    const verifyAccess = async () => {
      // Handle Superadmin Google OAuth bypass return
      const oauthBypassAttempt =
        sessionStorage.getItem('palomar_superadmin_bypass_oauth') === 'true';

      if (user?.email && oauthBypassAttempt) {
        sessionStorage.removeItem('palomar_superadmin_bypass_oauth');
        const isSuper = await checkIsSuperAdminUser(user.email);
        if (!isSuper) {
          await supabase.auth.signOut();
          toast.error(
            'Access Denied: Only the Superadmin account can log in while terminal security restrictions are enforced.'
          );
          await runVerification('anonymous', null);
          return;
        } else {
          toast.success('Superadmin verified. Terminal restriction bypassed.');
        }
      }

      await runVerification(user ? 'admin' : 'anonymous', user?.email);
    };

    verifyAccess();

    return () => {
      unsubscribe();
    };
  }, [fetchConfig, runVerification, subscribeRealtime, user, user?.email]);

  // Wait for session check to complete before flashing login form or determining redirection
  if (!initialized || loading || (hasStoredAuthSession() && !user)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-[#0f1012]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent" />
      </div>
    );
  }

  // If user is already authenticated, direct them directly to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const hasActiveRestrictions =
    Boolean(config.location_restriction_enabled) ||
    Boolean(config.wifi_restriction_enabled) ||
    Boolean(config.ip_restriction_enabled);

  const isSuperUser = false;

  // If restrictions are active, user is not Superadmin, and terminal is not authorized, render the blocker modal
  if (
    hasActiveRestrictions &&
    !isSuperUser &&
    checkResult &&
    !checkResult.allowed
  ) {
    return (
      <SecurityAccessBlocker
        checkResult={checkResult}
        onRetry={async () => {
          await runVerification('anonymous', null);
        }}
      />
    );
  }

  return <Login />;
};

// Shared context for dynamic header buttons
export const HeaderActionsContext = createContext<{
  setActions: React.Dispatch<React.SetStateAction<React.ReactNode>>;
}>({ setActions: () => {} });

// Centralized Header Configuration Directory
const ROUTE_HEADERS: Record<
  string,
  { subtitle: string; title: string; description: string }
> = {
  '/dashboard': {
    subtitle: 'Console / Performance',
    title: 'System Dashboard',
    description:
      'Real-time overview of active gym operations, financial metrics, and performance charts.',
  },
  '/dashboard/goals': {
    subtitle: 'Console / Revenue Benchmarks',
    title: 'Revenue Goals Tracker',
    description:
      'Set custom goal limits, analyze logbook vs sales run-rates, and monitor milestones.',
  },
  '/sales/products': {
    subtitle: 'Sales / Products',
    title: 'My Products',
    description:
      'Manage your product inventory catalog, barcodes, prices, and stock indicators.',
  },
  '/sales': {
    subtitle: 'Sales / Register',
    title: 'Sales Register',
    description:
      'Record product transactions, review daily financial logs, and trace weekly inventory telemetry.',
  },
  '/logbook': {
    subtitle: 'Check-in Records',
    title: 'GYM LOGBOOK',
    description:
      'Record gym attendance, manage memberships, process walk-ins, and monitor daily check-ins.',
  },
  '/members/list': {
    subtitle: 'List of Members',
    title: 'Member List',
    description:
      'Manage client accounts, track subscription statuses, and generate security access QR cards.',
  },
  '/members/plans': {
    subtitle: 'List of Members',
    title: 'Membership Plans',
    description:
      'Selectable catalog plans and setup configurations for security turnstiles.',
  },
  '/reports': {
    subtitle: 'Reports / Incident Reports',
    title: 'Incident Reports',
    description:
      'Review reports submitted by staff regarding members, facilities, equipment, inventory, security, and daily operations.',
  },
  '/cash-management': {
    subtitle: 'Console / Cash Flow',
    title: 'Live Cash Management',
    description:
      'Real-time physical cash drawer control, cash-in/out tracking, digital collections, and daily reconciliation.',
  },
};

const HeaderLayout: React.FC = () => {
  const location = useLocation();
  const [actions, setActions] = useState<React.ReactNode>(null);
  const [prevPath, setPrevPath] = useState(location.pathname);

  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    const getBaseSegment = (p: string) => '/' + p.split('/').filter(Boolean)[0];
    const oldBase = getBaseSegment(prevPath);
    const newBase = getBaseSegment(location.pathname);

    const isLogbookOrMember = (seg: string) =>
      seg === '/logbook' || seg === '/members';

    if (
      oldBase !== newBase &&
      !(isLogbookOrMember(oldBase) && isLogbookOrMember(newBase))
    ) {
      setActions(null);
    }
  }

  const headerInfo =
    ROUTE_HEADERS[location.pathname] ||
    Object.entries(ROUTE_HEADERS).find(([k]) =>
      location.pathname.startsWith(k)
    )?.[1];

  return (
    <HeaderActionsContext.Provider value={{ setActions }}>
      <div className="space-y-4 sm:space-y-6 min-h-full flex flex-col min-w-0 pt-1 md:pt-2 relative text-[var(--color-text,#0f172a)] dark:text-slate-100">
        {headerInfo && (
          <div className="hidden md:block shrink-0 pb-1">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/60 dark:border-zinc-800/80 pb-4">
              {/* Left Column: Title & Breadcrumbs */}
              <div className="min-w-0 max-w-2xl">
                <span className="text-[11px] font-heading font-bold tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase block">
                  {headerInfo.subtitle}
                </span>
                <h1 className="text-2xl sm:text-3xl font-heading font-black tracking-wider uppercase text-slate-900 dark:text-white mt-0.5 truncate">
                  {headerInfo.title}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {headerInfo.description}
                </p>
              </div>

              {/* Right Column: Tablet & Desktop Control Toolbar */}
              {actions && (
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap md:self-end">
                  {actions}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0">
          <Outlet />
        </div>
      </div>
    </HeaderActionsContext.Provider>
  );
};

const router = createBrowserRouter([
  // Public Default Route: Checks for Supabase verification tokens first, then defaults to /login
  { path: '/', element: <RootEntry /> },

  // Explicit Public Member Pre-Registration Routes (ALWAYS OPEN WORLDWIDE)
  { path: '/register', element: <OnlineRegistrationPage /> },
  { path: '/register-online', element: <OnlineRegistrationPage /> },

  // Staff / Admin Authentication Routes (Guarded by LoginRouteGuard)
  { path: '/login', element: <LoginRouteGuard /> },
  { path: '/download', element: <DownloadPage standalone={true} /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/confirm-signup', element: <ConfirmSignUp /> },

  // Secure Layout Node (Wraps Topbar, Sidebar, and Mobile Navigation)
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <SystemLayout />,
        children: [
          {
            element: <HeaderLayout />,
            children: [
              // ─── A. ADMIN-ONLY CONSOLE ROUTES ───
              {
                element: <ProtectedRoute allowedRoles={['admin']} />,
                children: [
                  { path: '/dashboard', element: <Dashboard /> },
                  { path: '/dashboard/goals', element: <RevenueGoalsPage /> },
                  {
                    path: '/members/transactions',
                    element: (
                      <div className="p-4 text-slate-900 dark:text-white font-heading">
                        Records of Transaction
                      </div>
                    ),
                  },
                  {
                    path: '/reports/bir',
                    element: (
                      <div className="p-4 text-slate-900 dark:text-white font-heading">
                        BIR Records
                      </div>
                    ),
                  },
                  {
                    path: '/system/audit-logs',
                    element: (
                      <div className="p-4 text-slate-900 dark:text-white font-heading">
                        Audit Logs
                      </div>
                    ),
                  },
                ],
              },

              // ─── B. SHARED ADMIN & STAFF CONSOLE ROUTES ───
              {
                element: <ProtectedRoute allowedRoles={['admin', 'staff']} />,
                children: [
                  { path: '/sales', element: <Sales /> },
                  { path: '/sales/:subview', element: <Sales /> },
                  { path: '/logbook', element: <LogbookPage /> },
                  {
                    path: '/scanner',
                    element: <Navigate to="/dashboard" replace />,
                  },
                  { path: '/members/list', element: <LogbookPage /> },
                  { path: '/members/plans', element: <StaffPlansConsole /> },
                  { path: '/reports', element: <IncidentReports /> },
                  { path: '/cash-management', element: <CashManagementPage /> },
                  {
                    path: '/cash',
                    element: <Navigate to="/cash-management" replace />,
                  },
                  { path: '/settings/:activeTab', element: <Settings /> },
                  { path: '/settings', element: <Settings /> },
                  {
                    path: '/system/account',
                    element: (
                      <Navigate to="/settings/personal-account" replace />
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // Fallback Route: Redirect unknown paths
  { path: '*', element: <FallbackEntry /> },
]);

export const AppRoutes: React.FC = () => <RouterProvider router={router} />;
