import {defineConfig} from 'vite';
export default defineConfig(({mode})=>({
  base: mode === 'pages' ? '/rouge/' : './',
  define: {__ROUGE_STATIC_HOST__: JSON.stringify(mode === 'pages')},
  // Preserve Host/Origin so the local LAN API can enforce same-origin requests.
  server: {proxy: {'/api': {target: 'http://127.0.0.1:8787', changeOrigin: false}}},
  build: {target: 'es2022', rollupOptions: {output: {manualChunks: {three: ['three'], react: ['react', 'react-dom/client']}}}},
}));
