import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { agents } from "../schema";

type AgentRow = typeof agents.$inferSelect;

export interface ConversationAgentResolution {
  requestedAgentId: string | null;
  resolvedAgentId: string | null;
  fallbackAgentId: string | null;
  fallbackAgentName: string | null;
  missing: boolean;
  message: string | null;
}

export const DEFAULT_INTERVIEW_AGENT_ID = "agent_builtin_interview";

const DEFAULT_INTERVIEW_AGENT = {
  id: DEFAULT_INTERVIEW_AGENT_ID,
  name: "Interview Agent",
  description: "内置面试智能体，负责统筹候选人初筛、提问、评估与纪要输出。",
  sourceType: "builtin" as const,
  isMutable: true,
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

const LEGACY_VALIDATION_AGENT_RULES = [
  {
    name: /^Resume Sync Validation Agent$/i,
    description: /validate automatic resume sync into s0/i,
  },
  {
    name: /^Workflow Resume Gate [a-f0-9]+$/i,
    description: /temporary workflow validation agent/i,
  },
] as const;

function isLegacyValidationAgent(row: AgentRow) {
  if (row.id === DEFAULT_INTERVIEW_AGENT_ID || isProtectedAgent(row)) {
    return false;
  }

  const name = row.name.trim();
  const description = (row.description ?? "").trim();

  if (row.sourceType !== "custom" || row.isMutable !== true) {
    return false;
  }

  return LEGACY_VALIDATION_AGENT_RULES.some((rule) => rule.name.test(name) && rule.description.test(description));
}

export function isProtectedAgent(row: AgentRow): boolean {
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

function resolveNormalizedDefaultAgentId(rows: AgentRow[]): string {
  const preferredCustomDefault = rows.find((row) => row.isDefault && !isProtectedAgent(row));
  if (preferredCustomDefault) {
    return preferredCustomDefault.id;
  }

  const existingDefault = rows.find((row) => row.isDefault);
  if (existingDefault) {
    return existingDefault.id;
  }

  return DEFAULT_INTERVIEW_AGENT_ID;
}

export function resolveConversationAgentResolution(
  requestedAgentId: string | null | undefined,
  rows: AgentRow[],
): ConversationAgentResolution {
  const normalizedRequestedId = requestedAgentId?.trim() || null;
  if (!normalizedRequestedId) {
    return {
      requestedAgentId: null,
      resolvedAgentId: null,
      fallbackAgentId: null,
      fallbackAgentName: null,
      missing: false,
      message: null,
    };
  }

  const matched = rows.find((row) => row.id === normalizedRequestedId);
  if (matched) {
    return {
      requestedAgentId: normalizedRequestedId,
      resolvedAgentId: matched.id,
      fallbackAgentId: null,
      fallbackAgentName: null,
      missing: false,
      message: null,
    };
  }

  const fallbackId = resolveNormalizedDefaultAgentId(rows);
  const fallback = rows.find((row) => row.id === fallbackId) ?? null;
  const fallbackName = fallback?.name ?? null;

  return {
    requestedAgentId: normalizedRequestedId,
    resolvedAgentId: fallback?.id ?? null,
    fallbackAgentId: fallback?.id ?? null,
    fallbackAgentName: fallbackName,
    missing: true,
    message: fallbackName
      ? `会话引用的智能体 ${normalizedRequestedId} 已不存在，已临时回退到 ${fallbackName}。`
      : `会话引用的智能体 ${normalizedRequestedId} 已不存在，请重新选择可用智能体。`,
  };
}

export async function setDefaultAgent(agentId: string, updatedAt = new Date()): Promise<void> {
  await db
    .update(agents)
    .set({
      isDefault: sql<boolean>`${agents.id} = ${agentId}`,
      updatedAt,
    })
    .where(sql`1 = 1`);
}

export async function deleteAgentWithFallback(row: AgentRow, updatedAt = new Date()): Promise<string> {
  if (isProtectedAgent(row)) {
    throw new Error("PROTECTED_AGENT");
  }

  await db.delete(agents).where(eq(agents.id, row.id));

  const fallbackDefaultId = row.isDefault ? DEFAULT_INTERVIEW_AGENT_ID : (await getCurrentDefaultAgentId()) ?? DEFAULT_INTERVIEW_AGENT_ID;
  await setDefaultAgent(fallbackDefaultId, updatedAt);

  return fallbackDefaultId;
}

async function getCurrentDefaultAgentId(): Promise<string | null> {
  const [currentDefault] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.isDefault, true))
    .limit(1);

  return currentDefault?.id ?? null;
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
        sourceType: DEFAULT_INTERVIEW_AGENT.sourceType,
        isMutable: DEFAULT_INTERVIEW_AGENT.isMutable,
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

  const normalizedRows = await db.select().from(agents);
  await setDefaultAgent(resolveNormalizedDefaultAgentId(normalizedRows), now);
}

export function isProtectedAgentId(agentId: string): boolean {
  return agentId === DEFAULT_INTERVIEW_AGENT_ID;
}
