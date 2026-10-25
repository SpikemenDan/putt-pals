import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Keep the legacy HTML and embedded libraries intact until module extraction.
export default defineConfig({
  publicDir: false,
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL('./putt-pals.html', import.meta.url)),
    },
  },
});
