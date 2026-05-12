import { expect, test } from "@playwright/test";
import { mockLuiGatewayApp } from "./support/lui-gateway";

test.describe("导入页 AI 初筛完整流程 mock E2E", () => {
  test("可在导入页完成分组重跑、阈值保存与人工改分清除流程", async ({ page }) => {
    const now = Date.now();
    const groupTemplates = [
      {
        id: "template-a",
        name: "前端模板",
        description: "偏重前端工程化",
        prompt: "模板 A：偏重 Vue 与前端工程化。",
        sourceType: "custom",
        isReadonly: false,
        matchHintsJson: JSON.stringify(["vue", "前端"]),
        keywordsJson: JSON.stringify(["typescript"]),
        isDefault: true,
        isActive: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "template-b",
        name: "低代码模板",
        description: "偏重低代码与中后台协作",
        prompt: "模板 B：偏重低代码平台与中后台协作。",
        sourceType: "custom",
        isReadonly: false,
        matchHintsJson: JSON.stringify(["低代码", "中后台"]),
        keywordsJson: JSON.stringify(["vue"]),
        isDefault: false,
        isActive: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const batchId = "batch-grouped-1";
    const taskId = "task-grouped-1";
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
            modelId: "gpt-4.1-mini",
            modelDisplayName: "GPT-4.1 Mini",
          },
        ],
        defaultEndpointId: "openai",
      },
      importBatches: {
        items: [
          {
            id: batchId,
            displayName: "分组批次",
            status: "completed",
            currentStage: "completed",
            totalFiles: 1,
            processedFiles: 1,
            successFiles: 1,
            failedFiles: 0,
            autoScreen: true,
            groupId: "group-tech",
            templateId: "template-a",
            passThreshold: 80,
            reviewThreshold: 70,
            learningEnabled: false,
            batchScreeningConfig: {
              groupId: "group-tech",
              passThreshold: 80,
              reviewThreshold: 70,
              learningEnabled: false,
            },
            createdAt: now,
          },
        ],
      },
      importBatchFiles: {
        [batchId]: {
          items: [
            {
              id: taskId,
              batchId,
              originalPath: "/mock/张三-低代码.pdf",
              normalizedPath: "/mock/zhangsan-grouped.pdf",
              status: "done",
              stage: "completed",
              errorCode: null,
              errorMessage: null,
              createdAt: now,
              updatedAt: now,
              resultJson: JSON.stringify({
                parsedResume: {
                  name: "张三",
                  phone: "13800001111",
                  email: "zhangsan@example.com",
                  position: "前端工程师",
                  yearsOfExperience: 5,
                  skills: ["Vue", "TypeScript"],
                  education: ["清华大学 计算机科学与技术 本科"],
                  workHistory: ["负责低代码平台建设", "参与中后台系统协作"],
                  rawText: "张三 低代码 中后台 Vue TypeScript",
                },
                matchedTemplateId: "template-a",
                screeningStatus: "completed",
                screeningSource: "ai",
                scoreFeedbackHistory: [],
                screeningConclusion: {
                  verdict: "review",
                  label: "待定",
                  score: 76,
                  summary: "低代码经验与岗位存在一定匹配度。",
                  strengths: ["有低代码平台经验"],
                  concerns: ["项目细节还需补充"],
                  recommendedAction: "建议人工复核。",
                  wechatConclusion: "待定",
                  wechatReason: "项目细节还需补充",
                  wechatAction: "建议人工复核",
                  wechatCopyText: "待定\n项目细节还需补充\n建议人工复核",
                  derivedRecommendation: {
                    verdict: "review",
                    label: "待定",
                    passThreshold: 80,
                    reviewThreshold: 70,
                  },
                  templateInfo: {
                    templateId: "template-a",
                    templateName: "前端模板",
                    templateVersion: 1,
                    promptSnapshot: "模板 A：偏重 Vue 与前端工程化。",
                    renderedPromptSnapshot: "模板 A：偏重 Vue 与前端工程化。",
                  },
                },
              }),
            },
          ],
        },
      },
      screeningTemplateGroups: {
        items: [
          {
            id: "group-tech",
            name: "技术组",
            description: "技术岗位模板组",
            passThreshold: 80,
            reviewThreshold: 70,
            learningEnabled: false,
            createdAt: now,
            updatedAt: now,
            templateCount: 2,
            defaultTemplateId: "template-a",
          },
        ],
      },
      screeningTemplateGroupDetails: {
        "group-tech": {
          group: {
            id: "group-tech",
            name: "技术组",
            description: "技术岗位模板组",
            passThreshold: 80,
            reviewThreshold: 70,
            learningEnabled: false,
            createdAt: now,
            updatedAt: now,
          },
          templates: groupTemplates,
          defaultTemplate: groupTemplates[0],
          links: [
            { id: "link-a", groupId: "group-tech", templateId: "template-a", isDefault: true, createdAt: now, updatedAt: now },
            { id: "link-b", groupId: "group-tech", templateId: "template-b", isDefault: false, createdAt: now, updatedAt: now },
          ],
          batchScreeningConfig: {
            groupId: "group-tech",
            passThreshold: 80,
            reviewThreshold: 70,
            learningEnabled: false,
          },
        },
      },
    });

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.goto("/import");

    const batchCard = page.locator("div", { hasText: "分组批次" }).locator("..").locator("..");
    await batchCard.getByRole("button", { name: "查看文件" }).click();

    const fileCard = page.locator("article", { hasText: "张三-低代码.pdf" });
    await expect(fileCard.getByText("张三", { exact: true })).toBeVisible();
    await expect(fileCard.getByText("初筛待定")).toBeVisible();
    await fileCard.getByRole("button", { name: "查看详情" }).click();

    const detailDialog = page.getByRole("dialog");
    await expect(detailDialog.getByText("人工改分与学习反馈")).toBeVisible();
    await detailDialog.getByLabel("修改后分数").fill("88");
    await detailDialog.getByLabel("修改原因").fill("补充了低代码平台实战经验");
    await detailDialog.getByRole("button", { name: "保存人工改分" }).click();
    await expect(detailDialog.getByText("最近一次改分：76 → 88")).toBeVisible();
    await detailDialog.getByRole("button", { name: "清除当前改分" }).click();
    await page.keyboard.press("Escape");

    await batchCard.getByRole("button", { name: "调整阈值" }).click();
    const thresholdDialog = page.getByRole("dialog");
    await expect(thresholdDialog.getByText("调整推荐阈值")).toBeVisible();
    await thresholdDialog.getByLabel("通过阈值").fill("85");
    await thresholdDialog.getByLabel("待定阈值").fill("72");
    await thresholdDialog.getByRole("switch").click();
    await expect(thresholdDialog.getByText("通过 ≥ 85 · 待定 72-84 · 淘汰 < 72")).toBeVisible();
    await thresholdDialog.getByRole("button", { name: "保存阈值" }).click();

    await batchCard.getByRole("button", { name: "调整阈值" }).click();
    const thresholdDialogAgain = page.getByRole("dialog");
    await thresholdDialogAgain.getByRole("button", { name: "清空记录" }).click();
    await page.keyboard.press("Escape");

    await batchCard.getByRole("button", { name: "重跑 AI 初筛" }).click();
    const templateDialog = page.getByRole("dialog");
    await expect(templateDialog.getByText("选择筛选分组与模板")).toBeVisible();
    await templateDialog.getByRole("button", { name: "低代码模板" }).click();
    await templateDialog.getByRole("button", { name: "开始筛选" }).click();

    expect(mocks.taskScoreOverrides).toEqual([
      {
        taskId,
        payload: {
          score: 88,
          reason: "补充了低代码平台实战经验",
        },
      },
    ]);
    expect(mocks.taskScoreClears).toEqual([taskId]);
    expect(mocks.batchConfigUpdates).toEqual([
      {
        batchId,
        payload: {
          passThreshold: 85,
          reviewThreshold: 72,
          learningEnabled: true,
        },
      },
    ]);
    expect(mocks.batchFeedbackClears).toEqual([batchId]);
    expect(mocks.batchRerunRequests).toEqual([
      {
        batchId,
        payload: {
          groupId: "group-tech",
          templateId: "template-b",
        },
      },
    ]);
  });
});
