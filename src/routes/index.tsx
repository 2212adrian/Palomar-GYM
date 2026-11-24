import React, {
  Suspense,
  lazy,
  useState,
  createContext,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Login } from '../pages/auth/Login';
import { ProtectedRoute } from '../components/layouts/ProtectedRoute';
import { SystemLayout } from '../components/layouts/SystemLayout';
import { AppErrorBoundary } from '../components/common/AppErrorBoundary';

import { useAuthStore, hasStoredAuthSession } from '../stores/authStore';
import { isSuperAdmin } from '../constants/auth';

// Load major console screens on demand for faster initial startup
const Dashboard = lazy(() =>
  import('../pages/dashboard/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const RevenueGoalsPage = lazy(() =>
  import('../pages/dashboard/RevenueGoalsPage').then((m) => ({
    default: m.RevenueGoalsPage,
  }))
);
const IncidentReports = lazy(() =>
  import('../pages/reports/IncidentReports').then((m) => ({
    default: m.IncidentReports,
  }))
);
const DownloadPage = lazy(() =>
  import('../pages/download/DownloadPage').then((m) => ({
    default: m.DownloadPage,
  }))
);
const Settings = lazy(() => import('../pages/system/Settings'));
const ForgotPassword = lazy(() =>
  import('../pages/auth/ForgotPassword').then((m) => ({
    default: m.ForgotPassword,
  }))
);
const ConfirmSignUp = lazy(() =>
  import('../pages/auth/ConfirmSignUp').then((m) => ({
    default: m.ConfirmSignUp,
  }))
);
const OAuthCallback = lazy(() =>
  import('../pages/auth/OAuthCallback').then((m) => ({
    default: m.OAuthCallback,
  }))
);
const StaffPlansConsole = lazy(() =>
  import('../pages/members/components/SubscriptionPlan').then((m) => ({
    default: m.StaffPlansConsole,
  }))
);
const OnlineRegistrationPage = lazy(() =>
  import('../pages/members/components/OnlineRegistrationPage').then((m) => ({
    default: m.OnlineRegistrationPage,
  }))
);
const Sales = lazy(() =>
  import('../pages/sales/Sales').then((m) => ({ default: m.Sales }))
);
const LogbookPage = lazy(() =>
  import('../pages/logbook/LogbookPage').then((m) => ({
    default: m.LogbookPage,
  }))
);
const CashManagementPage = lazy(() =>
  import('../pages/cash/CashManagementPage').then((m) => ({
    default: m.CashManagementPage,
  }))
);

const RouteSkeletonFallback: React.FC = () => (
  <div className="w-full p-4 sm:p-6 space-y-5 animate-pulse">
    <div className="h-7 w-56 rounded-xl bg-slate-200 dark:bg-white/10" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="h-28 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-white/5" />
      <div className="h-28 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-white/5" />
      <div className="h-28 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-white/5" />
    </div>
    <div className="h-72 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-white/5" />
  </div>
);

const withPageBoundary = (node: React.ReactNode) => (
  <AppErrorBoundary>
    <Suspense fallback={<RouteSkeletonFallback />}>{node}</Suspense>
  </AppErrorBoundary>
);

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
 * Smart entry resolver for `/` path.
 */
const RootEntry: React.FC = () => {
  const { user, profile, initialized, loading } = useAuthStore();

  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    const search = window.location.search;

    if (hash.includes('type=recovery')) {
      return <Navigate to={`/forgot-password${hash}`} replace />;
    }

    if (
      hash.includes('type=signup') ||
      hash.includes('type=invite') ||
      hash.includes('type=email_change')
    ) {
      return <Navigate to={`/confirm-signup${hash}`} replace />;
    }

    if (search.includes('code=')) {
      return <Navigate to={`/auth/callback${search}`} replace />;
    }
  }

  if (!initialized || loading || (hasStoredAuthSession() && !user)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-[#0f1012]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent" />
      </div>
    );
  }

  if (user) {
    const isSuperAdminUser = isSuperAdmin(user.email);
    const effectiveRole = isSuperAdminUser ? 'admin' : profile?.role || 'staff';
    const target = effectiveRole === 'staff' ? '/cash-management' : '/dashboard';
    return <Navigate to={target} replace />;
  }

  return <Navigate to="/login" replace />;
};

