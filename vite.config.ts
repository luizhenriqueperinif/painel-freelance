import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORTA_DO_SERVIDOR = Number(process.env.PORTA ?? 5180);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${PORTA_DO_SERVIDOR}` },
  },
});
