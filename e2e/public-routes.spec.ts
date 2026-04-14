import { expect, test } from "@playwright/test";
import { mockLoginPageApis, mockUnauthenticatedSession } from "./support/auth";

test.describe("公开页面 smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedSession(page);
  });

  test("404 页面可访问", async ({ page }) => {
    await page.goto("/__playwright_not_found__");

    await expect(page.getByRole("heading", { name: "页面未找到" })).toBeVisible();
    await expect(page.getByRole("button", { name: "返回首页" })).toBeVisible();
    await expect(page.getByRole("button", { name: "返回上页" })).toBeVisible();
  });

  test("500 页面可访问", async ({ page }) => {
    await page.goto("/500");

    await expect(page.getByRole("heading", { name: "服务器错误" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新尝试" })).toBeVisible();
    await expect(page.getByRole("button", { name: "返回首页" })).toBeVisible();
  });
});

test.describe("登录页 smoke", () => {
  test("二维码登录壳子可渲染", async ({ page }) => {
    await mockLoginPageApis(page);
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "使用抱抱 App 扫码登录 IMS" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "当前登录二维码" })).toBeVisible();
    await expect(page.getByRole("button", { name: "刷新" })).toBeEnabled();
    await expect(page.locator('img[alt="抱抱登录二维码"]')).toBeVisible();
    await expect(page.getByText("二维码服务可用")).toBeVisible();
  });
});
