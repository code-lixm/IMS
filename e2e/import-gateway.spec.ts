import { expect, test } from "@playwright/test";
import { mockLuiGatewayApp } from "./support/lui-gateway";

test.describe("导入页 AI 初筛门槛 mock E2E", () => {
  test("开启 AI 初筛但没有端点时会先要求配置模型厂商", async ({ page }) => {
    await mockLuiGatewayApp(page);

    await page.goto("/import");
    await page.getByRole("switch").click();

    await expect(page.getByRole("heading", { name: "先配置模型厂商" })).toBeVisible();
    await expect(page.getByText("开启 AI 初筛前，需要先添加至少一个 AI Gateway 端点。")).toBeVisible();
  });

  test("已有端点但没有可选模型时会回到端点配置", async ({ page }) => {
    await mockLuiGatewayApp(page, {
      settings: {
        customEndpoints: [
          {
            id: "openai",
            name: "OpenAI",
            baseURL: "https://api.openai.com/v1",
            provider: "openai",
            providerId: "openai",
            apiKey: "sk-existing",
          },
        ],
        defaultEndpointId: "openai",
      },
      emptyModelProviderIds: ["openai"],
    });

    await page.goto("/import");
    await page.getByRole("switch").click();

    await expect(page.getByRole("heading", { name: "先配置模型厂商" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "模型厂商" })).toBeVisible();
    await expect(page.getByText("Base URL: https://api.openai.com/v1")).toBeVisible();
    await expect(page.getByText("默认模型（可选）")).toHaveCount(0);
  });

  test("有已完成批次时可打开导出报告并按模式导出", async ({ page }) => {
    const mocks = await mockLuiGatewayApp(page, {
      importBatches: {
        items: [
          {
            id: "batch-completed-1",
            displayName: "已完成批次 1",
            status: "completed",
            currentStage: "completed",
            totalFiles: 3,
            processedFiles: 3,
            successFiles: 3,
            failedFiles: 0,
            autoScreen: true,
            createdAt: Date.now(),
          },
        ],
      },
    });

    await page.goto("/import");
    await expect(page.getByRole("button", { name: "导出报告" })).toBeEnabled();
    await page.getByRole("button", { name: "导出报告" }).click();

    const exportDialog = page.getByRole("dialog");
    await expect(exportDialog.getByRole("heading", { name: "自定义导出" })).toBeVisible();
    await expect(exportDialog.getByText("支持按分数范围、指定 PDF 文件导出。ZIP 命名统一为“base-name-年限-职位-联系方式（手机号）”。")).toBeVisible();
    await expect(exportDialog.getByText("已完成批次 1")).toBeVisible();
    await expect(exportDialog.getByRole("button", { name: /ZIP 导出/ })).toBeVisible();
    await expect(exportDialog.getByLabel("最低分")).toBeVisible();
    await expect(exportDialog.getByRole("button", { name: "导出 ZIP 包" })).toBeVisible();

    await exportDialog.getByRole("button", { name: /微信文案/ }).click();
    await exportDialog.getByRole("button", { name: "导出微信文案" }).click();

    expect(mocks.exportRequests).toEqual([
      {
        mode: "wechat_text",
        batchIds: ["batch-completed-1"],
        scoreMin: null,
        scoreMax: null,
        includeReports: false,
      },
    ]);
  });
});
