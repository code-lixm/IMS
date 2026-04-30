import { beforeEach, describe, expect, test, vi } from "vitest";

// Mocks for dependencies only — ai-screening.ts itself is NOT mocked (per task requirement).
// Env vars are set by vitest-setup.ts before any module loads.

const mocks = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  createOpenAIMock: vi.fn(),
  getTemplateMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateTextMock,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mocks.createOpenAIMock,
}));

// Mock db to prevent real DB calls (not the module under test, but needed
// to avoid DB queries from resolveImportAiEndpoint fallback path).
vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
        limit: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
  },
  rawDb: {
    run: () => {},
  },
}));

// Mock screening-templates so getTemplate uses our mock
vi.mock("../screening-templates", () => ({
  screeningTemplatesService: {
    getTemplate: mocks.getTemplateMock,
  },
}));

// Import the REAL function — no vi.mock of ./ai-screening
import { generateImportScreeningConclusionWithAI } from "./ai-screening";
import { screeningTemplatesService } from "../screening-templates";

const buildInput = () => ({
  parsed: {
    name: "张三",
    phone: "13800001111",
    email: "zhangsan@example.com",
    position: "前端工程师",
    yearsOfExperience: 4,
    skills: ["TypeScript", "Vue"],
    education: ["清华大学 计算机"],
    workHistory: ["3年开发经验"],
    rawText: "张三\n3年开发经验\nTypeScript\n",
  },
  confidence: 0.92,
  fileName: "zhangsan-resume.pdf",
});

describe("ai-screening service", () => {
  beforeEach(() => {
    mocks.generateTextMock.mockReset();
    mocks.createOpenAIMock.mockReset().mockReturnValue({
      chat: vi.fn(() => "mocked-openai-model"),
    });
    mocks.getTemplateMock.mockReset();
  });

  test("passes template context and rendered prompt snapshot into output", async () => {
    const template = {
      id: "builtin:ai:screener:tech-engineer-v1",
      name: "技术研发初筛（技术深度版）",
      description: "偏重技术能力、工程经验与成长性，适用于研发岗位",
      prompt: "你是资深技术研发招聘官，请基于候选人简历进行评估。",
      isDefault: true,
      isActive: true,
      version: 1,
      createdAt: 1734000001000,
      updatedAt: 1734000001000,
    };

    mocks.getTemplateMock.mockResolvedValue(template);
    mocks.generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        verdict: "pass",
        label: "通过",
        score: 91,
        candidateName: "张三",
        candidatePosition: "前端工程师",
        candidateYearsOfExperience: 4,
        screeningBaseUrl: "https://internal.example.com",
        summary: "匹配岗位要求。",
        strengths: ["技术栈匹配"],
        concerns: [],
        recommendedAction: "建议进入下一轮。",
        wechatConclusion: "通过",
        wechatReason: "技能栈匹配",
        wechatAction: "建议安排技术面试",
      }),
    });

    const result = await generateImportScreeningConclusionWithAI({
      ...buildInput(),
      templateId: template.id,
    });

    expect(result.templateInfo).toEqual(
      expect.objectContaining({
        templateId: template.id,
        templateName: template.name,
        templateVersion: template.version,
        promptSnapshot: template.prompt,
      }),
    );
    expect(result.templateInfo?.renderedPromptSnapshot).toContain(
      "【模板名称】技术研发初筛（技术深度版）",
    );
    expect(result.templateInfo?.renderedPromptSnapshot).toContain(template.prompt);
  });

  test("returns no templateInfo when templateId is not provided", async () => {
    mocks.generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        verdict: "review",
        label: "待定",
        score: 66,
        screeningBaseUrl: "https://internal.example.com",
        summary: "信息不足，建议人工复核。",
        strengths: ["有相关经验"],
        concerns: ["信息不完整"],
        recommendedAction: "建议补充项目细节后复核。",
        wechatConclusion: "待定",
        wechatReason: "信息不完整",
        wechatAction: "建议补充经历信息",
      }),
    });

    const result = await generateImportScreeningConclusionWithAI({
      ...buildInput(),
      templateId: undefined,
    });

    expect(result.templateInfo).toBeUndefined();
    expect(mocks.getTemplateMock).not.toHaveBeenCalled();
  });
});