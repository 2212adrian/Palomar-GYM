import React, { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppRoutes } from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const App: React.FC = () => {
  const checkSession = useAuthStore((state) => state.checkSession);

  // Global Theme Initialization (Survives hard page refreshes on protected routes)
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const activeTheme = saved === 'dark' || saved === 'light' 
      ? saved 
      : (systemPrefersDark ? 'dark' : 'light');

    const root = document.documentElement;
    root.classList.toggle('dark', activeTheme === 'dark');
    root.classList.toggle('light', activeTheme === 'light');
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <>
      <AppRoutes />
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </>
  );
};

export default App;