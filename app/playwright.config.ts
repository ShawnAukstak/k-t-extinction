import { defineConfig, devices } from '@playwright/test';

// Headless Chromium defaults to software WebGL (SwiftShader, ~8 fps here). On macOS use the real GPU
// through ANGLE/Metal (~60 fps) so timing-sensitive tests aren't starved; elsewhere fall back.
const gpuArgs = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// KT_BASE_URL runs the suite against another server (a `vite preview` of the build, or the deployed site).
const external = process.env.KT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: external ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: external ? undefined : {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions: { args: gpuArgs } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], launchOptions: { args: gpuArgs } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
});
