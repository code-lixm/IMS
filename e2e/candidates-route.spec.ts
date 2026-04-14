import { expect, test } from "@playwright/test";
import { mockAuthenticatedCandidatesPage } from "./support/candidates";

test.describe("候选人列表页 smoke", () => {
  test("/candidates 可直接访问并渲染列表壳子", async ({ page }) => {
    await mockAuthenticatedCandidatesPage(page);
    await page.goto("/candidates");

    await expect(page).toHaveURL(/\/candidates$/);
    await expect(page.getByRole("button", { name: "新建" })).toBeVisible();
    await expect(page.getByRole("button", { name: "导入" })).toBeVisible();
    await expect(page.getByText("张三")).toBeVisible();
    await expect(page.getByText("前端工程师")).toBeVisible();
  });
});
