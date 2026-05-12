import { beforeEach, describe, expect, test, vi } from "vitest";

// Mocks for dependencies only — ai-screening.ts itself is NOT mocked (per task requirement).
// Env vars are set by vitest-setup.ts before any module loads.

const mocks = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  createOpenAIMock: vi.fn(),
  getGroupMock: vi.fn(),
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
vi.mock("../screening-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../screening-templates")>();
  return {
    ...actual,
    screeningTemplatesService: {
      ...actual.screeningTemplatesService,
      getGroup: mocks.getGroupMock,
      getTemplate: mocks.getTemplateMock,
    },
  };
});

// Import the REAL function — no vi.mock of ./ai-screening
import { generateImportScreeningConclusionWithAI } from "./ai-screening";

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

const buildTemplate = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: String(overrides.id ?? "template-a"),
  name: String(overrides.name ?? "模板 A"),
  description: overrides.description == null ? null : String(overrides.description),
  prompt: String(overrides.prompt ?? "模板提示词"),
  sourceType: String(overrides.sourceType ?? "custom"),
  isReadonly: Boolean(overrides.isReadonly ?? false),
  matchHintsJson: overrides.matchHintsJson == null ? null : String(overrides.matchHintsJson),
  keywordsJson: overrides.keywordsJson == null ? null : String(overrides.keywordsJson),
  isDefault: Boolean(overrides.isDefault ?? false),
  isActive: Boolean(overrides.isActive ?? true),
  version: Number(overrides.version ?? 1),
  createdAt: Number(overrides.createdAt ?? 1_734_000_001_000),
  updatedAt: Number(overrides.updatedAt ?? 1_734_000_001_000),
});

const buildGroupDetail = (templates: Array<ReturnType<typeof buildTemplate>>, defaultTemplateId: string) => ({
  group: {
    id: "group-tech",
    name: "技术组",
    description: null,
    passThreshold: 80,
    reviewThreshold: 70,
    learningEnabled: false,
    createdAt: 1_734_000_001_000,
    updatedAt: 1_734_000_001_000,
  },
  templates,
  defaultTemplate: templates.find((template) => template.id === defaultTemplateId) ?? null,
  links: templates.map((template, index) => ({
    id: `link-${index}`,
    groupId: "group-tech",
    templateId: template.id,
    isDefault: template.id === defaultTemplateId,
    createdAt: 1_734_000_001_000 + index,
    updatedAt: 1_734_000_001_000 + index,
  })),
  batchScreeningConfig: {
    groupId: "group-tech",
    passThreshold: 80,
    reviewThreshold: 70,
    learningEnabled: false,
  },
});

