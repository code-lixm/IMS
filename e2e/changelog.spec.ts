import { expect, test } from "@playwright/test";

const WHATS_NEW_STORAGE_KEY = "ims_last_seen_whats_new_version";

test.describe("WhatsNew 更新日志弹窗 E2E", () => {
  test.beforeEach(async ({ page }) => {
    // 清除 localStorage 确保每次测试状态干净
    await page.evaluate((key) => {
      localStorage.removeItem(key);
    }, WHATS_NEW_STORAGE_KEY);
  });

  test("DEV 模式下手动触发弹窗并关闭", async ({ page }) => {
    await page.goto("/");

    // DEV 模式下 shouldShowWhatsNew 为 false，弹窗不应自动出现
    await page.waitForTimeout(1000);
    await expect(
      page.getByRole("dialog", { name: "🎉 新版本发布" }),
    ).not.toBeVisible({ timeout: 2000 });

    // 手动触发弹窗
    await page.evaluate(() => {
      (window as unknown as { __test_showWhatsNew: () => void }).__test_showWhatsNew();
    });

    // 验证弹窗出现
    const dialog = page.getByRole("dialog", { name: "🎉 新版本发布" });
    await expect(dialog).toBeVisible();

    // 验证弹窗内容：版本号
    await expect(dialog.getByText(/v\d+\.\d+\.\d+/)).toBeVisible();

    // 验证分类列表区域存在（新增/修复/优化等 section）
    const sections = dialog.locator("h3");
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThan(0);

    // 验证列表项存在
    const listItems = dialog.locator("ul li");
    const itemCount = await listItems.count();
    expect(itemCount).toBeGreaterThan(0);

    // 点击"知道了"关闭弹窗
    await dialog.getByRole("button", { name: "知道了" }).click();

    // 验证弹窗消失
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  });

  test("设置页查看更新日志按钮触发弹窗", async ({ page }) => {
    // 注入 __TAURI_INTERNALS__ 使 isDesktopRuntime 为 true
    await page.evaluate(() => {
      (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {};
    });

    await page.goto("/settings");

    // 验证"查看更新日志"按钮存在
    const changelogButton = page.getByRole("button", { name: "查看更新日志" });
    await expect(changelogButton).toBeVisible();

    // 点击按钮
    await changelogButton.click();

    // 验证弹窗出现
    const dialog = page.getByRole("dialog", { name: "🎉 新版本发布" });
    await expect(dialog).toBeVisible();

    // 验证弹窗内容完整
    await expect(dialog.getByRole("button", { name: "知道了" })).toBeVisible();
  });

  test("弹窗关闭后写入 localStorage 版本号", async ({ page }) => {
    await page.goto("/");

    // 确认 localStorage 初始为空
    const initialVersion = await page.evaluate((key) => {
      return localStorage.getItem(key);
    }, WHATS_NEW_STORAGE_KEY);
    expect(initialVersion).toBeNull();

    // 手动触发弹窗
    await page.evaluate(() => {
      (window as unknown as { __test_showWhatsNew: () => void }).__test_showWhatsNew();
    });

    const dialog = page.getByRole("dialog", { name: "🎉 新版本发布" });
    await expect(dialog).toBeVisible();

    // 点击"知道了"关闭
    await dialog.getByRole("button", { name: "知道了" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 2000 });

    // 验证 localStorage 写入了版本号
    const savedVersion = await page.evaluate((key) => {
      return localStorage.getItem(key);
    }, WHATS_NEW_STORAGE_KEY);
    expect(savedVersion).not.toBeNull();
    expect(savedVersion).toMatch(/^v?\d+\.\d+\.\d+/);
  });

  test("弹窗内 Markdown 渲染和外部链接", async ({ page }) => {
    await page.goto("/");

    // 手动触发弹窗
    await page.evaluate(() => {
      (window as unknown as { __test_showWhatsNew: () => void }).__test_showWhatsNew();
    });

    const dialog = page.getByRole("dialog", { name: "🎉 新版本发布" });
    await expect(dialog).toBeVisible();

    // 验证分类标题存在（常见分类：新增/修复/优化/变更/移除等）
    const sectionHeaders = dialog.locator("h3");
    const headerCount = await sectionHeaders.count();
    expect(headerCount).toBeGreaterThan(0);

    // 验证每个分类下有列表项
    const listItems = dialog.locator("ul li");
    const itemCount = await listItems.count();
    expect(itemCount).toBeGreaterThan(0);

    // 验证"查看完整更新日志"链接指向 GitHub Releases
    const releaseLink = dialog.locator("a[href*='github.com']");
    const linkCount = await releaseLink.count();
    if (linkCount > 0) {
      const href = await releaseLink.first().getAttribute("href");
      expect(href).toContain("github.com");
      expect(href).toContain("releases");
    }

    // "知道了" 按钮存在
    await expect(dialog.getByRole("button", { name: "知道了" })).toBeVisible();
  });
});
