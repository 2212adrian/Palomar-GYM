import React, { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppRoutes } from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const App: React.FC = () => {
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    // Automatically retrieve the session state on page load/mount
    checkSession();
  }, [checkSession]);

  return (
    <>
      <AppRoutes />
      {/* Visual notifications element */}
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