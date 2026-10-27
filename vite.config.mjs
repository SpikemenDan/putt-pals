import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Two pages: index.html is the modular app (I1); putt-pals.html is the legacy single-file game, kept
// runnable and byte-identical in its scripts until the modular app replaces it.
export default defineConfig({
  publicDir: false,
  build: {
    // Lightning CSS minification drops the standard `backdrop-filter` whenever the legacy CSS also
    // declares `-webkit-backdrop-filter`, which removed the frosted-glass panels in Chrome/Firefox
    // builds. The stylesheets are small, so CSS is left unminified; scripts/check-build.cjs verifies
    // that every legacy CSS declaration survives.
    cssMinify: false,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        legacy: fileURLToPath(new URL('./putt-pals.html', import.meta.url)),
      },
    },
  },
});
