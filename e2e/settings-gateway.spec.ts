import { expect, test } from "@playwright/test";
import { mockLuiGatewayApp } from "./support/lui-gateway";

test.describe("设置页 AI Gateway mock E2E", () => {
  test("保存端点时会持久化默认模型并在列表中展示", async ({ page }) => {
    const mocks = await mockLuiGatewayApp(page);

    await page.goto("/settings");

    await expect(page.getByText("AI Gateway 自定义端点")).toBeVisible();
    await page.getByRole("button", { name: "添加端点" }).click();

    await page.locator("#gateway-endpoint-provider").selectOption("openai");
    await page.locator("#gateway-endpoint-apikey").fill("sk-test-openai");
    await expect(page.locator("#gateway-endpoint-model")).toBeVisible();
    await page.locator("#gateway-endpoint-model").selectOption("openai::gpt-4.1-mini");
    await page.getByRole("button", { name: "添加端点" }).click();

    await expect(page.getByText("已保存自定义端点")).toBeVisible();
    await expect(page.getByText("默认模型：OpenAI / GPT-4.1 Mini")).toBeVisible();

    expect(mocks.settingsUpdates).toHaveLength(1);
    expect(mocks.settingsUpdates[0]).toMatchObject({
      defaultEndpointId: "openai",
      customEndpoints: [
        {
          providerId: "openai",
          modelId: "gpt-4.1-mini",
          modelDisplayName: "OpenAI / GPT-4.1 Mini",
        },
      ],
    });
  });

  test("测试连接会带 strict 参数请求模型列表", async ({ page }) => {
    const mocks = await mockLuiGatewayApp(page);

    await page.goto("/settings");
    await page.getByRole("button", { name: "添加端点" }).click();

    await page.locator("#gateway-endpoint-provider").selectOption("openai");
    await page.locator("#gateway-endpoint-apikey").fill("sk-test-openai");
    await expect(page.locator("#gateway-endpoint-model")).toBeVisible();
    await page.getByRole("button", { name: "测试连接" }).click();

    await expect(page.getByText("连接成功，发现 1 个 Provider、2 个模型")).toBeVisible();
    expect(mocks.modelRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "openai",
          apiKey: "sk-test-openai",
          strict: true,
        }),
      ]),
    );
  });
});
