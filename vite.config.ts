import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [react(), tailwindcss(), fullReloadPlugin()],
  base: './',
  server: {
    host: true,
    port: 5173,
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
});
