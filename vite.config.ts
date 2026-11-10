import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { sharedMapAssets } from './scripts/shared-map-assets.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({
  base: './',
  plugins: [sharedMapAssets(root)],
  // Await shared JSON before the worker advertises readiness. The default IIFE
  // worker build cannot preserve top-level await or relative module asset URLs.
  worker: { format: 'es', plugins: () => [sharedMapAssets(root)] },
  // Preserve Host as well as Origin: the LAN API intentionally enforces same-origin requests.
  // Vite's string shorthand changes Host and would reject legitimate browser POSTs.
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom/client'] } } } },
});
