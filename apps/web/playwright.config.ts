import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], permissions: ["clipboard-read", "clipboard-write"] } }],
  webServer: { command: `pnpm exec next start -p ${port}`, port, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