/**
 * Redirects unknown URLs back through RootEntry so signed-in staff stay in their workspace.
 */
const FallbackEntry: React.FC = () => {
  return <Navigate to="/" replace />;
};

const LoginRouteGuard: React.FC = () => {
  const { user, profile, initialized, loading } = useAuthStore();
  const location = useLocation();
  const isPreview =
    new URLSearchParams(location.search).get('preview') === 'true';

  if (
    !isPreview &&
    (!initialized || loading || (hasStoredAuthSession() && !user))
  ) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-[#0f1012]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent" />
      </div>
    );
  }

  if (user && !isPreview) {
    const isGreetingShown =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('palomar_greeting_shown') === 'true';

    if (isGreetingShown) {
      const isSuperAdminUser = isSuperAdmin(user.email);
      const effectiveRole = isSuperAdminUser ? 'admin' : profile?.role || 'staff';
      const fromPath = (location.state as any)?.from?.pathname;
      const defaultTarget =
        effectiveRole === 'staff' ? '/cash-management' : '/dashboard';
      const target =
        fromPath && fromPath !== '/login' ? fromPath : defaultTarget;
      return <Navigate to={target} replace />;
    }
  }

  return <Login />;
};

export const HeaderActionsContext = createContext<{
  setActions: React.Dispatch<React.SetStateAction<React.ReactNode>>;
}>({ setActions: () => {} });

const ROUTE_HEADERS: Record<
  string,
  { subtitle: string; title: string; description: string }
> = {
  '/dashboard': {
    subtitle: 'Overview / Revenue Summary',
    title: 'System Dashboard',
    description:
      'Live overview of daily gym operations, cash totals, and sales charts.',
  },
  '/dashboard/goals': {
    subtitle: 'Overview / Targets',
    title: 'Revenue Goals Tracker',
    description:
      'Set daily, weekly, and monthly revenue goals and follow progress.',
  },
  '/sales/products': {
    subtitle: 'Sales / Products',
    title: 'Product Catalog',
    description:
      'Manage your product list, barcode tags, selling prices, and low-stock alerts.',
  },
  '/sales': {
    subtitle: 'Sales / Register',
    title: 'Sales Register',
    description:
      'Ring up product sales, track daily totals, and review today’s activity.',
  },
  '/logbook': {
    subtitle: 'Check-In Records',
    title: 'GYM LOGBOOK',
    description:
      'Record member attendance, manage active plans, handle walk-ins, and review daily check-ins.',
  },
  '/members/list': {
    subtitle: 'Member Directory',
    title: 'Member List',
    description:
      'Manage member profiles, track active plans, and issue QR access cards.',
  },
  '/members/plans': {
    subtitle: 'Member Directory',
    title: 'Membership Plans',
    description:
      'Compare membership plan pricing and configure QR access cards.',
  },
  '/reports': {
    subtitle: 'Reports / Incidents',
    title: 'Incident Reports',
    description:
      'Review facility, equipment, inventory, member, and safety notes submitted by staff.',
  },
  '/cash-management': {
    subtitle: 'Shift / Cash Drawer',
    title: 'Live Cash Management',
    description:
      'Open and close cash drawer shifts, log cash in or out, and reconcile daily totals.',
  },
};

