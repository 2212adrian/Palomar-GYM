// src/routes/index.tsx

import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Login }          from '../pages/auth/Login';
import { Dashboard }      from '../pages/dashboard/Dashboard';      // ← ADD THIS
import { ProtectedRoute } from '../components/layouts/ProtectedRoute';

const RegisterSalePlaceholder  = () => <div className="p-8 text-white">Register Sale (Admin & Staff)</div>;
const ForgotPasswordPlaceholder = () => <div className="p-8 text-white">Forgot Password</div>;

const router = createBrowserRouter([
  { path: '/login',           element: <Login /> },
  { path: '/forgot-password', element: <ForgotPasswordPlaceholder /> },

  {
    element: <ProtectedRoute allowedRoles={['admin']} />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },   // ← SWAP THIS
    ],
  },

  {
    element: <ProtectedRoute allowedRoles={['admin', 'staff']} />,
    children: [
      { path: '/sales/register', element: <RegisterSalePlaceholder /> },
    ],
  },

  { path: '*', element: <Navigate to="/login" replace /> },
]);

export const AppRoutes: React.FC = () => <RouterProvider router={router} />;