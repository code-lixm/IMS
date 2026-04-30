import { expect, test, type Page } from "@playwright/test";

const ONBOARDING_STORAGE_KEY = "ims-onboarding";
const ONBOARDING_VERSION = "2026-04-12";
const WHATS_NEW_STORAGE_KEY = "ims_last_seen_whats_new_version";
const FIRST_INSTALL_EVIDENCE_PATH = ".sisyphus/evidence/task-4-first-install.png";
const MANUAL_ONBOARDING_EVIDENCE_PATH = ".sisyphus/evidence/task-4-manual-onboarding.png";

declare global {
  interface Window {
    __test_showWhatsNew?: () => void;
  }
}

function getSuccessEnvelope<T>(data: T) {
  return {
    success: true,
    data,
    error: null,
    meta: {
      requestId: "playwright-e2e",
      timestamp: new Date("2026-04-28T00:00:00.000Z").toISOString(),
    },
  };
}

function getWhatsNewDialog(page: Page) {
  return page
    .locator("[role=dialog]")
    .filter({ hasText: /新版本发布/ })
    .filter({ has: page.locator("button").filter({ hasText: "知道了" }) })
    .first();
}

function getWhatsNewDismissButton(page: Page) {
  return page.locator("button").filter({ hasText: "知道了" }).last();
}

function getWhatsNewDialogs(page: Page) {
  return page.locator("[role=dialog]").filter({ hasText: /新版本发布/ });
}

function getOnboardingPopover(page: Page) {
  return page.locator(".driver-popover");
}

function getOnboardingCloseButton(page: Page) {
  return page.locator(".driver-popover-close-btn");
}

function getAvatarMenuTrigger(page: Page) {
  return page.locator("button[type='button']").filter({ has: page.locator("span[class*='rounded-md']") }).last();
}

async function mockBootstrapApis(page: Page) {
  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());

    switch (requestUrl.pathname) {
      case "/api/auth/status":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({
            status: "valid",
            user: { id: "user-1", name: "测试用户", email: "tester@example.com" },
            lastValidatedAt: Date.now(),
          })),
        });
        return;
      case "/api/sync/status":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({
            enabled: false,
            intervalMs: 5000,
            lastSyncAt: null,
            lastError: null,
          })),
        });
        return;
      case "/api/import/batches":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({ items: [] })),
        });
        return;
      case "/api/candidates":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
          })),
        });
        return;
      case "/api/lui/providers":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({ providers: [] })),
        });
        return;
      case "/api/lui/agents":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({ items: [] })),
        });
        return;
      case "/api/lui/settings":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({
            defaultEndpointId: null,
            customEndpoints: [],
          })),
        });
        return;
      case "/api/lui/models":
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(getSuccessEnvelope({ providers: [] })),
        });
        return;
      default:
        await route.continue();
    }
  });
}

async function prepareDesktopRuntime(
  page: Page,
  options: {
    enableAutoWhatsNew?: boolean;
    onboarding?: "clear" | "completed";
    seenWhatsNewVersion?: string | null;
  } = {},
) {
  const {
    enableAutoWhatsNew = false,
    onboarding = "clear",
    seenWhatsNewVersion = null,
  } = options;

  await page.addInitScript((payload) => {
    const win = window as Window & {
      __TAURI_INTERNALS__?: object;
      __test_enableAutoWhatsNew?: boolean;
    };

    win.__TAURI_INTERNALS__ = {};

    if (payload.enableAutoWhatsNew) {
      win.__test_enableAutoWhatsNew = true;
    } else {
      delete win.__test_enableAutoWhatsNew;
    }

    if (payload.onboarding === "completed") {
      window.localStorage.setItem(payload.onboardingKey, JSON.stringify({
        version: payload.onboardingVersion,
        completed: true,
        completedAt: Date.now(),
      }));
    } else {
      window.localStorage.removeItem(payload.onboardingKey);
    }

    if (payload.seenWhatsNewVersion === null) {
      window.localStorage.removeItem(payload.whatsNewKey);
    } else {
      window.localStorage.setItem(payload.whatsNewKey, payload.seenWhatsNewVersion);
    }
  }, {
    enableAutoWhatsNew,
    onboarding,
    onboardingKey: ONBOARDING_STORAGE_KEY,
    onboardingVersion: ONBOARDING_VERSION,
    seenWhatsNewVersion,
    whatsNewKey: WHATS_NEW_STORAGE_KEY,
  });
}

