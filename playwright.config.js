import { defineConfig, devices } from '@playwright/test';

const chromiumLaunchOptions = process.env.CI ? { args: ['--enable-unsafe-swiftshader'] } : {};
const projects = process.env.PLAYWRIGHT_CHANNEL
  ? [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          channel: process.env.PLAYWRIGHT_CHANNEL,
          launchOptions: chromiumLaunchOptions,
        },
      },
    ]
  : [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunchOptions },
      },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ];

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  projects,
  use: {
    baseURL: 'http://127.0.0.1:4173/sublime-knob/',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/sublime-knob/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
