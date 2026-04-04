import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { agents } from "../schema";

export const DEFAULT_INTERVIEW_AGENT_ID = "agent_builtin_interview";

const DEFAULT_INTERVIEW_AGENT = {
  id: DEFAULT_INTERVIEW_AGENT_ID,
  name: "Interview Agent",
  description: "内置面试智能体，负责统筹候选人初筛、提问、评估与纪要输出。",
  sourceType: "builtin" as const,
  isMutable: false,
  sceneAffinity: "interview" as const,
  engine: "builtin" as const,
  mode: "workflow" as const,
  temperature: 0,
  systemPrompt: [
    "你是 Interview Manager 的内置面试智能体。",
    "你的职责是围绕候选人面试流程开展工作，包括：简历初筛、面试问题生成、面试纪要整理、综合评估与结果建议。",
    "优先基于候选人上下文、工作流阶段与现有文档输出结论；信息不足时明确指出缺失项。",
    "输出保持专业、简洁、可执行，不要暴露底层运行实现。",
  ].join("\n"),
  tools: [
    "ensureWorkspace",
    "resolveRound",
    "scanPdf",
    "sanitizeInterviewNotes",
    "batchScreenResumes",
    "writeMarkdown",
    "buildWechatCopyText",
  ],
};

const LEGACY_AGENT_NAME_PATTERNS = [
  /^Resume Sync Validation Agent$/i,
  /^Workflow Resume Gate [a-f0-9]+$/i,
];

const LEGACY_AGENT_DESCRIPTION_PATTERNS = [
  /validate automatic resume sync into s0/i,
  /temporary workflow validation agent/i,
];

function isLegacyValidationAgent(row: typeof agents.$inferSelect) {
  if (row.id === DEFAULT_INTERVIEW_AGENT_ID) {
    return false;
  }

  const name = row.name.trim();
  const description = (row.description ?? "").trim();

  return LEGACY_AGENT_NAME_PATTERNS.some((pattern) => pattern.test(name))
    || LEGACY_AGENT_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description));
}

export function isProtectedAgent(row: typeof agents.$inferSelect): boolean {
  return row.sourceType === "builtin" || row.isMutable === false || row.id === DEFAULT_INTERVIEW_AGENT_ID;
}

export function serializeAgent(row: typeof agents.$inferSelect) {
  const tools = parseAgentTools(row.toolsJson);

  return {
    id: row.id,
    agentId: row.id,
    name: row.name,
    displayName: row.name,
    description: row.description,
    sourceType: row.sourceType,
    isBuiltin: row.sourceType === "builtin",
    isMutable: row.isMutable,
    sceneAffinity: row.sceneAffinity,
    engine: row.engine,
    mode: row.mode,
    temperature: row.temperature,
    systemPrompt: row.systemPrompt,
    tools,
    isDefault: row.isDefault,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function parseAgentTools(toolsJson: string | null | undefined): string[] {
  if (!toolsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(toolsJson);
    return Array.isArray(parsed) ? parsed.filter((tool): tool is string => typeof tool === "string") : [];
  } catch {
    return [];
  }
}

export async function ensureManagedAgents(): Promise<void> {
  const existingRows = await db.select().from(agents);

  const legacyIds = existingRows
    .filter(isLegacyValidationAgent)
    .map((row) => row.id);

  if (legacyIds.length > 0) {
    await db.delete(agents).where(inArray(agents.id, legacyIds));
  }

  const [interviewAgent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, DEFAULT_INTERVIEW_AGENT_ID))
    .limit(1);

  const now = new Date();
  const toolsJson = JSON.stringify(DEFAULT_INTERVIEW_AGENT.tools);

  if (!interviewAgent) {
    await db.insert(agents).values({
      id: DEFAULT_INTERVIEW_AGENT.id,
      name: DEFAULT_INTERVIEW_AGENT.name,
      description: DEFAULT_INTERVIEW_AGENT.description,
      sourceType: DEFAULT_INTERVIEW_AGENT.sourceType,
      isMutable: DEFAULT_INTERVIEW_AGENT.isMutable,
      sceneAffinity: DEFAULT_INTERVIEW_AGENT.sceneAffinity,
      engine: DEFAULT_INTERVIEW_AGENT.engine,
      mode: DEFAULT_INTERVIEW_AGENT.mode,
      temperature: DEFAULT_INTERVIEW_AGENT.temperature,
      systemPrompt: DEFAULT_INTERVIEW_AGENT.systemPrompt,
      toolsJson,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(agents)
      .set({
        name: DEFAULT_INTERVIEW_AGENT.name,
        description: DEFAULT_INTERVIEW_AGENT.description,
        sourceType: DEFAULT_INTERVIEW_AGENT.sourceType,
        isMutable: DEFAULT_INTERVIEW_AGENT.isMutable,
        sceneAffinity: DEFAULT_INTERVIEW_AGENT.sceneAffinity,
        engine: DEFAULT_INTERVIEW_AGENT.engine,
        mode: DEFAULT_INTERVIEW_AGENT.mode,
        systemPrompt: DEFAULT_INTERVIEW_AGENT.systemPrompt,
        toolsJson,
        updatedAt: now,
      })
      .where(eq(agents.id, DEFAULT_INTERVIEW_AGENT_ID));
  }

  await db
    .update(agents)
    .set({ sourceType: "custom", isMutable: true, sceneAffinity: "general", updatedAt: now })
    .where(and(
      sql`${agents.id} != ${DEFAULT_INTERVIEW_AGENT_ID}`,
      sql`(${agents.sourceType} is null or ${agents.sourceType} = '' or ${agents.isMutable} is null or ${agents.sceneAffinity} is null or ${agents.sceneAffinity} = '')`,
    ));

  await db
    .update(agents)
    .set({ isDefault: false, updatedAt: now })
    .where(and(sql`${agents.id} != ${DEFAULT_INTERVIEW_AGENT_ID}`, eq(agents.isDefault, true)));

  await db
    .update(agents)
    .set({ isDefault: true, updatedAt: now })
    .where(eq(agents.id, DEFAULT_INTERVIEW_AGENT_ID));
}

export function isProtectedAgentId(agentId: string): boolean {
  return agentId === DEFAULT_INTERVIEW_AGENT_ID;
}
