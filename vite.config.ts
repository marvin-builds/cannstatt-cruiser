import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base so the build works under any sub-path (e.g. GitHub Pages).
// insights.html is the owner's hidden stats board (ROADMAP 46) with its own bundle.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        insights: resolve(import.meta.dirname, 'insights.html'),
      },
    },
  },
  server: { host: true },
});
