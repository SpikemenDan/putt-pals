import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// One page: index.html is the modular app. The legacy single-file game was retired (see ARCHITECTURE.md);
// git history keeps its source.
export default defineConfig({
  // Deployment metadata such as Cloudflare's _headers is copied into dist.
  publicDir: 'public',
  build: {
    // Lightning CSS minification once dropped standard `backdrop-filter` declarations; the stylesheets are
    // small, so CSS is left unminified.
    cssMinify: false,
    rollupOptions: {
      input: { index: fileURLToPath(new URL('./index.html', import.meta.url)) },
    },
  },
});
