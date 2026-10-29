import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // The room pages render WebGL every frame; more than 4 in parallel contend for
  // CPU/GPU and push first-load `ready` past 5 s; specs wait up to READY_TIMEOUT (tests/e2e/ready.ts).
  workers: 4,
  use: { baseURL: 'http://127.0.0.1:4321' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4321 --ignore-lock',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
