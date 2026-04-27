import { expect, test } from "@playwright/test";
import { mockAuthenticatedCandidatesPage } from "./support/candidates";

test.describe("候选人列表页 smoke", () => {
  test("/candidates 可直接访问并渲染列表壳子", async ({ page }) => {
    await mockAuthenticatedCandidatesPage(page);
    await page.goto("/candidates");

    const onboardingDialog = page.getByRole("dialog", { name: "首次使用引导" });
    if (await onboardingDialog.isVisible()) {
      await onboardingDialog.getByRole("button", { name: "Close" }).click();
    }

    await expect(page).toHaveURL(/\/candidates$/);
    await expect(page.getByRole("banner").getByRole("button", { name: "导入面试信息" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "初筛列表" })).toBeVisible();
    await expect(page.getByText("张三")).toBeVisible();
    await expect(page.getByText("前端工程师")).toBeVisible();

    await page.getByRole("banner").getByRole("button", { name: "初筛列表" }).click();
    await expect(page).toHaveURL(/\/import$/);
  });
});
