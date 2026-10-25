import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const deployedUrl = process.env.PLAYWRIGHT_BASE_URL;
if (deployedUrl && !process.env.PLAYWRIGHT_API_URL) {
  throw new Error("Deployed browser tests require PLAYWRIGHT_API_URL as well as PLAYWRIGHT_BASE_URL.");
}

export default defineConfig({
  testDir: "./tests",
  // Hosted checks include network latency and the documented scale-to-zero start.
  timeout: deployedUrl ? 75_000 : 45_000,
  expect: { timeout: deployedUrl ? 20_000 : 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: deployedUrl ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: deployedUrl ? undefined : [
    {
      command: process.platform === "win32"
        ? "powershell -NoProfile -File scripts/cargo.ps1 run -p reactcoach-api --locked"
        : "cargo run -p reactcoach-api --locked",
      cwd: path.resolve(__dirname, "../.."),
      url: "http://localhost:8080/api/v1/health",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run start -- --hostname localhost --port 3000",
      url: "http://localhost:3000",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
