import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_URL: "http://localhost:3000",
      FACTORY_DATA_DIR: ".data/acceptance-" + randomUUID(),
    },
  },
});
