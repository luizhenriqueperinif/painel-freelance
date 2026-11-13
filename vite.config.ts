import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// A versão do app vem do package.json: o app de Android compara com a da última Release no GitHub.
const VERSAO = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

const PORTA_DO_SERVIDOR = Number(process.env.PORTA ?? 5180);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  define: { __VERSAO_DO_APP__: JSON.stringify(VERSAO) },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${PORTA_DO_SERVIDOR}` },
  },
});
