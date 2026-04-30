import { eq } from "drizzle-orm";
import type {
  CreateMatchingTemplateInput,
  MatchingTemplate,
  UpdateMatchingTemplateInput,
} from "../../../shared/src/api-types";
import { db, rawDb } from "../db";
import { screeningTemplates } from "../schema";

type ScreeningTemplateRow = typeof screeningTemplates.$inferSelect;

type BuiltInMatchingTemplate = Omit<MatchingTemplate, "createdAt" | "updatedAt"> & {
  createdAt: number;
  updatedAt: number;
};

const BUILT_IN_SCREENING_TEMPLATES: BuiltInMatchingTemplate[] = [
  {
    id: "builtin:ai:screener:tech-engineer-v1",
    name: "技术研发初筛（技术深度版）",
    description: "偏重技术能力、工程经验与成长性，适用于研发岗位",
    prompt: `你是资深技术研发招聘官，请基于候选人简历与岗位语境评估是否进入下一步。

请重点核验：
1. 关键技术栈与项目落地能力（语言、框架、数据库、基础设施）
2. 问题定位与解决问题思路
3. 代码质量意识、工程化实践（测试、监控、CI、文档）
4. 学习速度和成长曲线（经历中的技术迁移、体系升级、产出升级）
5. 风险项（岗位变动频率、职责跳级幅度、硬伤）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦 2-4 行，体现岗位匹配
- 3）至少给出 2 条可复核优势与 1-2 条关键风险
- 4）结论建议需可执行，避免泛化措辞`,
    isDefault: true,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_001_000,
    updatedAt: 1_734_000_001_000,
  },
  {
    id: "builtin:ai:screener:product-v1",
    name: "产品运营筛选（商业化导向）",
    description: "偏重业务理解、需求闭环与数据运营能力",
    prompt: `你是产品/运营负责人，请基于候选人经历评估其是否符合商业化与增长导向岗位。

请重点核验：
1. 需求定义能力（用户、业务场景、目标拆解）
2. 产品方法论（PRD、优先级、埋点与迭代）
3. 数据洞察与实验思维（A/B、漏斗、归因）
4. 跨团队协同能力（技术/设计/销售沟通）
5. 风险项（过度乐观、证据不足、结果复用能力弱）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦商业价值与执行能力
- 3）列出优势 2-4 条、风险 1-2 条
- 4）给出下一步建议与试用验证点`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_002_000,
    updatedAt: 1_734_000_002_000,
  },
  {
    id: "builtin:ai:screener:design-v1",
    name: "设计岗位筛选（交付与协作）",
    description: "偏重视觉/交互设计的表达、方法和协作交付能力",
    prompt: `你是招聘设计岗专家，请基于候选人简历判断其是否适配设计类岗位。

请重点核验：
1. 设计方法与产物完整性（研究、结构、原型、交付）
2. 视觉/交互严谨性与设计语言一致性
3. 需求理解与问题定义能力
4. 与产品研发协作与推进效率
5. 风险项（作品链条断裂、仅有概念但缺落地案例）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦可交付性与协作能力
- 3）明确列出优势与风险，避免主观臆断
- 4）提出建议动作与复核问题`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_003_000,
    updatedAt: 1_734_000_003_000,
  },
  {
    id: "builtin:ai:screener:ops-sales-marketing-v1",
    name: "运营/销售/市场筛选（增长复盘）",
    description: "偏重目标达成、获客效率、客户沟通与复购能力",
    prompt: `你是运营/市场/销售招聘官，请基于候选人经历评估岗位匹配度。

请重点核验：
1. 目标和漏斗指标成果（MQL、转化、客单价、复购等）
2. 渠道设计与落地执行（活动、投放、内容、销售周期）
3. 客户沟通与异议处理能力
4. 商业结果证明（案例、数据指标、可复核产出）
5. 风险项（数据口径不清、缺少复盘能力、仅有经验无结果）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦目标贡献与执行韧性
- 3）列出优势与风险项
- 4）给出下一步面谈验证清单`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_004_000,
    updatedAt: 1_734_000_004_000,
  },
  {
    id: "builtin:ai:screener:hr-admin-v1",
    name: "人力/行政筛选（流程与合规）",
    description: "偏重组织协同、流程执行与风控意识",
    prompt: `你是人力与行政岗位筛选官，请评估候选人是否适配该类支撑与规范导向岗位。

请重点核验：
1. 组织协作和沟通透明度
2. 流程设计与执行能力（制度、流程、台账）
3. 风险识别与合规意识（合规要求、隐私、边界）
4. 问题处理与服务意识
5. 风险项（执行碎片化、边界意识不足、责任闭环缺失）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦是否能长期稳定支撑业务
- 3）明确优势与风险
- 4）输出结论与建议动作`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_005_000,
    updatedAt: 1_734_000_005_000,
  },
  {
    id: "builtin:ai:screener:finance-legal-v1",
    name: "财务/法务筛选（审慎与合规）",
    description: "偏重内控、合规、财务核算与风险识别能力",
    prompt: `你是财务/法务招聘官，请基于候选人简历评估其对岗位的匹配程度。

请重点核验：
1. 行业相关专业能力与项目经历
2. 风控意识和证据意识（流程、审计、合规）
3. 数据严谨性（指标定义、证据链、核对逻辑）
4. 沟通协作与沟通对象边界（业务线、法务、审计）
5. 风险项（结果偏主观、边界理解不足、合规实践经验薄弱）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦可控性与复核效率
- 3）列出优势与风险
- 4）给出建议复核点`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_006_000,
    updatedAt: 1_734_000_006_000,
  },
  {
    id: "builtin:ai:screener:education-health-v1",
    name: "教育/医疗筛选（服务与责任）",
    description: "偏重服务质量、标准流程与风险沟通能力",
    prompt: `你是教育/医疗相关岗位筛选官，请基于候选人经历评估其是否匹配岗位责任。

请重点核验：
1. 业务场景理解与案例能力（教育/医疗真实场景）
2. 风险与合规意识（安全、隐私、流程）
3. 沟通解释与异议处理能力
4. 持续服务、跟进和复盘习惯
5. 风险项（经验断层、责任边界模糊、应对机制薄弱）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦服务稳定性与责任意识
- 3）列出优势与风险
- 4）给出下一步验证建议`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_007_000,
    updatedAt: 1_734_000_007_000,
  },
  {
    id: "builtin:ai:screener:manufacturing-supply-v1",
    name: "制造/供应链筛选（执行与风险）",
    description: "偏重流程落地、供应稳定性与成本风险控制能力",
    prompt: `你是制造/供应链岗位筛选官，请基于候选人履历评估其岗位匹配度。

请重点核验：
1. 供应链/制造流程理解（计划、采购、交付、质量）
2. 数据与异常处理能力（库存、在途、延误）
3. 风险预案与应急处置经验
4. 跨部门协同与执行节奏
5. 风险项（仅停留宏观经验、复盘机制薄弱）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦可执行性与稳定性
- 3）列出优势与风险
- 4）给出建议复核动作`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_008_000,
    updatedAt: 1_734_000_008_000,
  },
  {
    id: "builtin:ai:screener:sales-v1",
    name: "销售/市场筛选（客户拓展与成交）",
    description: "偏重客户拓展、商机挖掘、谈判成交与业绩达成能力",
    prompt: `你是销售与市场招聘官，请基于候选人经历评估其对销售拓展类岗位的匹配度。

请重点核验：
1. 客户开发与渠道建设能力（获客路径、成功率、客户梯队）
2. 商机挖掘与需求理解能力（痛点挖掘、方案匹配）
3. 谈判与成交能力（关单技巧、异议处理、决策链突破）
4. 业绩达成证明（MQL、转化率、GMV、回款等可量化指标）
5. 风险项（依赖平台或资源、个人客户沉淀不足、结果归因模糊）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦客户拓展能力与业绩兑现度
- 3）列出优势与风险项
- 4）给出面试验证清单`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_009_000,
    updatedAt: 1_734_000_009_000,
  },
  {
    id: "builtin:ai:screener:general-affairs-v1",
    name: "职能/综合管理筛选（规范与支撑）",
    description: "偏重制度流程、规范支撑与跨部门协调能力",
    prompt: `你是职能与综合管理岗位筛选官，请基于候选人经历评估其对支撑类岗位的匹配度。

请重点核验：
1. 制度流程建设与执行能力（体系搭建、落地跟踪）
2. 跨部门协调与资源整合能力
3. 预算管理、成本控制与合规意识
4. 战略支撑与业务赋能意识
5. 风险项（仅执行无规划、缺乏业务视角、沟通边界模糊）

输出要求：
- 1）给出通过/待定/淘汰
- 2）摘要聚焦制度化思维与支撑意识
- 3）列出优势与风险
- 4）给出建议验证方向`,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_010_000,
    updatedAt: 1_734_000_010_000,
  },
];

