// T1 real-browser tests: Playwright drives the built modular app (index.html) in real Chromium,
// Firefox and WebKit, with real WebGL and, for multiplayer specs, real PeerJS/WebRTC through a local
// PeerServer started by tests/browser/support/global-setup.cjs. Run with `npm run test:browser`.
const { defineConfig, devices } = require('@playwright/test');

// PP_TEST_PORT moves the preview server so two checkouts can run the suite at once.
const PORT = Number(process.env.PP_TEST_PORT) || 4173;

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
    // Fail fast instead of waiting forever on a hidden or missing control.
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // On CI, Chromium's built-in SwiftShader is too slow for real-time putt timers; draw through ANGLE on
    // Mesa's software OpenGL instead (the workflow provides a virtual display).
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions: { args: [...(process.env.CI ? ['--use-angle=gl', '--ignore-gpu-blocklist'] : []), ...(process.env.PP_CHROMIUM_ARGS ? process.env.PP_CHROMIUM_ARGS.split(' ') : [])] } } },
    // GPU-less CI runners: Firefox blocklists software WebGL unless forced, and the app needs WebGL to start.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 }, launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true } } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    // Reusing a server is opt-in: a running server may belong to another checkout and serve its build.
    reuseExistingServer: !process.env.CI && process.env.PP_REUSE_SERVER === '1',
    timeout: 180_000,
  },
});
