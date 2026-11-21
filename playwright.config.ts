import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.browser.ts',
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4177',
    launchOptions: { executablePath: process.env.CUTROOM_CHROMIUM_PATH },
  },
  webServer: {
    command: 'npm run build && npm exec -- vite preview --host 127.0.0.1 --port 4177 --strictPort',
    url: 'http://127.0.0.1:4177',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'tablet landscape', use: { viewport: { width: 1180, height: 820 }, hasTouch: true } },
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
