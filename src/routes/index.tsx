//src/routes/index.tsx
import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Login } from '../pages/auth/Login';
import { Dashboard } from '../pages/dashboard/Dashboard';
import { ProtectedRoute } from '../components/layouts/ProtectedRoute';
import { SystemLayout } from '../components/layouts/SystemLayout';

// Mount actual pages instead of placeholders [13]
import Settings from '../pages/system/Settings';
import { ForgotPassword } from '../pages/auth/ForgotPassword';
import { ConfirmSignUp } from '../pages/auth/ConfirmSignUp';

// Shared Layout Placeholders
const RegisterSalePlaceholder = () => <div className="p-4 text-slate-900 dark:text-white font-heading">Register Sale Interface</div>;

const router = createBrowserRouter([
  // Public Routes (Outside of the secure console layout shell)
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> }, // Replaced placeholder with verified component [13]
  { path: '/confirm-signup', element: <ConfirmSignUp /> }, // Added Confirm Sign Up route

  // Secure Layout Node (Wraps Topbar, Sidebar, and Mobile Navigation)
  {
    element: <ProtectedRoute />, // Standard session guard check
    children: [
      {
        element: <SystemLayout />,
        children: [
          
          // ─── A. ADMIN-ONLY CONSOLE ROUTES ───
          {
            element: <ProtectedRoute allowedRoles={['admin']} />,
            children: [
              { path: '/dashboard', element: <Dashboard /> },
              { path: '/dashboard/goals', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Set Goal Revenue</div> },
              { path: '/members/list', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Member List</div> },
              { path: '/members/id-maker', element: <div className="p-4 text-slate-900 dark:text-white font-heading">ID Maker (Subscribed Only)</div> },
              { path: '/members/transactions', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Records of Transaction</div> },
              { path: '/members/plans', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Membership Plans</div> },
              { path: '/sales/products', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Product List (Right Tab)</div> },
              { path: '/reports/incidents', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Incident Reports</div> },
              { path: '/reports/bir', element: <div className="p-4 text-slate-900 dark:text-white font-heading">BIR Records</div> },
              { path: '/system/audit-logs', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Audit Logs</div> }
            ]
          },

          // ─── B. SHARED ADMIN & STAFF CONSOLE ROUTES ───
          {
            element: <ProtectedRoute allowedRoles={['admin', 'staff']} />,
            children: [
              { path: '/sales/register', element: <RegisterSalePlaceholder /> },
              { path: '/members/check-in', element: <div className="p-4 text-slate-900 dark:text-white font-heading">Check-In Interface</div> },
              { path: '/system/account', element: <Settings /> }
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