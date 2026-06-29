import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  console.log('======================');
  console.log('Vite Mode:', mode);
  console.log('VITE_API_URL:', env.VITE_APP_URL);
  console.log('======================');

  return {
    plugins: [react(), tailwindcss()],
  };
});