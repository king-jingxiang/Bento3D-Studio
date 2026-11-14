import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  build: {
    target: 'es2022',
  },
});
