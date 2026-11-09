import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  // Preserve Host as well as Origin: the LAN API intentionally enforces same-origin requests.
  // Vite's string shorthand changes Host and would reject legitimate browser POSTs.
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom/client'] } } } },
});
