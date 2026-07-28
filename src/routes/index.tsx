// src/routes/index.tsx
import React, { useState, useEffect, createContext, useRef } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Login } from '../pages/auth/Login';
import { Dashboard } from '../pages/dashboard/Dashboard';
import { IncidentReports } from '../pages/reports/IncidentReports';
import { ProtectedRoute } from '../components/layouts/ProtectedRoute';
import { SystemLayout } from '../components/layouts/SystemLayout';

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

// Shared context for dynamic header buttons
export const HeaderActionsContext = createContext<{
  setActions: React.Dispatch<React.SetStateAction<React.ReactNode>>;
}>({ setActions: () => {} });

// Centralized Header Configuration Directory
const ROUTE_HEADERS: Record<string, { subtitle: string; title: string; description: string }> = {
  '/dashboard': {
    subtitle: 'Console / Performance',
    title: 'System Dashboard',
    description: 'Real-time overview of active gym operations, financial metrics, and performance charts.'
  },
  '/sales/products': {
    subtitle: 'Sales / Products',
    title: 'My Products',
    description: 'Manage your product inventory catalog, barcodes, prices, and stock indicators.'
  },
  '/sales': {
    subtitle: 'Sales / Register',
    title: 'Sales Register',
    description: 'Record product transactions, review daily financial logs, and trace weekly inventory telemetry.'
  },
  '/logbook': {
    subtitle: 'Check-in Records',
    title: 'GYM LOGBOOK',
    description: 'Record gym attendance, manage memberships, process walk-ins, and monitor daily check-ins.'
  },   
  '/members/list': {
    subtitle: 'List of Members',
    title: 'Member List',
    description: 'Manage client accounts, track subscription statuses, and generate security access QR cards.'
  },
  '/members/plans': {
    subtitle: 'List of Members',
    title: 'Membership Plans',
    description: 'Selectable catalog plans and setup configurations for security turnstiles.'
  },
  '/reports': {
    subtitle: 'Reports / Incident Reports',
    title: 'Incident Reports',
    description: 'Review reports submitted by staff regarding members, facilities, equipment, inventory, security, and daily operations.'
  },
};

const HeaderLayout: React.FC = () => {
  const location = useLocation();
  const [actions, setActions] = useState<React.ReactNode>(null);
  const prevPathRef = useRef(location.pathname);

  // Clear slots upon routing ONLY if the user is leaving the main section entirely
  useEffect(() => {
    const getBaseSegment = (p: string) => '/' + p.split('/').filter(Boolean)[0];
    const oldBase = getBaseSegment(prevPathRef.current);
    const newBase = getBaseSegment(location.pathname);

    // Treat logbook and members as the same continuous section to preserve sliding header actions
    const isLogbookOrMember = (seg: string) => seg === '/logbook' || seg === '/members';

    if (oldBase !== newBase && !(isLogbookOrMember(oldBase) && isLogbookOrMember(newBase))) {
      setActions(null);
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  const headerInfo = ROUTE_HEADERS[location.pathname] || 
                     Object.entries(ROUTE_HEADERS).find(([k]) => location.pathname.startsWith(k))?.[1];

  return (
    <HeaderActionsContext.Provider value={{ setActions }}>
      <div className="space-y-6 min-h-screen pt-2 pb-24 md:pb-6 relative animate-fade-in text-(--color-text)">
        {headerInfo && (
          <div className="hidden md:block">
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
              <div className="flex items-center gap-2 shrink-0">
                {actions}
              </div>
            </div>
          </div>
        )}
        <Outlet />
      </div>
    </HeaderActionsContext.Provider>
  );
};

const router = createBrowserRouter([
  // Public Routes (Outside of the secure console layout shell)
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> }, 
  { path: '/confirm-signup', element: <ConfirmSignUp /> }, 

  // Public Anonymous Pre-Registration Routes
  { path: '/register', element: <OnlineRegistrationPage /> },
  { path: '/register-online', element: <OnlineRegistrationPage /> },

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
    { path: '/dashboard/goals', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Set Goal Revenue</div> },
    
    // Moved /members/list & /members/plans out of here!
    
    { path: '/members/transactions', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Records of Transaction</div> },
    { path: '/reports/bir', element: <div className="p-4 text-slate-900 dark:text-white font-heading">BIR Records</div> },
    { path: '/system/audit-logs', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Audit Logs</div> }
  ]
},

// ─── B. SHARED ADMIN & STAFF CONSOLE ROUTES ───
{
  element: <ProtectedRoute allowedRoles={['admin', 'staff']} />,
  children: [
    { path: '/sales', element: <Sales /> },
    { path: '/sales/:subview', element: <Sales /> },
    
    { path: '/logbook', element: <LogbookPage /> },

    // 🟢 MOVED HERE SO STAFF CAN ACCESS THEM:
    { path: '/members/list', element: <LogbookPage /> },
    { path: '/members/plans', element: <StaffPlansConsole /> },
    
    { path: '/reports', element: <IncidentReports /> }, 
    
    { path: '/settings/:activeTab', element: <Settings /> },
    { path: '/settings', element: <Settings /> },
    { path: '/system/account', element: <Navigate to="/settings/personal-account" replace /> }
  ]
}
            ]
          }
        ]
      }
    ]
  },

  // Fallback Route
  { path: '*', element: <Navigate to="/login" replace /> }
]);

export const AppRoutes: React.FC = () => <RouterProvider router={router} />;