async function openAvatarMenu(page: Page) {
  const trigger = getAvatarMenuTrigger(page);
  await expect(trigger).toBeVisible();
  await trigger.click();
}

test.describe("WhatsNew 更新日志弹窗 E2E", () => {
  test("DEV 模式下手动触发弹窗并关闭", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page, { onboarding: "completed" });
    await page.goto("/settings");

    await page.evaluate((key) => {
      localStorage.removeItem(key);
    }, WHATS_NEW_STORAGE_KEY);

    await page.waitForTimeout(1000);
    await expect(getWhatsNewDialog(page)).not.toBeVisible({ timeout: 2000 });

    await page.evaluate(() => {
      if (typeof window.__test_showWhatsNew === "function") {
        window.__test_showWhatsNew();
      }
    });

    const dialog = getWhatsNewDialog(page);
    const closeButton = getWhatsNewDismissButton(page);
    await expect(closeButton).toBeVisible();
    await expect(getWhatsNewDialogs(page)).toHaveCount(1);
    await expect(dialog.getByText(/v\d+\.\d+\.\d+/)).toBeVisible();

    const sections = dialog.locator("h3");
    expect(await sections.count()).toBeGreaterThan(0);

    const listItems = dialog.locator("ul li");
    expect(await listItems.count()).toBeGreaterThan(0);

    await closeButton.click();
    await expect(closeButton).not.toBeVisible({ timeout: 2000 });
  });

  test("设置页查看更新日志按钮触发弹窗", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page);
    await page.goto("/settings");

    const changelogButton = page.getByRole("button", { name: "查看更新日志" });
    await expect(changelogButton).toBeVisible();
    await changelogButton.click();

    await expect(getWhatsNewDismissButton(page)).toBeVisible();
  });

  test("弹窗关闭后写入 localStorage 版本号", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page, { onboarding: "completed" });
    await page.goto("/settings");

    await page.evaluate((key) => {
      localStorage.removeItem(key);
    }, WHATS_NEW_STORAGE_KEY);

    const initialVersion = await page.evaluate((key) => localStorage.getItem(key), WHATS_NEW_STORAGE_KEY);
    expect(initialVersion).toBeNull();

    await page.evaluate(() => {
      if (typeof window.__test_showWhatsNew === "function") {
        window.__test_showWhatsNew();
      }
    });

    const closeButton = getWhatsNewDismissButton(page);
    await expect(closeButton).toBeVisible();
    await expect(getWhatsNewDialogs(page)).toHaveCount(1);
    await closeButton.click();
    await expect(closeButton).not.toBeVisible({ timeout: 2000 });

    const savedVersion = await page.evaluate((key) => localStorage.getItem(key), WHATS_NEW_STORAGE_KEY);
    expect(savedVersion).not.toBeNull();
    expect(savedVersion).toMatch(/^v?\d+\.\d+\.\d+/);
  });

  test("弹窗内 Markdown 渲染和外部链接", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page, { onboarding: "completed" });
    await page.goto("/settings");

    await page.evaluate((key) => {
      localStorage.removeItem(key);
    }, WHATS_NEW_STORAGE_KEY);

    await page.evaluate(() => {
      if (typeof window.__test_showWhatsNew === "function") {
        window.__test_showWhatsNew();
      }
    });

    const dialog = getWhatsNewDialog(page);
    await expect(getWhatsNewDismissButton(page)).toBeVisible();
    await expect(getWhatsNewDialogs(page)).toHaveCount(1);

    const sectionHeaders = dialog.locator("h3");
    expect(await sectionHeaders.count()).toBeGreaterThan(0);

    const listItems = dialog.locator("ul li");
    expect(await listItems.count()).toBeGreaterThan(0);

    const releaseLink = dialog.locator("a[href*='github.com']");
    const linkCount = await releaseLink.count();
    if (linkCount > 0) {
      const href = await releaseLink.first().getAttribute("href");
      expect(href).toContain("github.com");
      expect(href).toContain("releases");
    }

    await expect(getWhatsNewDismissButton(page)).toBeVisible();
  });

  test("首次安装桌面端先 onboarding 再 changelog", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page, {
      enableAutoWhatsNew: true,
      onboarding: "clear",
      seenWhatsNewVersion: null,
    });
    await page.goto("/settings");

    const onboardingPopover = getOnboardingPopover(page);
    await expect(onboardingPopover).toBeVisible();
    await expect(getWhatsNewDialog(page)).not.toBeVisible();

    await getOnboardingCloseButton(page).click();

    await expect(getWhatsNewDismissButton(page)).toBeVisible();
    await expect(getWhatsNewDialogs(page)).toHaveCount(1);
    await page.screenshot({ path: FIRST_INSTALL_EVIDENCE_PATH, fullPage: true });
  });

  test("已完成 onboarding 且 changelog 未读时直接打开 changelog", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page, {
      enableAutoWhatsNew: true,
      onboarding: "completed",
      seenWhatsNewVersion: null,
    });
    await page.goto("/settings");

    await expect(getOnboardingPopover(page)).not.toBeVisible();
    await expect(getWhatsNewDismissButton(page)).toBeVisible();
    await expect(getWhatsNewDialogs(page)).toHaveCount(1);
  });

  test("头像下拉菜单更新日志项打开更新日志弹窗", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page);
    await page.goto("/settings");

    await openAvatarMenu(page);
    const changelogItem = page.getByRole("menuitem", { name: /更新日志/i });
    await expect(changelogItem).toBeVisible();
    await changelogItem.click();

    const closeButton = getWhatsNewDismissButton(page);
    await expect(closeButton).toBeVisible();
    await expect(getWhatsNewDialogs(page)).toHaveCount(1);
    await closeButton.click();
    await expect(closeButton).not.toBeVisible({ timeout: 2000 });
  });

  test("手动新手引导关闭后不自动弹出更新日志", async ({ page }) => {
    await mockBootstrapApis(page);
    await prepareDesktopRuntime(page, {
      onboarding: "completed",
      seenWhatsNewVersion: null,
    });
    await page.goto("/settings");

    await expect(getWhatsNewDialog(page)).not.toBeVisible({ timeout: 2000 });

    await openAvatarMenu(page);
    const onboardingItem = page.getByRole("menuitem", { name: /新手引导/i });
    await expect(onboardingItem).toBeVisible();
    await onboardingItem.click();

    const onboardingPopover = getOnboardingPopover(page);
    await expect(onboardingPopover).toBeVisible();
    await page.screenshot({ path: MANUAL_ONBOARDING_EVIDENCE_PATH, fullPage: true });

    await getOnboardingCloseButton(page).click();
    await expect(onboardingPopover).not.toBeVisible({ timeout: 2000 });
    await expect(getWhatsNewDialog(page)).not.toBeVisible({ timeout: 2000 });
    expect(await page.evaluate((key) => localStorage.getItem(key), WHATS_NEW_STORAGE_KEY)).toBeNull();

    await openAvatarMenu(page);
    await page.getByRole("menuitem", { name: /更新日志/i }).click();
    await expect(getWhatsNewDismissButton(page)).toBeVisible();
    await expect(getWhatsNewDialogs(page)).toHaveCount(1);
  });
});
