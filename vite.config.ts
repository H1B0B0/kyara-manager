import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(import.meta.dirname, 'src/sidepanel'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/sidepanel'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/sidepanel/index.html')
    }
  }
});
