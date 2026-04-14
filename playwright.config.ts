import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "9091";
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "9092";
const host = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${webPort}`;
const apiHealthURL = process.env.PLAYWRIGHT_API_HEALTH_URL ?? `http://${host}:${apiPort}/api/health`;
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";

const browserName = process.env.PLAYWRIGHT_BROWSER ?? "chromium";
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

function resolveProjectUse() {
  switch (browserName) {
    case "firefox":
      return {
        ...devices["Desktop Firefox"],
        browserName: "firefox" as const,
      };
    case "webkit":
      return {
        ...devices["Desktop Safari"],
        browserName: "webkit" as const,
      };
    case "chrome":
      return {
        ...devices["Desktop Chrome"],
        browserName: "chromium" as const,
        channel: "chrome",
      };
    case "msedge":
      return {
        ...devices["Desktop Chrome"],
        browserName: "chromium" as const,
        channel: "msedge",
      };
    default:
      return {
        ...devices["Desktop Chrome"],
        browserName: "chromium" as const,
        ...(browserChannel ? { channel: browserChannel } : {}),
      };
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: browserName,
      use: resolveProjectUse(),
    },
  ],
  webServer: useExistingServer
    ? undefined
    : [
        {
          command: "pnpm dev:server",
          url: apiHealthURL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
        {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      ],
});
