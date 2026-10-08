import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  // Final packed art (and generated placeholders) are served from assets/ — see GLOAMDEEP_PLAN.md 2.9.3.
  publicDir: 'assets',
  plugins: [preact()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