const HeaderLayout: React.FC = () => {
  const location = useLocation();
  const [actions, setActions] = useState<React.ReactNode>(null);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    const getBaseSegment = (p: string) => '/' + p.split('/').filter(Boolean)[0];
    const oldBase = getBaseSegment(prevPathRef.current);
    const newBase = getBaseSegment(location.pathname);

    const isLogbookOrMember = (seg: string) =>
      seg === '/logbook' || seg === '/members';

    if (
      oldBase !== newBase &&
      !(isLogbookOrMember(oldBase) && isLogbookOrMember(newBase))
    ) {
      setActions(null);
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  const headerInfo =
    ROUTE_HEADERS[location.pathname] ||
    Object.entries(ROUTE_HEADERS).find(([k]) =>
      location.pathname.startsWith(k)
    )?.[1];

  const contextValue = useMemo(() => ({ setActions }), [setActions]);

  return (
    <HeaderActionsContext.Provider value={contextValue}>
      <div className="space-y-4 sm:space-y-6 min-h-full flex flex-col min-w-0 pt-1 md:pt-2 relative text-[var(--color-text,#0f172a)] dark:text-slate-100">
        {headerInfo && (
          <div className="hidden md:flex flex-wrap items-center justify-between gap-4 px-6 pt-6 pb-2">
            <div className="min-w-fit shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {headerInfo.subtitle}
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text,#0b1a30)] dark:text-white uppercase mt-0.5">
                {headerInfo.title}
              </h1>
              <p
                className={
                  actions
                    ? 'hidden 2xl:block text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl'
                    : 'text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl'
                }
              >
                {headerInfo.description}
              </p>
            </div>

            {actions && (
              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                {actions}
              </div>
            )}
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
  { path: '/', element: <RootEntry /> },

  {
    path: '/register',
    element: withPageBoundary(<OnlineRegistrationPage />),
  },
  {
    path: '/register-online',
    element: withPageBoundary(<OnlineRegistrationPage />),
  },

  { path: '/login', element: <LoginRouteGuard /> },
  {
    path: '/download',
    element: withPageBoundary(<DownloadPage standalone={true} />),
  },
  {
    path: '/forgot-password',
    element: withPageBoundary(<ForgotPassword />),
  },
  {
    path: '/confirm-signup',
    element: withPageBoundary(<ConfirmSignUp />),
  },
  {
    path: '/auth/callback',
    element: withPageBoundary(<OAuthCallback />),
  },

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <SystemLayout />,
        children: [
          {
            element: <HeaderLayout />,
            children: [
              {
                element: <ProtectedRoute allowedRoles={['admin']} />,
                children: [
                  {
                    path: '/dashboard',
                    element: withPageBoundary(<Dashboard />),
                  },
                  {
                    path: '/dashboard/goals',
                    element: withPageBoundary(<RevenueGoalsPage />),
                  },
                  {
                    path: '/members/transactions',
                    element: <Navigate to="/logbook" replace />,
                  },
                  {
                    path: '/reports/bir',
                    element: <Navigate to="/dashboard" replace />,
                  },
                  {
                    path: '/system/audit-logs',
                    element: <Navigate to="/settings/audit-logs" replace />,
                  },
                ],
              },

              {
                element: <ProtectedRoute allowedRoles={['admin', 'staff']} />,
                children: [
                  { path: '/sales', element: withPageBoundary(<Sales />) },
                  {
                    path: '/sales/:subview',
                    element: withPageBoundary(<Sales />),
                  },
                  {
                    path: '/logbook',
                    element: withPageBoundary(<LogbookPage />),
                  },
                  {
                    path: '/scanner',
                    element: <Navigate to="/dashboard" replace />,
                  },
                  {
                    path: '/members/list',
                    element: withPageBoundary(<LogbookPage />),
                  },
                  {
                    path: '/members/plans',
                    element: withPageBoundary(<StaffPlansConsole />),
                  },
                  {
                    path: '/reports',
                    element: withPageBoundary(<IncidentReports />),
                  },
                  {
                    path: '/cash-management',
                    element: withPageBoundary(<CashManagementPage />),
                  },
                  {
                    path: '/cash',
                    element: <Navigate to="/cash-management" replace />,
                  },
                  {
                    path: '/settings/:activeTab',
                    element: withPageBoundary(<Settings />),
                  },
                  {
                    path: '/settings',
                    element: withPageBoundary(<Settings />),
                  },
                  {
                    path: '/system/account',
                    element: <Navigate to="/settings/personal-account" replace />,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <FallbackEntry /> },
]);

export const AppRoutes: React.FC = () => <RouterProvider router={router} />;