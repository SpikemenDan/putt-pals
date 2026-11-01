import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Portable build: relative asset paths and one classic (non-module) script so index.html runs from
// file:// with a double-click. scripts/make-portable.cjs finishes the HTML rewrite after this build.
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'release/putt-pals',
    emptyOutDir: true,
    cssMinify: false,
    modulePreload: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
      output: { format: 'iife' },
    },
  },
});
