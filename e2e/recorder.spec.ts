/**
 * Recorder E2E spec — covers the global recorder floating button and panel UI.
 *
 * EXECUTION NOTE:
 * This spec requires a full dev environment (server + web). The recorder uses
 * Tauri desktop adapter under the hood; in a plain browser the UI shows a
 * "仅桌面端可用" hint and buttons are disabled. The tests below validate:
 *
 * 1. The recorder floating button renders on every route.
 * 2. Clicking toggles the panel open/closed.
 * 3. In browser mode (no Tauri), the panel shows the desktop-only hint and
 *    the recording action button is disabled.
 *
 * Playwright cannot test the real Tauri recorder flow (requires `pnpm dev:desktop`
 * and a native webview). These scenarios cover the UI contract only.
 *
 * ONBOARDING OVERLAY:
 * The onboarding tour (driver.js) creates a modal overlay that captures pointer
 * events. We pre-seed localStorage to mark it completed before every test so it
 * never renders. See apps/web/src/stores/onboarding.ts and
 * apps/web/src/components/onboarding-tour-host.vue.
 *
 * AUTH NOTE:
 * RecorderHost is rendered in App.vue above <router-view>, so it appears on
 * every route including /login. We use /login as the test page to avoid auth
 * mocking complexity.
 */

import { expect, test } from "@playwright/test";

test.describe("Recorder global UI", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed localStorage so onboarding tour never starts
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "ims-onboarding",
        JSON.stringify({
          version: "2026-04-12",
          completed: true,
          completedAt: Date.now(),
        }),
      );
    });
    // Use the public /login page to avoid auth mocking
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
  });

  test("recorder host container is attached on the page", async ({ page }) => {
    // The recorder host container is a fixed element at z-[90]
    const recorderHost = page.locator(".fixed.inset-0.z-\\[90\\]");
    await expect(recorderHost).toBeAttached({ timeout: 5_000 });
  });

  test("panel opens on button click and shows desktop-only hint in browser", async ({ page }) => {
    // Click the floating button to open the panel
    const toggleButton = page.locator(".fixed.inset-0.z-\\[90\\] button").last();
    await toggleButton.click({ force: true });

    // The panel should appear
    const panel = page.locator("section.w-\\[24rem\\]");
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // In browser mode, panel should mention "仅桌面端可用"
    await expect(panel).toContainText("仅桌面端可用", { timeout: 3_000 });

    // The recording action button should be disabled (browser mode)
    const actionButton = panel.getByRole("button", { name: /仅桌面端可用/ });
    await expect(actionButton).toBeDisabled({ timeout: 3_000 });
  });

  test("panel closes via the '收起' button", async ({ page }) => {
    // Open panel
    const toggleButton = page.locator(".fixed.inset-0.z-\\[90\\] button").last();
    await toggleButton.click({ force: true });
    await expect(page.locator("section.w-\\[24rem\\]")).toBeVisible({ timeout: 5_000 });

    // Click "收起" to close
    const closeButton = page.locator("section.w-\\[24rem\\]").getByRole("button", { name: "收起" });
    await closeButton.click({ force: true });

    // Panel should disappear
    await expect(page.locator("section.w-\\[24rem\\]")).not.toBeVisible({ timeout: 3_000 });
  });
});
