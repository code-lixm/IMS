import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MatchingTemplate as BaseMatchingTemplate } from "../../../shared/src/api-types";
import { screeningTemplatesService, shortlistScreeningTemplatesByResume } from "./screening-templates";

type MatchingTemplate = BaseMatchingTemplate & {
  sourceType: string;
  isReadonly: boolean;
  matchHintsJson: string | null;
  keywordsJson: string | null;
};

type ScreeningTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  sourceType: string;
  isReadonly: boolean;
  matchHintsJson: string | null;
  keywordsJson: string | null;
  isDefault: boolean;
  isActive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
};

type QueryChain = {
  where: () => {
    limit: (limit: number) => Promise<ScreeningTemplateRow[]>;
  };
  then: <TResult1 = ScreeningTemplateRow[], TResult2 = never>(
    onFulfilled?: ((value: ScreeningTemplateRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<
    TResult1 | TResult2
  >;
};

const BUILTIN_TEMPLATE_IDS = [
  "builtin:ai:screener:tech-engineer-v1",
  "builtin:ai:screener:product-v1",
  "builtin:ai:screener:design-v1",
  "builtin:ai:screener:ops-sales-marketing-v1",
  "builtin:ai:screener:hr-admin-v1",
  "builtin:ai:screener:finance-legal-v1",
  "builtin:ai:screener:education-health-v1",
  "builtin:ai:screener:manufacturing-supply-v1",
  "builtin:ai:screener:sales-v1",
  "builtin:ai:screener:general-affairs-v1",
];

function createThenableQuery(rows: ScreeningTemplateRow[]): QueryChain {
  return {
    where: () => ({
      limit: async (limit: number) => rows.slice(0, limit),
    }),
    then: (onFulfilled, onRejected) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

const selectRows: ScreeningTemplateRow[][] = [];

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const rows = selectRows.shift() ?? [];
        return createThenableQuery(rows);
      }),
    })),
  },
  rawDb: {
    run: vi.fn(),
  },
}));

function enqueueSelectRows(rows: ScreeningTemplateRow[][]) {
  selectRows.splice(0, selectRows.length, ...rows);
}

const buildCustom = (overrides: Partial<MatchingTemplate>): ScreeningTemplateRow => ({
  id: overrides.id ?? "scrntpl_custom_1",
  name: overrides.name ?? "自定义模板 A",
  description: overrides.description ?? "用于测试的自定义模板",
  prompt: overrides.prompt ?? "你是招聘官",
  sourceType: overrides.sourceType ?? "custom",
  isReadonly: overrides.isReadonly ?? false,
  matchHintsJson: overrides.matchHintsJson ?? null,
  keywordsJson: overrides.keywordsJson ?? null,
  isDefault: overrides.isDefault ?? false,
  isActive: overrides.isActive ?? true,
  version: overrides.version ?? 1,
  createdAt: overrides.createdAt ?? 1_734_000_005_000,
  updatedAt: overrides.updatedAt ?? 1_734_000_005_000,
});