const BUILT_IN_SCREENING_TEMPLATE_MAP = new Map(
  BUILT_IN_SCREENING_TEMPLATES.map((template) => [template.id, template]),
);

function sortCustomTemplates(a: MatchingTemplate, b: MatchingTemplate): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }

  if (a.name !== b.name) {
    return a.name.localeCompare(b.name, "zh-CN");
  }

  return a.id.localeCompare(b.id);
}

function toMatchingTemplate(row: ScreeningTemplateRow): MatchingTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    isDefault: row.isDefault,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getActiveDbDefaultTemplate(): Promise<MatchingTemplate | null> {
  const [row] = await db
    .select()
    .from(screeningTemplates)
    .where(eq(screeningTemplates.isDefault, true))
    .limit(1);

  return row ? toMatchingTemplate(row) : null;
}

async function listTemplateRows(): Promise<MatchingTemplate[]> {
  const rows = await db.select().from(screeningTemplates);
  return rows
    .map(toMatchingTemplate)
    .filter((template) => template.isActive)
    .filter((template) => !BUILT_IN_SCREENING_TEMPLATE_MAP.has(template.id))
    .sort(sortCustomTemplates);
}

function getBuiltInTemplates(hasDbDefaultTemplate: boolean): MatchingTemplate[] {
  return BUILT_IN_SCREENING_TEMPLATES.map((template) => ({
    ...template,
    isDefault: hasDbDefaultTemplate ? false : template.isDefault,
  }));
}

