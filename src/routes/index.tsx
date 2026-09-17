// src/routes/index.tsx
import React, { useState, createContext } from 'react';
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

/**
 * Detects if the current environment is an installed Capacitor application
 * or an installed Progressive Web App (PWA) running in standalone mode.
 */
export const isAppOrPWA = (): boolean => {
  if (typeof window === 'undefined') return false;

  // 1. Capacitor Native Platform check
  const isCapacitor =
    Capacitor.isNativePlatform() ||
    Boolean(
      (
        window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }
      )?.Capacitor?.isNativePlatform?.()
    );

  // 2. PWA Standalone Mode check (Desktop / Android Chrome & iOS Safari standalone)
  const isPWA =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true ||
    document.referrer.includes('android-app://');

  return isCapacitor || isPWA;
};

/**
 * Default entry resolver for the root `/` path.
 * Public users land on the Pre-Registration portal by default.
 */
const RootEntry: React.FC = () => {
  return <Navigate to="/register" replace />;
};

/**
 * Fallback resolver for wildcard `*` route.
 * Redirects unknown URLs directly to the registration page.
 */
const FallbackEntry: React.FC = () => {
  return <Navigate to="/register" replace />;
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

  // Synchronously reset actions during render phase when switching sections, BEFORE child useEffects execute
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    const getBaseSegment = (p: string) => '/' + p.split('/').filter(Boolean)[0];
    const oldBase = getBaseSegment(prevPath);
    const newBase = getBaseSegment(location.pathname);

    // Treat logbook and members as the same continuous section to preserve sliding header actions
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
      <div className="space-y-6 h-full flex flex-col min-h-0 pt-4 md:pt-6 pb-24 md:pb-0 relative animate-fade-in text-(--color-text) overflow-x-hidden">
        {headerInfo && (
          <div className="hidden md:block shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-heading tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase">
                  {headerInfo.subtitle}
                </span>
                <h1 className="text-2xl sm:text-3xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100 mt-1">
                  {headerInfo.title}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  {headerInfo.description}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">{actions}</div>
            </div>
          </div>
        )}
        <Outlet />
      </div>
    </HeaderActionsContext.Provider>
  );
};

const router = createBrowserRouter([
  // Public Default Route: Dynamically routes based on App/PWA vs Web Browser
  { path: '/', element: <RootEntry /> },

  // Explicit Registration Routes (Always accessible directly if needed)
  { path: '/register', element: <OnlineRegistrationPage /> },
  { path: '/register-online', element: <OnlineRegistrationPage /> },

  // Staff / Admin Authentication Routes
  { path: '/login', element: <Login /> },
  { path: '/download', element: <DownloadPage standalone={true} /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/confirm-signup', element: <ConfirmSignUp /> },

  // Secure Layout Node (Wraps Topbar, Sidebar, and Mobile Navigation)
  {
    element: <ProtectedRoute />, // Standard session guard check
    children: [
      {
        element: <SystemLayout />,
        children: [
          {
            element: <HeaderLayout />, // Consolidated dynamic page headers
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
                  // Scanner is a global modal overlay; redirect any direct /scanner hits to /dashboard
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

  // Fallback Route: Dynamic redirect based on environment
  { path: '*', element: <FallbackEntry /> },
]);

export const AppRoutes: React.FC = () => <RouterProvider router={router} />;