describe("screening-templates service", () => {
  beforeEach(() => {
    enqueueSelectRows([]);
  });

  test("lists built-in templates first in deterministic order, then custom templates sorted deterministically", async () => {
    const defaultRow = buildCustom({
      id: "scrntpl_db_default",
      name: "数据库默认模板",
      prompt: "db default",
      isDefault: true,
      createdAt: 200,
    });

    const customRows = [
      buildCustom({
        id: "scrntpl_custom_late",
        name: "晚到",
        createdAt: 3,
      }),
      buildCustom({
        id: "builtin:ai:screener:product-v1",
        name: "内置覆盖", // should be filtered out if id collision
        createdAt: 1,
      }),
      buildCustom({
        id: "scrntpl_custom_early_1",
        name: "A早到",
        createdAt: 1,
      }),
      buildCustom({
        id: "scrntpl_custom_early_2",
        name: "B后到",
        createdAt: 1,
      }),
    ];

    enqueueSelectRows([[defaultRow], customRows]);

    const templates = await screeningTemplatesService.listTemplates();

    const builtIn = templates.slice(0, BUILTIN_TEMPLATE_IDS.length);
    expect(builtIn.map((item) => item.id)).toEqual(BUILTIN_TEMPLATE_IDS);
    expect(builtIn.filter((item) => item.isDefault).map((item) => item.id)).toEqual([]);

    const custom = templates.slice(BUILTIN_TEMPLATE_IDS.length);
    expect(custom.map((item) => item.id)).toEqual([
      "scrntpl_custom_early_1",
      "scrntpl_custom_early_2",
      "scrntpl_custom_late",
    ]);
    expect(custom).toHaveLength(3);
    expect(templates.filter((item) => item.id.startsWith("builtin:ai:screener")).length).toBe(10);
    expect(templates.length).toBe(13);
  });

  test("default template is built-in when db has no active default and preserves default route fallback", async () => {
    enqueueSelectRows([[], []]);

    const templates = await screeningTemplatesService.listTemplates();
    const defaultTemplate = templates.find((template) => template.isDefault);

    expect(defaultTemplate).toBeTruthy();
    expect(defaultTemplate?.id).toBe("builtin:ai:screener:tech-engineer-v1");
    expect(defaultTemplate?.version).toBe(1);

    const fallbackDefault = await screeningTemplatesService.getDefaultTemplate();
    expect(fallbackDefault?.id).toBe("builtin:ai:screener:tech-engineer-v1");
    expect(fallbackDefault).toMatchObject({
      id: "builtin:ai:screener:tech-engineer-v1",
      name: "技术研发初筛（技术深度版）",
      version: 1,
    });
  });

  test("getTemplate returns custom template and keeps builtin template default flag disabled when DB has default", async () => {
    const customTemplate = buildCustom({
      id: "scrntpl_custom_detail",
      name: "自定义详情模板",
      description: "用于详情测试",
      prompt: "请基于教育经历判断匹配度。",
      version: 4,
      isDefault: true,
      createdAt: 150,
    });

    const builtinTemplate = buildCustom({
      id: "builtin:ai:screener:hr-admin-v1",
      name: "人力/行政筛选（流程与合规）",
      description: "偏重组织协同、流程执行与风控意识",
      prompt: "你是人力与行政岗位筛选官，请评估候选人是否适配该类支撑与规范导向岗位。",
      sourceType: "builtin",
      isReadonly: true,
      isDefault: false,
      createdAt: 160,
    });

    enqueueSelectRows([[customTemplate], [builtinTemplate]]);

    const custom = await screeningTemplatesService.getTemplate(customTemplate.id);
    expect(custom).toEqual(expect.objectContaining({
      id: customTemplate.id,
      name: customTemplate.name,
      description: customTemplate.description,
      prompt: customTemplate.prompt,
      isDefault: customTemplate.isDefault,
    }));

    const builtin = await screeningTemplatesService.getTemplate("builtin:ai:screener:hr-admin-v1");
    expect(builtin).toEqual(
      expect.objectContaining({
        id: "builtin:ai:screener:hr-admin-v1",
        isDefault: false,
        version: 1,
      }),
    );
  });

  test("shortlistScreeningTemplatesByResume only returns templates matched by hints or keywords", () => {
    const shortlist = shortlistScreeningTemplatesByResume(
      [
        buildCustom({
          id: "template-tech",
          name: "技术模板",
          matchHintsJson: JSON.stringify(["vue", "前端"]),
          keywordsJson: JSON.stringify(["typescript"]),
        }),
        buildCustom({
          id: "template-sales",
          name: "销售模板",
          matchHintsJson: JSON.stringify(["客户", "成交"]),
          keywordsJson: JSON.stringify(["gmv"]),
        }),
      ],
      {
        position: "前端工程师",
        skills: ["Vue", "TypeScript"],
        workHistory: ["负责前端开发与组件封装"],
        rawText: "参与 Vue 项目开发并维护 TypeScript 工程",
      },
    );

    expect(shortlist.map((item) => item.template.id)).toEqual(["template-tech"]);
    expect(shortlist[0]?.matchedHints).toEqual(["前端", "vue"]);
    expect(shortlist[0]?.matchedKeywords).toEqual(["typescript"]);
  });

  test("shortlistScreeningTemplatesByResume tolerates nested json and invalid matcher json", () => {
    const shortlist = shortlistScreeningTemplatesByResume(
      [
        buildCustom({
          id: "template-nested",
          matchHintsJson: JSON.stringify({ primary: ["中后台", "低代码"] }),
          keywordsJson: JSON.stringify({ skills: ["vue"] }),
        }),
        buildCustom({
          id: "template-invalid",
          matchHintsJson: "{bad json",
          keywordsJson: null,
        }),
      ],
      {
        skills: ["Vue"],
        workHistory: ["负责低代码平台和中后台系统"],
      },
    );

    expect(shortlist.map((item) => item.template.id)).toEqual(["template-nested"]);
    expect(shortlist[0]?.matchedTerms).toEqual(["低代码", "中后台", "vue"]);
  });
});
