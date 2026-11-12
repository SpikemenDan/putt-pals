import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// One page: index.html is the modular app. The legacy single-file game was retired (see ARCHITECTURE.md);
// git history keeps its source.
// Version label on the main menu (VIS-M2): package version plus the short commit when git is available.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git: version only */ }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version + (commit ? ' · ' + commit : '')) },
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
