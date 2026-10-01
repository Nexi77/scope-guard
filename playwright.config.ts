import { existsSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env")) process.loadEnvFile(".env");

if (
  !process.env.SUPABASE_URL ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.SUPABASE_URL).hostname)
) {
  throw new Error("E2E requires a local Supabase backend. Configure .env and .dev.vars for local preview.");
}

// Astro preview's documented default; E2E_PORT permits an explicit local override.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Astro 7 otherwise detaches preview when invoked by an agent.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
