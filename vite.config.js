import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'ui',
  base: '/',
  plugins: [vue()],
  build: {
    outDir: '../ui-dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/workbench.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'assets/workbench.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});