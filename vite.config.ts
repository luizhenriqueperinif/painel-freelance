import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// A versão do app vem do package.json: o app de Android compara com a da última Release no GitHub.
const PACOTE = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  versaoDaParteAndroid: number;
};
const VERSAO = PACOTE.version;

const PORTA_DO_SERVIDOR = Number(process.env.PORTA ?? 5180);

export default defineConfig({
  root: 'web',
  plugins: [
    react(),
    {
      // Vai junto no telas.zip da Release: o app de Android só usa telas feitas para a parte Android dele.
      name: 'versao-das-telas',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'versao.json',
          source: JSON.stringify({ versao: VERSAO, parteAndroid: PACOTE.versaoDaParteAndroid }),
        });
      },
    },
  ],
  define: { __VERSAO_DO_APP__: JSON.stringify(VERSAO) },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${PORTA_DO_SERVIDOR}` },
  },
});
