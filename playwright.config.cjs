// T1 real-browser tests: Playwright drives the built modular app (index.html) in real Chromium,
// Firefox and WebKit, with real WebGL and, for multiplayer specs, real PeerJS/WebRTC through a local
// PeerServer started by tests/browser/support/global-setup.cjs. Run with `npm run test:browser`.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: 'tests/browser',
  // Real-time physics, putt transitions and software WebGL on CI make full maps slow.
  timeout: 300_000,
  expect: { timeout: 15_000 },
  // One app per worker keeps frame times (and so real-time hazards) predictable.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/browser',
  globalSetup: require.resolve('./tests/browser/support/global-setup.cjs'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
