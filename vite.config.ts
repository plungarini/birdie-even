import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Forces a full page reload on src/ changes so module-level SDK singletons
// (bridge, audio capture state) are always re-initialized from scratch.
function fullReloadPlugin() {
  return {
    name: 'full-reload',
    handleHotUpdate({ file, server }: { file: string; server: { ws: { send: (p: unknown) => void } } }) {
      if (file.includes('/src/')) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

function isLocalWorkerUrl(value: string | undefined): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/|$)/i.test(value ?? '');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (mode === 'prod' && isLocalWorkerUrl(env.VITE_WORKER_URL)) {
    throw new Error('[birdie] Refusing to package with local VITE_WORKER_URL. Create .env.prod with the deployed worker URL.');
  }

  return {
    plugins: [react(), tailwindcss(), fullReloadPlugin()],
    base: './',
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/analyze': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/enrich': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/i18n': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/]react/, priority: 20 },
              { name: 'vendor', test: /node_modules/, priority: 10 },
            ],
          },
        },
      },
    },
  };
});
