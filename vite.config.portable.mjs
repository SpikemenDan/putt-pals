import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Portable build: relative asset paths and one classic (non-module) script so index.html runs from
// file:// with a double-click. scripts/make-portable.cjs finishes the HTML rewrite after this build.
// Version label on the main menu (VIS-M2): package version plus the short commit when git is available.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git: version only */ }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version + (commit ? ' · ' + commit : '')) },
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
