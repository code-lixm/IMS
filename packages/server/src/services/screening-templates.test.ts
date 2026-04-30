import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MatchingTemplate } from "../../../shared/src/api-types";
import { screeningTemplatesService } from "./screening-templates";

type ScreeningTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
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
    const dbDefault = buildCustom({
      id: "scrntpl_db_default_2",
      name: "数据库默认模板",
      prompt: "db default template",
      isDefault: true,
      createdAt: 111,
    });

    const customTemplate = buildCustom({
      id: "scrntpl_custom_detail",
      name: "自定义详情模板",
      description: "用于详情测试",
      prompt: "请基于教育经历判断匹配度。",
      version: 4,
      isDefault: true,
      createdAt: 150,
    });

    enqueueSelectRows([[customTemplate], [dbDefault]]);

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
});
