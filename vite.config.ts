/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // SUPABASE_TEST_* live in .env.test, which Vite only loads in test mode, so
  // they never reach a production build. Do not put them in .env.local, which
  // IS loaded for builds and would inline them into the public bundle.
  envPrefix: ['VITE_', 'SUPABASE_TEST_'],
  test: {
    environment: 'jsdom',
  },
});