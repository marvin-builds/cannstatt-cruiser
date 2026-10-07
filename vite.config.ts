import { defineConfig } from 'vite';

// Relative base so the build works under any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  server: { host: true },
});
