import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target:'es2022', rollupOptions: { output: { manualChunks: { three:['three'], react:['react','react-dom/client'] } } } },
});
