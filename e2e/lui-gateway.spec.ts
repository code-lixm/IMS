import { expect, test } from "@playwright/test";
import { mockLuiGatewayApp } from "./support/lui-gateway";

test.describe("LUI 页面发送门槛 mock E2E", () => {
  test("未配置端点时发送消息会先要求配置模型厂商", async ({ page }) => {
    const mocks = await mockLuiGatewayApp(page);

    await page.goto("/lui");
    await page.locator("[data-lui-prompt-input]").fill("你好，帮我总结一下候选人信息");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByRole("heading", { name: "先配置模型厂商" })).toBeVisible();
    await expect(page.getByText("发送消息前需要先添加至少一个 AI Gateway 端点。保存后会自动设为默认端点。")).toBeVisible();
    expect(mocks.createdConversations).toHaveLength(0);
    expect(mocks.sentMessages).toHaveLength(0);
  });

  test("已有端点但没有模型时发送消息会先要求选择模型", async ({ page }) => {
    const mocks = await mockLuiGatewayApp(page, {
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

    await page.goto("/lui");
    await page.locator("[data-lui-prompt-input]").fill("你好，帮我总结一下候选人信息");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByRole("dialog", { name: "Model Selector" })).toBeVisible();
    await expect(page.getByPlaceholder("搜索模型或 Provider")).toBeVisible();
    expect(mocks.createdConversations).toHaveLength(0);
    expect(mocks.sentMessages).toHaveLength(0);
  });
});