export class ScreeningTemplatesService {
  async listTemplates(): Promise<MatchingTemplate[]> {
    const hasDbDefaultTemplate = Boolean(await getActiveDbDefaultTemplate());
    const templates = await listTemplateRows();

    const builtInTemplates = getBuiltInTemplates(hasDbDefaultTemplate);

    return [...builtInTemplates, ...templates];
  }

  async getTemplate(id: string): Promise<MatchingTemplate | null> {
    const builtInTemplate = BUILT_IN_SCREENING_TEMPLATE_MAP.get(id);
    if (builtInTemplate) {
      const dbDefaultTemplate = await getActiveDbDefaultTemplate();
      return {
        ...builtInTemplate,
        isDefault: dbDefaultTemplate ? false : builtInTemplate.isDefault,
      };
    }

    const [row] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .limit(1);

    return row ? toMatchingTemplate(row) : null;
  }

  async createTemplate(
    input: CreateMatchingTemplateInput,
  ): Promise<MatchingTemplate> {
    const now = Date.now();

    if (input.isDefault) {
      await db
        .update(screeningTemplates)
        .set({ isDefault: false, updatedAt: now });
    }

    const isDefault = input.isDefault ?? false;

    const [row] = await db
      .insert(screeningTemplates)
      .values({
        id: `scrntpl_${crypto.randomUUID()}`,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        prompt: input.prompt,
        isDefault,
        isActive: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return toMatchingTemplate(row);
  }

  async updateTemplate(
    id: string,
    input: UpdateMatchingTemplateInput,
  ): Promise<MatchingTemplate | null> {
    const [existingRow] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .limit(1);

    if (!existingRow) return null;

    const now = Date.now();

    if (input.isDefault) {
      await db
        .update(screeningTemplates)
        .set({ isDefault: false, updatedAt: now });
    }

    const setData: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) setData.name = input.name.trim();
    if (input.description !== undefined)
      setData.description = input.description.trim() || null;
    if (input.prompt !== undefined) setData.prompt = input.prompt;
    if (input.isDefault !== undefined) setData.isDefault = input.isDefault;

    const [row] = await db
      .update(screeningTemplates)
      .set(setData)
      .where(eq(screeningTemplates.id, id))
      .returning();

    return row ? toMatchingTemplate(row) : null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const [deleted] = await db
      .delete(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .returning();

    return Boolean(deleted);
  }

  async setDefaultTemplate(id: string): Promise<MatchingTemplate | null> {
    const [existing] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.id, id))
      .limit(1);

    if (!existing) return null;

    const now = Date.now();

    // Use transaction: first unset all defaults, then set the target as default
    try {
      rawDb.run("BEGIN IMMEDIATE");
      await db
        .update(screeningTemplates)
        .set({ isDefault: false, updatedAt: now });
      const [row] = await db
        .update(screeningTemplates)
        .set({ isDefault: true, updatedAt: now })
        .where(eq(screeningTemplates.id, id))
        .returning();

      rawDb.run("COMMIT");
      return row ? toMatchingTemplate(row) : null;
    } catch (error) {
      rawDb.run("ROLLBACK");
      throw error;
    }
  }

  async getDefaultTemplate(): Promise<MatchingTemplate | null> {
    const [row] = await db
      .select()
      .from(screeningTemplates)
      .where(eq(screeningTemplates.isDefault, true))
      .limit(1);

    if (row) {
      return toMatchingTemplate(row);
    }

    const builtInDefault = getBuiltInTemplates(false).find((template) => template.isDefault);
    return builtInDefault ?? null;
  }
}

export const screeningTemplatesService = new ScreeningTemplatesService();