import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Login } from '../pages/auth/Login';
import { ProtectedRoute } from '../components/layouts/ProtectedRoute';

// Fallback layout placeholders for mapping validation
const DashboardPlaceholder = () => <div className="p-8 text-white">Dashboard (Admin Only)</div>;
const RegisterSalePlaceholder = () => <div className="p-8 text-white">Register Sale (Admin & Staff)</div>;
const ForgotPasswordPlaceholder = () => <div className="p-8 text-white">Forgot Password</div>;

const router = createBrowserRouter([
  // Public Routes
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPlaceholder />,
  },

  // Auth Guards: Admin-Only Routes
  {
    element: <ProtectedRoute allowedRoles={['admin']} />,
    children: [
      {
        path: '/dashboard',
        element: <DashboardPlaceholder />,
      },
      // You can append other Admin pages here as you develop them
    ],
  },

  // Auth Guards: Shared Routes (Accessible by both Admin and Staff)
  {
    element: <ProtectedRoute allowedRoles={['admin', 'staff']} />,
    children: [
      {
        path: '/sales/register',
        element: <RegisterSalePlaceholder />,
      },
      // Append normal operational routes here
    ],
  },

  // Fallback Route redirects back to login or proper directory root
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export const AppRoutes: React.FC = () => {
  return <RouterProvider router={router} />;
};