describe("ai-screening service", () => {
  beforeEach(() => {
    mocks.generateTextMock.mockReset();
    mocks.createOpenAIMock.mockReset().mockReturnValue({
      chat: vi.fn(() => "mocked-openai-model"),
    });
    mocks.getGroupMock.mockReset();
    mocks.getTemplateMock.mockReset();
  });

  test("passes template context and rendered prompt snapshot into output", async () => {
    const template = {
      id: "builtin:ai:screener:tech-engineer-v1",
      name: "技术研发初筛（技术深度版）",
      description: "偏重技术能力、工程经验与成长性，适用于研发岗位",
      prompt: "你是资深技术研发招聘官，请基于候选人简历进行评估。",
      sourceType: "builtin",
      isReadonly: true,
      matchHintsJson: null,
      keywordsJson: null,
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
    expect(result.matchedTemplateId).toBe(template.id);
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

  test("injects local learning feedback into system prompt when provided", async () => {
    mocks.generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        verdict: "pass",
        label: "通过",
        score: 88,
        summary: "综合匹配度较高。",
        strengths: ["项目经验匹配"],
        concerns: [],
        recommendedAction: "建议进入下一轮。",
        wechatConclusion: "通过",
        wechatReason: "项目经验匹配",
        wechatAction: "建议安排技术面试",
      }),
    });

    await generateImportScreeningConclusionWithAI({
      ...buildInput(),
      learningFeedback: [
        "1. 原始分 76，人工改为 88，原因：补充了低代码平台实战经验",
      ],
    });

    expect(mocks.generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("【本地人工反馈样本】"),
      }),
    );
    expect(mocks.generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("人工改为 88"),
      }),
    );
  });

  test("shortlists templates inside selected group and lets AI choose exactly one", async () => {
    const templateA = buildTemplate({
      id: "template-a",
      name: "前端模板",
      prompt: "模板 A：偏重 Vue 与前端工程化。",
      matchHintsJson: JSON.stringify(["vue", "前端"]),
      keywordsJson: JSON.stringify(["typescript"]),
    });
    const templateB = buildTemplate({
      id: "template-b",
      name: "低代码模板",
      prompt: "模板 B：偏重低代码平台与中后台协作。",
      matchHintsJson: JSON.stringify(["低代码", "中后台"]),
      keywordsJson: JSON.stringify(["vue"]),
    });

    mocks.getGroupMock.mockResolvedValue(buildGroupDetail([templateA, templateB], templateA.id));
    mocks.generateTextMock
      .mockResolvedValueOnce({ text: JSON.stringify({ templateId: "template-b", reason: "候选人低代码经历更强" }) })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          verdict: "pass",
          label: "通过",
          score: 89,
          summary: "低代码和中后台协作经历匹配。",
          strengths: ["有低代码平台经验"],
          concerns: [],
          recommendedAction: "建议进入下一轮。",
          wechatConclusion: "通过",
          wechatReason: "低代码经验匹配",
          wechatAction: "建议安排技术面试",
        }),
      });

    const result = await generateImportScreeningConclusionWithAI({
      ...buildInput(),
      parsed: {
        ...buildInput().parsed,
        rawText: "张三\n做过低代码平台和中后台系统\nVue\nTypeScript",
        workHistory: ["负责低代码平台搭建", "参与中后台系统协作"],
      },
      groupId: "group-tech",
    });

    expect(mocks.generateTextMock).toHaveBeenCalledTimes(2);
    expect(result.matchedTemplateId).toBe("template-b");
    expect(result.templateInfo?.templateId).toBe("template-b");
    expect(result.templateInfo?.renderedPromptSnapshot).toContain("模板 B：偏重低代码平台与中后台协作");
  });

  test("uses explicitly selected template inside group and skips shortlist chooser", async () => {
    const templateA = buildTemplate({
      id: "template-a",
      name: "前端模板",
      prompt: "模板 A：偏重 Vue 与前端工程化。",
      matchHintsJson: JSON.stringify(["vue", "前端"]),
      keywordsJson: JSON.stringify(["typescript"]),
    });
    const templateB = buildTemplate({
      id: "template-b",
      name: "低代码模板",
      prompt: "模板 B：偏重低代码平台与中后台协作。",
      matchHintsJson: JSON.stringify(["低代码", "中后台"]),
      keywordsJson: JSON.stringify(["vue"]),
    });

    mocks.getGroupMock.mockResolvedValue(buildGroupDetail([templateA, templateB], templateA.id));
    mocks.generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        verdict: "pass",
        label: "通过",
        score: 87,
        summary: "按显式模板完成筛选。",
        strengths: ["前端经验匹配"],
        concerns: [],
        recommendedAction: "建议进入下一轮。",
        wechatConclusion: "通过",
        wechatReason: "前端经验匹配",
        wechatAction: "建议安排技术面试",
      }),
    });

    const result = await generateImportScreeningConclusionWithAI({
      ...buildInput(),
      parsed: {
        ...buildInput().parsed,
        rawText: "张三\n做过低代码平台和中后台系统\nVue\nTypeScript",
        workHistory: ["负责低代码平台搭建", "参与中后台系统协作"],
      },
      groupId: "group-tech",
      templateId: "template-a",
    });

    expect(mocks.generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.matchedTemplateId).toBe("template-a");
    expect(result.templateInfo?.templateId).toBe("template-a");
    expect(result.templateInfo?.renderedPromptSnapshot).toContain("模板 A：偏重 Vue 与前端工程化");
    expect(result.templateInfo?.renderedPromptSnapshot).not.toContain("模板 B：偏重低代码平台与中后台协作");
  });

  test("falls back to group default template when shortlist is empty", async () => {
    const templateA = buildTemplate({
      id: "template-a",
      name: "默认模板",
      prompt: "模板 A：默认技术模板。",
      matchHintsJson: JSON.stringify(["java"]),
      keywordsJson: JSON.stringify(["spring"]),
    });
    const templateB = buildTemplate({
      id: "template-b",
      name: "备选模板",
      prompt: "模板 B：备选模板。",
      matchHintsJson: JSON.stringify(["python"]),
      keywordsJson: JSON.stringify(["django"]),
    });

    mocks.getGroupMock.mockResolvedValue(buildGroupDetail([templateA, templateB], templateA.id));
    mocks.generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        verdict: "review",
        label: "待定",
        score: 68,
        summary: "使用组默认模板兜底。",
        strengths: ["基础经历完整"],
        concerns: ["缺少模板命中项"],
        recommendedAction: "建议人工复核。",
        wechatConclusion: "待定",
        wechatReason: "未命中模板关键词",
        wechatAction: "建议人工复核",
      }),
    });

    const result = await generateImportScreeningConclusionWithAI({
      ...buildInput(),
      parsed: {
        ...buildInput().parsed,
        rawText: "张三\n主要做前端交互和协作\n擅长界面设计与团队配合",
        skills: ["Figma", "沟通协作"],
      },
      groupId: "group-tech",
    });

    expect(mocks.generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.matchedTemplateId).toBe("template-a");
    expect(result.templateInfo?.templateId).toBe("template-a");
    expect(result.templateInfo?.renderedPromptSnapshot).toContain("模板 A：默认技术模板");
  });

  test("throws when AI chooser returns template outside shortlisted group candidates", async () => {
    const templateA = buildTemplate({
      id: "template-a",
      name: "前端模板",
      prompt: "模板 A：偏重 Vue 与前端工程化。",
      matchHintsJson: JSON.stringify(["vue", "前端"]),
      keywordsJson: JSON.stringify(["typescript"]),
    });
    const templateB = buildTemplate({
      id: "template-b",
      name: "低代码模板",
      prompt: "模板 B：偏重低代码平台与中后台协作。",
      matchHintsJson: JSON.stringify(["低代码", "中后台"]),
      keywordsJson: JSON.stringify(["vue"]),
    });

    mocks.getGroupMock.mockResolvedValue(buildGroupDetail([templateA, templateB], templateA.id));
    mocks.generateTextMock.mockResolvedValue({
      text: JSON.stringify({ templateId: "template-x", reason: "误选了不在 shortlist 的模板" }),
    });

    await expect(() => generateImportScreeningConclusionWithAI({
      ...buildInput(),
      parsed: {
        ...buildInput().parsed,
        rawText: "张三\n做过低代码平台和中后台系统\nVue\nTypeScript",
        workHistory: ["负责低代码平台搭建", "参与中后台系统协作"],
      },
      groupId: "group-tech",
    })).rejects.toThrow("AI template chooser returned invalid templateId: template-x");
  });

  test("throws when grouped screening has neither shortlist hit nor default template", async () => {
    const templateA = buildTemplate({
      id: "template-a",
      name: "Java 模板",
      prompt: "模板 A：偏重 Java。",
      matchHintsJson: JSON.stringify(["java"]),
      keywordsJson: JSON.stringify(["spring"]),
    });

    const groupDetail = buildGroupDetail([templateA], templateA.id);
    mocks.getGroupMock.mockResolvedValue({
      ...groupDetail,
      defaultTemplate: null,
      links: groupDetail.links.map((link) => ({ ...link, isDefault: false })),
    });

    await expect(() => generateImportScreeningConclusionWithAI({
      ...buildInput(),
      parsed: {
        ...buildInput().parsed,
        rawText: "张三\n主要做前端交互和协作",
        skills: ["Figma", "沟通协作"],
      },
      groupId: "group-tech",
    })).rejects.toThrow("No matched screening templates for group group-tech and no default template configured");
    expect(mocks.generateTextMock).not.toHaveBeenCalled();
  });
});
