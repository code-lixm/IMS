import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  APPLICATION_STATUS_LABELS,
  ErrorCodes,
  formatInterviewRoundLabel,
  INTERVIEW_TYPE_LABELS,
  lookupLabelOrDefault,
  resolveApplicationStatusCode,
  type ImportTaskResultData,
  type ImportScreeningExportRequest,
} from "@ims/shared";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { syncManager } from "./services/sync-manager";
import { resetCandidateRecords } from "./services/sync-reset";
import { cancelImportBatch, prepareImportTasks, processFile, refreshBatchProgress, rerunImportBatchScreening, rerunFileScreening, exportScreeningResults, ImportScreeningExportError, ImportValidationError, startRerunImportBatchScreening } from "./services/import/pipeline";
import { exportCandidate } from "./services/imr/exporter";
import { importIpmr } from "./services/imr/importer";
import { getDiscovery } from "./services/share/discovery";
import { sendToDevice } from "./services/share/transfer";
import { BaobaoClient, setBaobaoClient, getBaobaoClient } from "./services/baobao-client";
import { clearBaobaoLoginSession, fetchBaobaoLoginQrCode, getBaobaoLoginSessionStatus } from "./services/baobao-login";
import { config } from "./config";
import { db, rawDb } from "./db";
import { corsHeaders, ok, fail } from "./utils/http";
import {
  users, candidates, resumes, interviews, artifacts, artifactVersions,
  candidateWorkspaces, importBatches, importFileTasks, shareRecords, notifications,
  remoteUsers, conversations, messages, fileResources, agents, providerCredentials,
  luiWorkflows,
} from "./schema";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildCandidateContext, formatCandidateContextForPrompt } from "./services/lui-context";
import {
  getOrCreateWorkflow,
  getWorkflow,
  getWorkflowByCandidate,
  getAvailableNextStages,
  updateWorkflow,
  advanceStage,
  resetWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  completeWorkflow,
  confirmWorkflowRound,
  listCandidateWorkflows,
  executeAgent,
  executeWorkflowAgent,
  toWorkflowView,
  WorkflowStage,
} from "./services/lui-workflow";
import { executeDeepAgent } from "./services/deepagents-runtime";
import { DEFAULT_INTERVIEW_AGENT_ID, deleteAgentWithFallback, ensureManagedAgents, getResolvedAgent, getResolvedAgentExecutionConfig, isProtectedAgent, listResolvedAgents, resolveConversationAgentResolution, serializeAgent, setDefaultAgent } from "./services/lui-agents";
import { buildAgentContractPromptSegment, guardAgentUserMessage, resolveAgentContract } from "./services/lui-agent-contract";
import { getWorkflowTools, TOOL_NAMES, type ToolContext } from "./services/lui-tools";
import { ensureCandidateResumeAvailable, syncCandidateResumesToConversation } from "./services/baobao-resume";
import { messageService, serializeMessageData } from "./services/message";
import { MODELS_DEV_LOCAL_DATA_BACKUP, MODELS_DEV_LOCAL_DATA_PRIMARY } from "./data/models-dev-local-data";
import { messagesRoute } from "./routes/messages";
import { memoryRoute } from "./routes/memory";
import { sessionMemoryRoute } from "./routes/session-memory";
import { fileResourcesRoute } from "./routes/file-resources";
import { emailRoute } from "./routes/email";
import { interviewAssessmentRoute } from "./routes/interview-assessment";

const DEBUG_BAOBAO = process.env.IMS_DEBUG_BAOBAO === "1";

function normalizeOpenAIBaseURL(baseURL: string | null | undefined): string {
  const trimmed = baseURL?.trim();
  if (!trimmed) {
    return DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  }
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  const withoutOperationPath = withoutTrailingSlash.replace(/\/(models|chat\/completions|responses|embeddings)$/i, "");
  if (/\/v\d+$/i.test(withoutOperationPath)) {
    return withoutOperationPath;
  }
  return `${withoutOperationPath}/v1`;
}

function logBaobaoAuth(stage: string, details?: Record<string, unknown>, important = false) {
  if (!important && !DEBUG_BAOBAO) return;
  console.log("[baobao-auth]", stage, details ?? {});
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error("[FileStorage] Failed to create directory:", dirPath, error);
  }
}

async function saveImportUploadToLocal(batchId: string, file: File): Promise<string> {
  const dirPath = join(config.dataDir, "import-uploads", batchId);
  await ensureDir(dirPath);

  const sanitizedName = file.name.replace(/[\\/]/g, "_");
  const filePath = join(dirPath, sanitizedName);
  const buffer = new Uint8Array(await file.arrayBuffer());
  await writeFile(filePath, buffer);
  return filePath;
}

function resolveResumeContentType(fileType: string | null | undefined, fileName: string | null | undefined): string | null {
  const normalizedType = fileType?.trim().toLowerCase() ?? "";
  const normalizedName = fileName?.trim().toLowerCase() ?? "";

  if (normalizedType === "pdf" || normalizedName.endsWith(".pdf")) return "application/pdf";
  if (normalizedType === "png" || normalizedName.endsWith(".png")) return "image/png";
  if (["jpg", "jpeg"].includes(normalizedType) || normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalizedType === "webp" || normalizedName.endsWith(".webp")) return "image/webp";

  return null;
}

function decodeStoredFileName(fileName: string | null | undefined): string {
  const normalized = fileName?.trim() || "resume";
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function parseStoredImportTaskResult(resultJson: string | null | undefined): ImportTaskResultData | null {
  if (!resultJson) return null;

  try {
    const parsed = JSON.parse(resultJson) as ImportTaskResultData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeImportBatchAnalysis(
  batch: typeof importBatches.$inferSelect,
  tasks: Array<typeof importFileTasks.$inferSelect>,
) {
  let analysisCompletedFiles = 0;
  let analysisRunningFiles = 0;

  for (const task of tasks) {
    const result = parseStoredImportTaskResult(task.resultJson);

    if (result?.screeningStatus === "completed") {
      analysisCompletedFiles += 1;
      continue;
    }

    if (result?.screeningStatus === "running") {
      analysisRunningFiles += 1;
      continue;
    }

  }

  const analysisTotalFiles = Math.max(batch.totalFiles ?? tasks.length, 0);
  const analysisPendingFiles = Math.max(
    analysisTotalFiles - analysisCompletedFiles - analysisRunningFiles,
    0,
  );

  return {
    analysisTotalFiles,
    analysisCompletedFiles,
    analysisPendingFiles,
    analysisRunningFiles,
  };
}

function attachImportBatchAnalysisSummary(
  batches: Array<typeof importBatches.$inferSelect>,
  tasks: Array<typeof importFileTasks.$inferSelect>,
) {
  const taskMap = new Map<string, Array<typeof importFileTasks.$inferSelect>>();
  for (const task of tasks) {
    const list = taskMap.get(task.batchId) ?? [];
    list.push(task);
    taskMap.set(task.batchId, list);
  }

  return batches.map((batch) => ({
    ...batch,
    autoScreen: batch.autoScreen ?? false,
    ...summarizeImportBatchAnalysis(batch, taskMap.get(batch.id) ?? []),
  }));
}

function createStaticLuiStreamResponse(content: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const events = [
        { type: "start" },
        { type: "start-step" },
        { type: "text-start", id: "0" },
        { type: "text-delta", id: "0", delta: content },
        { type: "text-end", id: "0" },
        { type: "finish-step" },
        { type: "finish", finishReason: "stop" },
      ];

      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function createCompletedAssistantReply(conversationId: string, content: string): Promise<void> {
  const assistantMessage = await messageService.createMessage({
    conversationId,
    role: "assistant",
    content: "",
  });
  await messageService.completeMessage(assistantMessage.id, content);
}

function buildWorkflowConfirmationReceipt(input: {
  type: "round" | "advance" | "complete";
  previousStage?: string;
  currentStage?: string;
  round?: number;
}): string {
  if (input.type === "round") {
    return `已确认：当前为${formatInterviewRoundLabel(input.round ?? null)}。请继续补充本轮考察重点，或让我直接生成这一轮的面试题。`;
  }

  if (input.type === "complete") {
    return "已确认：当前流程已完成。你可以继续追问评估细节，或开始处理下一位候选人。";
  }

  if (input.previousStage === "S1" && input.currentStage === "S2") {
    return [
      "已确认：进入评估阶段。",
      "请提供面试纪要或候选人回答记录（文本或文件均可），格式不限，我会基于纪要生成评分报告并给出下一步建议。",
    ].join("\n");
  }

  if (input.previousStage === "S2" && input.currentStage === "S1") {
    return "已确认：回到出题阶段，准备下一轮角色面试题。请继续选择轮次，或直接生成下一轮题目。";
  }

  return `已确认：流程已从 ${input.previousStage} 推进到 ${input.currentStage}。接下来我会按照当前阶段继续协助你。`;
}

function buildWorkflowConfirmationGuidance(workflow: {
  currentStage: string;
}): string {
  if (workflow.currentStage === "S1") {
    return "当前还缺少面试轮次确认。请直接点击下方按钮，选择要生成的技术专家 / 主管 / 总监 / HR 面试。\n\n<!-- workflow-action:confirm-round -->";
  }

  if (workflow.currentStage === "S2") {
    return "当前处于评估阶段，请先提供面试纪要或候选人回答记录（文本或文件均可），格式不限。";
  }

  return "当前还需要你先确认是否进入下一阶段。请先使用下方确认操作，再继续发送新的要求。\n\n<!-- workflow-action:advance-stage -->";
}

function detectRoundConfirmation(content: string): number | null {
  const explicitMatch = content.match(/(?:第\s*([1-4])\s*轮|round\s*([1-4])|^\s*([1-4])\s*$)/i);
  if (explicitMatch) {
    return Number(explicitMatch[1] ?? explicitMatch[2] ?? explicitMatch[3]);
  }

  const previousRoundMatch = content.match(/(?:上一轮|上轮|前一轮)\D*([1-4])\s*轮/i);
  if (previousRoundMatch) {
    const nextRound = Number(previousRoundMatch[1]) + 1;
    return nextRound >= 1 && nextRound <= 4 ? nextRound : null;
  }

  return null;
}

function buildContentDisposition(dispositionType: "inline" | "attachment", fileName: string | null | undefined): string {
  const decodedName = decodeStoredFileName(fileName);
  const asciiFallback = decodedName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encodedName = encodeURIComponent(decodedName);
  return `${dispositionType}; filename="${asciiFallback || "resume"}"; filename*=UTF-8''${encodedName}`;
}

// Global queue for import batches - ensures all batches run serially
let importBatchQueue: Promise<void> = Promise.resolve();

async function runBatchInQueue<T>(job: () => Promise<T>): Promise<T> {
  const previous = importBatchQueue;
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  importBatchQueue = next;

  await previous.catch(() => undefined);
  try {
    return await job();
  } finally {
    release();
  }
}

function runImportBatchSerially(tasks: Array<{ taskId: string; filePath: string; fileType: Parameters<typeof processFile>[2] }>) {
  void runBatchInQueue(async () => {
    let batchId: string | null = null;
    for (const task of tasks) {
      try {
        if (!batchId) {
          // Get batch ID from first task for final refresh
          const [taskRow] = await db.select({ batchId: importFileTasks.batchId }).from(importFileTasks).where(eq(importFileTasks.id, task.taskId)).limit(1);
          batchId = taskRow?.batchId ?? null;
        }
        await processFile(task.taskId, task.filePath, task.fileType);
      } catch (err) {
        console.error(`[import] file processing error: ${(err as Error).message}`);
      }
    }
    // Final refresh to ensure batch status is correctly set
    if (batchId) {
      await refreshBatchProgress(batchId);
    }
  });
}

function getImportBatchTimeLabel(timestamp: number) {
  const now = new Date();
  const date = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / 86400000);
  const period = date.getHours() < 12 ? "上午" : "下午";

  if (diffDays === 0) return `今天${period}`;
  if (diffDays === 1) return `昨天${period}`;
  if (diffDays === 2) return `前天${period}`;
  return `${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日${period}`;
}

function inferImportBatchSourceName(paths: string[]) {
  if (paths.length === 0) return "未命名导入";
  const normalized = paths.map((value) => value.replace(/\\/g, "/").replace(/\/+$/, ""));
  const dirCounts = new Map<string, number>();

  for (const filePath of normalized) {
    const segments = filePath.split("/").filter(Boolean);
    const parentName = segments.length >= 2 ? segments[segments.length - 2] : null;
    if (!parentName || /^batch_[0-9a-f-]+$/i.test(parentName)) continue;
    dirCounts.set(parentName, (dirCounts.get(parentName) ?? 0) + 1);
  }

  const topDir = [...dirCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topDir) return topDir;

  const fileName = normalized[0].split("/").pop() ?? "未命名导入";
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function buildImportBatchDisplayName(paths: string[], totalFiles: number, createdAt: number) {
  const timeLabel = getImportBatchTimeLabel(createdAt);
  const sourceName = inferImportBatchSourceName(paths);
  return `${timeLabel}-${totalFiles}个-【${sourceName}】`;
}

type LuiSupportedModel = {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  requiresAuth: boolean;
  runtimeModel: string;
};

type LuiGatewayEndpoint = {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  provider: string;
  modelId?: string;
  modelDisplayName?: string;
  /**
   * 预设提供商 ID。当提供此字段时，系统会自动从预设配置中填充
   * id、name、baseURL、provider 等字段。
   */
  providerId?: string;
};

type LuiSettings = {
  customEndpoints: LuiGatewayEndpoint[];
  defaultEndpointId: string | null;
};

const PRESET_PROVIDERS: Record<string, {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
  supportsModelsEndpoint: boolean;
  models: LuiSupportedModel[];
}> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    icon: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    supportsModelsEndpoint: true,
    models: [
      {
        id: "gpt-4o",
        provider: "openai",
        name: "gpt-4o",
        displayName: "GPT-4o",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "gpt-4o",
      },
      {
        id: "gpt-4o-mini",
        provider: "openai",
        name: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "gpt-4o-mini",
      },
      {
        id: "o1-preview",
        provider: "openai",
        name: "o1-preview",
        displayName: "o1 Preview",
        maxTokens: 128000,
        supportsStreaming: true,
        supportsTools: false,
        requiresAuth: true,
        runtimeModel: "o1-preview",
      },
    ],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    icon: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    supportsModelsEndpoint: false,
    models: [
      {
        id: "claude-3-5-sonnet",
        provider: "anthropic",
        name: "claude-3-5-sonnet-20241022",
        displayName: "Claude 3.5 Sonnet",
        maxTokens: 200000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "claude-3-5-sonnet-20241022",
      },
      {
        id: "claude-3-5-haiku",
        provider: "anthropic",
        name: "claude-3-5-haiku-20241022",
        displayName: "Claude 3.5 Haiku",
        maxTokens: 200000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "claude-3-5-haiku-20241022",
      },
    ],
  },
  minimax: {
    id: "minimax",
    name: "MiniMax",
    icon: "MiniMax",
    baseURL: "https://api.minimax.chat/v1",
    supportsModelsEndpoint: false,
    models: [
      {
        id: "minimax-m2.7",
        provider: "minimax",
        name: "MiniMax-M2.7",
        displayName: "MiniMax M2.7",
        maxTokens: 8000,
        supportsStreaming: true,
        supportsTools: false,
        requiresAuth: true,
        runtimeModel: "MiniMax-M2.7",
      },
      {
        id: "minimax-text-01",
        provider: "minimax",
        name: "MiniMax-Text-01",
        displayName: "MiniMax Text-01",
        maxTokens: 1000000,
        supportsStreaming: true,
        supportsTools: false,
        requiresAuth: true,
        runtimeModel: "MiniMax-Text-01",
      },
    ],
  },
  moonshot: {
    id: "moonshot",
    name: "Moonshot",
    icon: "Moonshot",
    baseURL: "https://api.moonshot.cn/v1",
    supportsModelsEndpoint: true,
    models: [], // Will be fetched from API
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    icon: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    supportsModelsEndpoint: true,
    models: [], // Will be fetched from API
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    icon: "Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    supportsModelsEndpoint: false,
    models: [
      {
        id: "gemini-2.0-flash",
        provider: "gemini",
        name: "gemini-2.0-flash",
        displayName: "Gemini 2.0 Flash",
        maxTokens: 1000000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "gemini-2.0-flash",
      },
      {
        id: "gemini-1.5-pro",
        provider: "gemini",
        name: "gemini-1.5-pro",
        displayName: "Gemini 1.5 Pro",
        maxTokens: 2000000,
        supportsStreaming: true,
        supportsTools: true,
        requiresAuth: true,
        runtimeModel: "gemini-1.5-pro",
      },
    ],
  },
  siliconflow: {
    id: "siliconflow",
    name: "SiliconFlow",
    icon: "SiliconFlow",
    baseURL: "https://api.siliconflow.cn/v1",
    supportsModelsEndpoint: true,
    models: [], // Will be fetched from API
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    icon: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    supportsModelsEndpoint: true,
    models: [], // Will be fetched from API
  },
  grok: {
    id: "grok",
    name: "Grok",
    icon: "Grok",
    baseURL: "https://api.x.ai/v1",
    supportsModelsEndpoint: true,
    models: [], // Will be fetched from API
  },
};

const LUI_MODEL_PROVIDERS: Array<{ id: string; name: string; icon: string; models: LuiSupportedModel[] }> = Object.values(PRESET_PROVIDERS).map(p => ({
  id: p.id,
  name: p.name,
  icon: p.icon,
  models: p.models,
}));

// Get provider configuration by ID
function getPresetProvider(providerId: string): typeof PRESET_PROVIDERS[string] | null {
  return PRESET_PROVIDERS[providerId] || null;
}

// Get all available preset providers (for UI dropdown)
function getPresetProviderList(): Array<{ id: string; name: string; icon: string; baseURL: string }> {
  return Object.values(PRESET_PROVIDERS).map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    baseURL: p.baseURL,
  }));
};

function toModelIdentityId(providerId: string, modelName: string) {
  return `${providerId}::${modelName}`;
}

function parseRuntimeModelName(modelId: string) {
  const separatorIndex = modelId.indexOf("::");
  if (separatorIndex < 0) {
    return modelId;
  }
  return modelId.slice(separatorIndex + 2);
}

const VALID_AGENT_TOOL_NAMES = new Set<string>(TOOL_NAMES);

function parseAgentTools(toolsJson: string | null | undefined): string[] {
  if (!toolsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(toolsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((tool): tool is string => typeof tool === "string" && VALID_AGENT_TOOL_NAMES.has(tool));
  } catch {
    return [];
  }
}

function parseAgentEngine(value: unknown): "builtin" | "deepagents" {
  return value === "deepagents" ? "deepagents" : "builtin";
}

function buildAgentToolConstraints(agentName: string, allowedToolNames: string[]): string {
  if (allowedToolNames.length === 0) {
    return `\n\n## Agent Tool Constraints\nCurrent agent "${agentName}" has no tools enabled. Answer without using any tools.`;
  }

  return `\n\n## Agent Tool Constraints\nCurrent agent "${agentName}" may only use these tools: ${allowedToolNames.join(", ")}. Never call tools outside this allowlist.`;
}

async function listAvailableConversationAgents() {
  await ensureManagedAgents();
  return db.select().from(agents);
}

function serializeConversation(
  row: typeof conversations.$inferSelect,
  availableAgents: Array<typeof agents.$inferSelect>,
) {
  return {
    ...row,
    agentResolution: resolveConversationAgentResolution(row.agentId, availableAgents),
  };
}

const LUI_MODEL_PROVIDERS_RESPONSE = LUI_MODEL_PROVIDERS.map((provider) => ({
  ...provider,
  models: provider.models.map(({ runtimeModel: _runtimeModel, ...model }) => ({
    ...model,
    id: toModelIdentityId(provider.id, model.name),
    provider: provider.id,
  })),
}));

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = process.env.CUSTOM_BASE_URL || "https://ai-gateway.vercel.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_API_KEY = process.env.CUSTOM_API_KEY || process.env.VERCEL_AI_GATEWAY_TOKEN || "";

interface OpenAiCompatibleModel {
  id: string;
}

interface OpenAiCompatibleModelsResponse {
  data?: OpenAiCompatibleModel[];
}

type CustomModelDiscoveryConfig = {
  providerId?: string;
  baseURL?: string;
  apiKey?: string;
  provider?: string;
  strict?: boolean;
};

const MODELS_DEV_PROVIDER_DEFAULTS: Record<string, { maxTokens: number; supportsTools: boolean; supportsStreaming: boolean }> = {
  openai: { maxTokens: 128000, supportsTools: true, supportsStreaming: true },
  anthropic: { maxTokens: 200000, supportsTools: true, supportsStreaming: true },
  minimax: { maxTokens: 128000, supportsTools: false, supportsStreaming: true },
  moonshot: { maxTokens: 128000, supportsTools: true, supportsStreaming: true },
  deepseek: { maxTokens: 128000, supportsTools: true, supportsStreaming: true },
  gemini: { maxTokens: 1000000, supportsTools: true, supportsStreaming: true },
  siliconflow: { maxTokens: 128000, supportsTools: true, supportsStreaming: true },
  openrouter: { maxTokens: 128000, supportsTools: true, supportsStreaming: true },
  grok: { maxTokens: 200000, supportsTools: true, supportsStreaming: true },
};

const MODELS_DEV_PROVIDER_ALIASES: Record<string, string> = {
  moonshotai: "moonshot",
  google: "gemini",
  xai: "grok",
  "x-ai": "grok",
};

function mapPresetProviderModels(providerId: string, presetModels: LuiSupportedModel[], apiKey?: string): LuiSupportedModel[] {
  return presetModels.map((model) => ({
    ...model,
    id: toModelIdentityId(providerId, model.name),
    provider: providerId,
    requiresAuth: !apiKey,
  }));
}

function createManualModelPlaceholder(providerId: string, apiKey?: string): LuiSupportedModel {
  return {
    id: toModelIdentityId(providerId, "__manual__"),
    provider: providerId,
    name: "__manual__",
    displayName: "✏️ 输入模型名称...",
    maxTokens: 128000,
    supportsStreaming: true,
    supportsTools: true,
    requiresAuth: !apiKey,
    runtimeModel: "__manual__",
  };
}

function resolveModelsDevProviderId(rawProviderId: string): string | null {
  const normalized = rawProviderId.trim().toLowerCase();
  if (!normalized) return null;
  if (MODELS_DEV_PROVIDER_DEFAULTS[normalized]) return normalized;
  if (MODELS_DEV_PROVIDER_ALIASES[normalized]) return MODELS_DEV_PROVIDER_ALIASES[normalized];
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("moonshot") || normalized.includes("kimi")) return "moonshot";
  if (normalized.includes("grok") || normalized.includes("xai")) return "grok";
  return null;
}

function getModelsDevLocalNames(rawProviderId: string): string[] {
  const providerId = resolveModelsDevProviderId(rawProviderId);
  if (!providerId) return [];
  const primary = MODELS_DEV_LOCAL_DATA_PRIMARY[providerId] ?? [];
  const backup = MODELS_DEV_LOCAL_DATA_BACKUP[providerId] ?? [];
  const merged = new Set<string>();
  for (const modelName of [...primary, ...backup]) {
    const normalized = modelName.trim();
    if (normalized) merged.add(normalized);
  }
  return Array.from(merged);
}

function buildModelsDevLocalFallbackModels(
  sourceProviderId: string,
  targetProviderId: string,
  apiKey?: string,
): LuiSupportedModel[] {
  const resolvedSource = resolveModelsDevProviderId(sourceProviderId);
  const modelNames = getModelsDevLocalNames(sourceProviderId);
  if (modelNames.length === 0) {
    return [];
  }

  const defaults = resolvedSource ? MODELS_DEV_PROVIDER_DEFAULTS[resolvedSource] : undefined;
  return modelNames.map((modelName) => ({
    id: toModelIdentityId(targetProviderId, modelName),
    provider: targetProviderId,
    name: modelName,
    displayName: modelName,
    maxTokens: defaults?.maxTokens ?? 128000,
    supportsStreaming: defaults?.supportsStreaming ?? true,
    supportsTools: defaults?.supportsTools ?? true,
    requiresAuth: !apiKey,
    runtimeModel: modelName,
  }));
}

// Fetch models for a preset provider
async function fetchPresetProviderModels(
  providerId: string,
  apiKey?: string,
): Promise<{ models: LuiSupportedModel[]; errorMessage: string | null }> {
  const presetProvider = getPresetProvider(providerId);
  if (!presetProvider) {
    return { models: [], errorMessage: `Unknown provider: ${providerId}` };
  }

  const baseURL = presetProvider.baseURL;
  const modelsDevLocalFallback = buildModelsDevLocalFallbackModels(providerId, providerId, apiKey);
  const presetModelFallback = mapPresetProviderModels(providerId, presetProvider.models, apiKey);
  const stableFallbackModels = modelsDevLocalFallback.length > 0
    ? modelsDevLocalFallback
    : presetModelFallback;
  const fallbackModels = stableFallbackModels.length > 0
    ? stableFallbackModels
    : [createManualModelPlaceholder(providerId, apiKey)];

  // For providers with preset models (no /models endpoint support)
  if (!presetProvider.supportsModelsEndpoint) {
    return {
      models: fallbackModels,
      errorMessage: null,
    };
  }

  // For providers that support /models endpoint or have fallback
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const normalizedBaseURL = normalizeOpenAIBaseURL(baseURL);
    const response = await fetch(`${trimTrailingSlash(normalizedBaseURL)}/models`, { headers });

    if (!response.ok) {
      const errorMessage = `Failed to fetch models: ${response.status} ${response.statusText}`;
      console.warn(`[${presetProvider.name}] ${errorMessage}`);
      return {
        models: fallbackModels,
        errorMessage,
      };
    }

    const payload = await response.json() as OpenAiCompatibleModelsResponse;
    const models = Array.isArray(payload?.data) ? payload.data : [];

    if (models.length === 0) {
      const errorMessage = "Remote /models returned empty model list";
      return {
        models: fallbackModels,
        errorMessage,
      };
    }

    return {
      models: models
        .filter((model): model is OpenAiCompatibleModel => Boolean(model?.id && typeof model.id === "string"))
        .map((model) => ({
          id: toModelIdentityId(providerId, model.id),
          provider: providerId,
          name: model.id,
          displayName: model.id,
          maxTokens: 128000,
          supportsStreaming: true,
          supportsTools: true,
          requiresAuth: !apiKey,
          runtimeModel: model.id,
        })),
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${presetProvider.name}] Error fetching models:`, error);
    return {
      models: fallbackModels,
      errorMessage,
    };
  }
}

// Legacy function for custom endpoints
async function fetchOpenAiCompatibleModels(config: CustomModelDiscoveryConfig): Promise<{ models: LuiSupportedModel[]; errorMessage: string | null }> {
  const baseURL = config.baseURL?.trim();
  if (!baseURL) return { models: [], errorMessage: null };

  const providerName = config.provider?.trim() || "Custom OpenAI Compatible";
  const providerId = config.providerId?.trim() || normalizeProviderId(providerName);
  const apiKey = config.apiKey?.trim();
  const modelsDevLocalFallback = buildModelsDevLocalFallbackModels(providerId, providerId, apiKey);
  const fallbackModels = modelsDevLocalFallback.length > 0
    ? modelsDevLocalFallback
    : [createManualModelPlaceholder(providerId, apiKey)];

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const normalizedBaseURL = normalizeOpenAIBaseURL(baseURL);
    const response = await fetch(`${trimTrailingSlash(normalizedBaseURL)}/models`, { headers });

    if (!response.ok) {
      const errorMessage = `Failed to fetch models: ${response.status} ${response.statusText}`;
      console.warn(`[${providerName}] ${errorMessage}`);
      return {
        models: fallbackModels,
        errorMessage,
      };
    }

    const payload = await response.json() as OpenAiCompatibleModelsResponse;
    const models = Array.isArray(payload?.data) ? payload.data : [];

    if (models.length === 0) {
      const errorMessage = "Remote /models returned empty model list";
      return {
        models: fallbackModels,
        errorMessage,
      };
    }

    return {
      models: models
        .filter((model): model is OpenAiCompatibleModel => Boolean(model?.id && typeof model.id === "string"))
        .map((model) => ({
          id: toModelIdentityId(providerId, model.id),
          provider: providerId,
          name: model.id,
          displayName: model.id,
          maxTokens: 128000,
          supportsStreaming: true,
          supportsTools: true,
          requiresAuth: !apiKey,
          runtimeModel: model.id,
        })),
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${providerName}] Error fetching models:`, error);
    return {
      models: fallbackModels,
      errorMessage,
    };
  }
}

function normalizeProviderId(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return normalized || "custom-openai";
}

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

async function candidateOrFail(id: string) {
  const row = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.id, id), isNull(candidates.deletedAt))).limit(1);
  if (!row.length) return null;
  return row[0];
}

async function markInterviewFeedbackReceived(candidateId: string) {
  const [latestWorkflow] = await db
    .select()
    .from(luiWorkflows)
    .where(eq(luiWorkflows.candidateId, candidateId))
    .orderBy(desc(luiWorkflows.updatedAt))
    .limit(1);

  if (!latestWorkflow) {
    return;
  }

  const stageData = latestWorkflow.stageDataJson ? JSON.parse(latestWorkflow.stageDataJson) : {};
  const lastFeedbackAt = new Date().toISOString();
  const nextFeedbackLoop = {
    ...(typeof stageData.s2_feedback_loop === "object" && stageData.s2_feedback_loop ? stageData.s2_feedback_loop as Record<string, unknown> : {}),
    interviewer_feedback_status: "received",
    last_feedback_at: lastFeedbackAt,
  };

  await updateWorkflow(latestWorkflow.id, {
    stageData: {
      ...stageData,
      interviewer_feedback_status: "received",
      last_feedback_at: lastFeedbackAt,
      s2_feedback_loop: nextFeedbackLoop,
    },
  });
}

async function upsertLocalUser(user: { name: string; email: string | null }) {
  const existing = await db.select().from(users).limit(1);
  const now = Date.now();

  if (existing.length) {
    await db.update(users)
      .set({ name: user.name, email: user.email, tokenStatus: "valid", lastSyncAt: now })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const id = `user_${crypto.randomUUID()}`;
  await db.insert(users).values({
    id,
    name: user.name,
    email: user.email,
    tokenStatus: "valid",
    lastSyncAt: now,
  });
  return id;
}

function sanitizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeGatewayEndpoint(value: unknown): LuiGatewayEndpoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const providerId = sanitizeString(value.providerId);
  const apiKey = sanitizeString(value.apiKey);
  const modelId = sanitizeString(value.modelId);
  const modelDisplayName = sanitizeString(value.modelDisplayName);

  // 如果提供了 providerId，从预设配置自动填充
  if (providerId) {
    const preset = getPresetProvider(providerId);
    if (preset) {
      return {
        id: preset.id,
        name: preset.name,
        baseURL: preset.baseURL,
        provider: preset.id,
        providerId: preset.id,
        ...(apiKey ? { apiKey } : {}),
        ...(modelId ? { modelId } : {}),
        ...(modelDisplayName ? { modelDisplayName } : {}),
      };
    }
  }

  // 传统模式：需要手动填写所有字段
  const id = sanitizeString(value.id);
  const name = sanitizeString(value.name);
  const baseURL = sanitizeString(value.baseURL);
  const provider = sanitizeString(value.provider);
  const fallbackProviderId = sanitizeString(value.providerId);

  if (!id || !name || !baseURL || !provider) {
    return null;
  }

  return {
    id,
    name,
    baseURL,
    provider,
    ...(fallbackProviderId ? { providerId: fallbackProviderId } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(modelId ? { modelId } : {}),
    ...(modelDisplayName ? { modelDisplayName } : {}),
  };
}

function parseUserSettings(settingsJson: string | null | undefined): Record<string, unknown> {
  if (!settingsJson?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(settingsJson) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function extractLuiSettings(settings: Record<string, unknown>): LuiSettings {
  const rawLui = settings.lui;
  const rawCustomEndpoints = isRecord(rawLui) ? rawLui.customEndpoints : undefined;
  const customEndpoints = Array.isArray(rawCustomEndpoints)
    ? rawCustomEndpoints
        .map(normalizeGatewayEndpoint)
        .filter((endpoint): endpoint is LuiGatewayEndpoint => endpoint !== null)
    : [];

  const requestedDefaultEndpointId = isRecord(rawLui) && typeof rawLui.defaultEndpointId === "string"
    ? rawLui.defaultEndpointId.trim()
    : "";
  const defaultEndpointId = requestedDefaultEndpointId && customEndpoints.some((endpoint) => endpoint.id === requestedDefaultEndpointId)
    ? requestedDefaultEndpointId
    : null;

  return { customEndpoints, defaultEndpointId };
}

function mergeLuiSettings(settings: Record<string, unknown>, luiSettings: LuiSettings): Record<string, unknown> {
  const nextSettings: Record<string, unknown> = { ...settings };
  const existingLui = isRecord(settings.lui) ? settings.lui : {};
  nextSettings.lui = {
    ...existingLui,
    customEndpoints: luiSettings.customEndpoints,
    defaultEndpointId: luiSettings.defaultEndpointId,
  };
  return nextSettings;
}

async function getOrCreateLocalUser() {
  const existing = await db.select().from(users).limit(1);
  if (existing[0]) {
    return existing[0];
  }

  const id = await upsertLocalUser({
    name: "Local User",
    email: null,
  });

  const created = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return created[0] ?? null;
}

async function persistBaobaoAuth(
  token: string,
  baobaoUser: { id: string; name: string; username: string; email: string | null },
  tokenExpAt: number | null,
  cookieJson: string | null,
) {
  logBaobaoAuth("persist:start", {
    userId: baobaoUser.id,
    username: baobaoUser.username,
    tokenExpAt,
    hasCookies: Boolean(cookieJson),
  }, true);
  const existing = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).limit(1);
  const now = Date.now();

  if (existing.length) {
    await db.update(remoteUsers)
      .set({
        name: baobaoUser.name,
        username: baobaoUser.username,
        email: baobaoUser.email,
        remoteId: baobaoUser.id,
        token,
        cookieJson,
        tokenExpAt,
        userDataJson: JSON.stringify(baobaoUser),
        updatedAt: now,
      })
      .where(eq(remoteUsers.provider, "baobao"));
  } else {
    await db.insert(remoteUsers).values({
      id: `remote_${crypto.randomUUID()}`,
      provider: "baobao",
      name: baobaoUser.name,
      username: baobaoUser.username,
        email: baobaoUser.email,
        remoteId: baobaoUser.id,
        token,
        cookieJson,
        tokenExpAt,
        userDataJson: JSON.stringify(baobaoUser),
        createdAt: now,
      updatedAt: now,
    });
  }

  await upsertLocalUser({ name: baobaoUser.name, email: baobaoUser.email });
  setBaobaoClient(new BaobaoClient(token));

  const discovery = getDiscovery("Interview-Manager", config.port);
  discovery.setLocalUserInfo(baobaoUser.username, baobaoUser.name);
  logBaobaoAuth("persist:done", {
    userId: baobaoUser.id,
    username: baobaoUser.username,
    hasExisting: existing.length > 0,
  }, true);
}

function triggerInitialSync(reason: string) {
  void syncManager.runOnce()
    .then((result) => {
      console.log(`[sync] initial sync (${reason}) done, syncedCandidates=${result.syncedCandidates} syncedInterviews=${result.syncedInterviews}`);
    })
    .catch((error) => {
      if (isBaobaoAuthExpiredError(error)) {
        void markBaobaoAuthExpired();
      }
      console.error(`[sync] initial sync (${reason}) failed: ${(error as Error).message}`);
    });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isBaobaoAuthExpiredError(error: unknown) {
  const message = getErrorMessage(error);
  return message.includes("请重新刷新页面")
    || message.includes("Baobao client not initialized")
    || message.includes("Invalid baobao token")
    || message.includes("token expired")
    || message.includes("401 Unauthorized");
}

async function markBaobaoAuthExpired() {
  const now = Date.now();
  console.warn("[auth] mark baobao auth expired", { now });
  await db.update(users).set({ tokenStatus: "expired", lastSyncAt: now });
  await db.update(remoteUsers)
    .set({ tokenExpAt: now, updatedAt: now })
    .where(eq(remoteUsers.provider, "baobao"));
  setBaobaoClient(null);
  await clearBaobaoLoginSession();
}

async function resolveBaobaoAuthStatus() {
  const remote = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).limit(1);
  const row = await db.select().from(users).limit(1);
  const localUser = row[0] ?? null;

  if (!remote.length) {
    console.log("[auth/status] no remote auth row", {
      localTokenStatus: localUser?.tokenStatus ?? null,
      localUserId: localUser?.id ?? null,
    });
    if (localUser && localUser.tokenStatus !== "unauthenticated") {
      return {
        status: localUser.tokenStatus as "valid" | "expired" | "unauthenticated",
        user: { id: localUser.id, name: localUser.name, email: localUser.email },
        lastValidatedAt: localUser.lastSyncAt,
      };
    }

    return { status: "unauthenticated" as const, user: null, lastValidatedAt: null };
  }

  const item = remote[0];
  const expired = item.tokenExpAt ? Date.now() > item.tokenExpAt : true;
  const fallbackUser = {
    id: item.remoteId ?? item.id,
    name: item.name,
    email: item.email,
    phone: (() => {
      const ud = item.userDataJson ? JSON.parse(item.userDataJson) : null;
      return ud?.phone ?? ud?.phoneNumber ?? null;
    })(),
  };

  console.log("[auth/status] evaluating remote auth", {
    remoteUserId: item.remoteId ?? item.id,
    username: item.username,
    tokenExpAt: item.tokenExpAt,
    expired,
    localTokenStatus: localUser?.tokenStatus ?? null,
  });

  if (expired) {
    const session = await getBaobaoLoginSessionStatus();
    console.log("[auth/status] remote token expired, session recovery result", {
      authenticated: Boolean(session.authenticated),
      status: session.status,
      error: session.error,
    });

    if (session.authenticated) {
      await persistBaobaoAuth(
        session.authenticated.token,
        session.authenticated.user,
        session.authenticated.tokenExpAt,
        JSON.stringify(session.authenticated.cookies),
      );

      return {
        status: "valid" as const,
        user: {
          id: session.authenticated.user.id,
          name: session.authenticated.user.name,
          email: session.authenticated.user.email,
          phone: (session.authenticated.user as { phone?: string; phoneNumber?: string }).phone ?? (session.authenticated.user as { phone?: string; phoneNumber?: string }).phoneNumber ?? null,
        },
        lastValidatedAt: Date.now(),
      };
    }

    if (localUser && localUser.tokenStatus !== "valid") {
      await db.update(users)
        .set({ tokenStatus: "valid", lastSyncAt: Date.now() })
        .where(eq(users.id, localUser.id));
    }

    return {
      status: "valid" as const,
      user: fallbackUser,
      lastValidatedAt: item.updatedAt,
    };
  }

  const nextStatus = expired ? "expired" : "valid";

  if (localUser && localUser.tokenStatus !== nextStatus) {
    await db.update(users)
      .set({ tokenStatus: nextStatus, lastSyncAt: Date.now() })
      .where(eq(users.id, localUser.id));
  }

  return {
    status: nextStatus as "valid" | "expired",
    user: fallbackUser,
    lastValidatedAt: item.updatedAt,
  };
}

type CandidateListRow = {
  id: string;
  source: string;
  remoteId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  organizationName: string | null;
  orgAllParentName: string | null;
  recruitmentSourceName: string | null;
  yearsOfExperience: number | null;
  tagsJson: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type CandidateListCountRow = {
  total: number;
};

type CandidateLatestResumeRow = {
  candidateId: string;
  parsedDataJson: string | null;
  createdAt: number;
};

type CandidateLatestInterviewRow = {
  candidateId: string;
  status: string;
  statusRaw: string | null;
  interviewType: number | null;
  interviewResult: number | null;
  interviewResultString: string | null;
  scheduledAt: number | null;
  interviewPlace: string | null;
  meetingLink: string | null;
  dockingHrName: string | null;
  dockingHrbpName: string | null;
  checkInTime: number | null;
  createdAt: number;
  updatedAt: number;
};

type CandidateLatestImportTaskRow = {
  candidateId: string;
  status: string;
  updatedAt: number;
};

function buildCandidateListWhereClause(search?: string, source?: string) {
  const clauses = ["deleted_at IS NULL"];
  const params: Array<string | number> = [];

  if (search) {
    clauses.push("name LIKE ?");
    params.push(`%${search}%`);
  }

  if (source) {
    clauses.push("source = ?");
    params.push(source);
  }

  return {
    whereClause: clauses.join(" AND "),
    params,
  };
}

function makeInClauseParams(ids: string[]) {
  return ids.map(() => "?").join(", ");
}

function parseCandidateTags(tagsJson: string | null) {
  if (!tagsJson) return [] as string[];

  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch (error) {
    console.warn("[candidates] failed to parse tags_json", error);
    return [];
  }
}

function deriveResumeStatus(resume?: CandidateLatestResumeRow, importTask?: CandidateLatestImportTaskRow) {
  if (importTask?.status === "failed") return "failed" as const;
  if (!resume) return "missing" as const;
  return resume.parsedDataJson ? "parsed" as const : "uploaded" as const;
}

function deriveInterviewState(interview?: CandidateLatestInterviewRow) {
  if (!interview) return "none" as const;
  if (interview.status === "completed") return "completed" as const;
  if (interview.status === "cancelled" || interview.status === "no_show") return "cancelled" as const;
  return "scheduled" as const;
}

function derivePipelineStage(
  resumeStatus: ReturnType<typeof deriveResumeStatus>,
  interview?: CandidateLatestInterviewRow,
) {
  if (interview) return "interview" as const;
  if (resumeStatus !== "missing") return "screening" as const;
  return "new" as const;
}

function deriveLastActivityAt(
  candidate: CandidateListRow,
  resume?: CandidateLatestResumeRow,
  interview?: CandidateLatestInterviewRow,
  importTask?: CandidateLatestImportTaskRow,
) {
  return Math.max(
    candidate.updatedAt,
    resume?.createdAt ?? 0,
    interview?.updatedAt ?? interview?.createdAt ?? 0,
    importTask?.updatedAt ?? 0,
  );
}

function deriveInterviewTypeLabel(interviewType?: number | null): string | null {
  if (interviewType === null || interviewType === undefined) return null;
  return lookupLabelOrDefault(INTERVIEW_TYPE_LABELS, interviewType);
}

function deriveInterviewOwnerName(interview?: CandidateLatestInterviewRow) {
  return interview?.dockingHrName ?? interview?.dockingHrbpName ?? null;
}

function deriveApplicationStatusText(interview?: CandidateLatestInterviewRow): string | null {
  if (!interview) return null;

  const rawStatus = interview.statusRaw;

  // 中文标签直接返回（已是可读文案）
  if (typeof rawStatus === "string" && rawStatus.trim()) {
    const trimmed = rawStatus.trim();
    if (/[\u4e00-\u9fff]/.test(trimmed)) {
      return trimmed;
    }
    // 纯数字字符串，尝试用字典解析
    const numericCode = Number(trimmed);
    if (Number.isFinite(numericCode)) {
      const label = lookupLabelOrDefault(APPLICATION_STATUS_LABELS, numericCode);
      if (!label.startsWith("未知(")) {
        return label;
      }
    }
    // 解析不了，加前缀保留原始值
    return `状态 ${trimmed}`;
  }

  // 兜底到面试进度状态
  if (interview.status === "completed") return "已面试";
  if (interview.status === "cancelled" || interview.status === "no_show") return "已取消";
  if (interview.status === "scheduled") return "待面试";

  return null;
}

function pickLatestByCandidate<T extends { candidateId: string }>(rows: T[]) {
  const latestByCandidate = new Map<string, T>();

  for (const row of rows) {
    if (!latestByCandidate.has(row.candidateId)) {
      latestByCandidate.set(row.candidateId, row);
    }
  }

  return latestByCandidate;
}

export async function route(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Health
  if ((path === "/api/health" || path === "/health") && request.method === "GET") {
    return ok({ service: "interview-manager", status: "ok" });
  }

  // Auth
  if (path === "/api/auth/status" && request.method === "GET") {
    return ok(await resolveBaobaoAuthStatus());
  }

  if (path === "/api/auth/start" && request.method === "POST") {
    const requestId = `req_${crypto.randomUUID()}`;
    return ok({ loginUrl: `https://internal.company.com/auth?requestId=${requestId}`, requestId });
  }

  if (path === "/api/auth/complete" && request.method === "POST") {
    const body = await parseJson<{ token: string; expiresAt: number; name?: string; email?: string }>(request);
    if (!body.token) return fail("VALIDATION_ERROR", "token is required", 422);
    const id = `user_${crypto.randomUUID()}`;
    await db.insert(users).values({ id, name: body.name ?? "User", email: body.email ?? null, tokenStatus: "valid", lastSyncAt: Date.now() }).onConflictDoNothing();
    return ok({ status: "valid" as const, user: { id, name: body.name ?? "User", email: body.email ?? null } });
  }

  if (path === "/api/auth/relogin" && request.method === "POST") {
    const requestId = `req_${crypto.randomUUID()}`;
    return ok({ loginUrl: `https://internal.company.com/auth?requestId=${requestId}`, requestId });
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    // Call baobao logout first to clear remote session
    const client = getBaobaoClient();
    if (client) {
      try {
        await client.logout();
      } catch (err) {
        // Log but don't fail - local logout should still proceed
        console.log("[baobao-logout] Remote logout failed:", (err as Error).message);
      }
    }
    
    await db.update(users).set({ tokenStatus: "unauthenticated" });
    await db.delete(remoteUsers).where(eq(remoteUsers.provider, "baobao"));
    setBaobaoClient(null);
    await clearBaobaoLoginSession();
    return ok({ status: "logged_out" });
  }

  // Baobao Auth
  if (path === "/api/auth/baobao/status" && request.method === "GET") {
    const row = await db.select().from(remoteUsers).where(eq(remoteUsers.provider, "baobao")).limit(1);
    if (!row.length) return ok({ connected: false as const, user: null });
    const remote = row[0];
    const isExpired = remote.tokenExpAt ? Date.now() > remote.tokenExpAt : true;
    const userData = remote.userDataJson ? JSON.parse(remote.userDataJson) : null;
    return ok({
      connected: !isExpired,
      user: { id: remote.id, name: remote.name, username: remote.username, email: remote.email, userData: userData },
      tokenExpAt: remote.tokenExpAt,
    });
  }

  if (path === "/api/auth/baobao/connect" && request.method === "POST") {
    const body = await parseJson<{ token: string }>(request);
    if (!body.token) return fail("VALIDATION_ERROR", "token is required", 422);

    // Validate token by calling Baobao API
    const client = new BaobaoClient(body.token);
    try {
      const response = await client.getCurrentUser();
      if (response.errno !== 0 || !response.data?.data) {
        return fail("AUTH_INVALID", "Invalid baobao token", 401);
      }

      const baobaoUser = response.data.data;
      const payload = BaobaoClient.parseJwtPayload(body.token);
      const tokenExpAt = payload?.exp ? payload.exp * 1000 : null;

      await persistBaobaoAuth(body.token, baobaoUser, tokenExpAt, null);
      setBaobaoClient(client);
      triggerInitialSync("auth-connect");

      return ok({
        status: "valid" as const,
        user: { id: baobaoUser.id, name: baobaoUser.name, username: baobaoUser.username, email: baobaoUser.email },
        tokenExpAt,
      });
    } catch (err) {
      return fail("AUTH_INVALID", `Failed to validate token: ${(err as Error).message}`, 401);
    }
  }

  if (path === "/api/auth/baobao/qr" && request.method === "GET") {
    try {
      logBaobaoAuth("route:qr:start");
      const qrCode = await fetchBaobaoLoginQrCode();
      if (!qrCode.authenticated && !qrCode.imageSrc && !qrCode.qrText) {
        const message = qrCode.error ?? "未获取到可用二维码数据";
        logBaobaoAuth("route:qr:no-renderable-data", {
          status: qrCode.status,
          error: qrCode.error,
          currentUrl: qrCode.currentUrl,
        }, true);
        return fail("QRCODE_UNAVAILABLE", message, 502);
      }
      if (qrCode.authenticated) {
        logBaobaoAuth("route:qr:authenticated", {
          userId: qrCode.authenticated.user.id,
          currentUrl: qrCode.currentUrl,
        }, true);
        await persistBaobaoAuth(
          qrCode.authenticated.token,
          qrCode.authenticated.user,
          qrCode.authenticated.tokenExpAt,
          JSON.stringify(qrCode.authenticated.cookies),
        );
        triggerInitialSync("auth-qr");
      }
      logBaobaoAuth("route:qr:done", {
        currentUrl: qrCode.currentUrl,
        source: qrCode.source,
        refreshed: qrCode.refreshed,
        status: qrCode.status,
      });
      return ok({
        provider: "baobao" as const,
        imageSrc: qrCode.imageSrc,
        qrText: qrCode.qrText,
        source: qrCode.source,
        refreshed: qrCode.refreshed,
        fetchedAt: Date.now(),
        authenticated: Boolean(qrCode.authenticated),
        user: qrCode.authenticated?.user ?? null,
      });
    } catch (err) {
      console.error("[baobao-auth] route:qr:error", err);
      return fail("REMOTE_SYNC_FAILED", `Failed to load baobao QR code: ${(err as Error).message}`, 502);
    }
  }

  if (path === "/api/auth/baobao/login-status" && request.method === "GET") {
    logBaobaoAuth("route:login-status:start");
    // Add timeout protection to prevent hanging
    const timeoutMs = 25000;
    const session = await Promise.race([
      getBaobaoLoginSessionStatus(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Login status check timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]).catch((err) => {
      logBaobaoAuth("route:login-status:timeout", { error: err.message });
      return {
        status: "error" as const,
        imageSrc: "",
        source: null,
        fetchedAt: null,
        refreshed: false,
        currentUrl: "",
        lastCheckedAt: Date.now(),
        error: `Timeout: ${err.message}`,
        authenticated: null,
      };
    });

    if (session.authenticated) {
      logBaobaoAuth("route:login-status:authenticated", {
        userId: session.authenticated.user.id,
        currentUrl: session.currentUrl,
      }, true);
      await persistBaobaoAuth(
        session.authenticated.token,
        session.authenticated.user,
        session.authenticated.tokenExpAt,
        JSON.stringify(session.authenticated.cookies),
      );
      triggerInitialSync("auth-login-status");
    }

    logBaobaoAuth("route:login-status:done", {
      status: session.status,
      currentUrl: session.currentUrl,
      authenticated: Boolean(session.authenticated),
      error: session.error,
    });

    return ok({
      provider: "baobao" as const,
      status: session.status,
      currentUrl: session.currentUrl,
      lastCheckedAt: session.lastCheckedAt,
      error: session.error,
      authenticated: Boolean(session.authenticated),
      user: session.authenticated?.user ?? null,
    });
  }

  if (path === "/api/auth/baobao/disconnect" && request.method === "POST") {
    await db.delete(remoteUsers).where(eq(remoteUsers.provider, "baobao"));
    setBaobaoClient(null);
    await clearBaobaoLoginSession();
    return ok({ status: "disconnected" });
  }

  // Me
  if (path === "/api/me" && request.method === "GET") {
    const row = await db.select().from(users).limit(1);
    const u = row[0];
    return ok({ user: u ? { id: u.id, name: u.name, email: u.email, tokenStatus: u.tokenStatus, lastSyncAt: u.lastSyncAt, settings: parseUserSettings(u.settingsJson) } : null, syncEnabled: false, opencodeReady: false, opencodeVersion: null });
  }

  // Sync
  if (path === "/api/sync/toggle" && request.method === "POST") {
    const body = await parseJson<{ enabled: boolean }>(request) ?? { enabled: false };
    if (body.enabled) {
      try {
        await syncManager.runOnce();
        syncManager.start(5000);
      } catch (err) {
        syncManager.stop();
        if (isBaobaoAuthExpiredError(err)) {
          console.warn("[sync] toggle detected auth expiry", { message: getErrorMessage(err) });
          await markBaobaoAuthExpired();
          return fail("AUTH_EXPIRED", getErrorMessage(err), 401);
        }
        console.error("[sync] toggle failed", { message: getErrorMessage(err) });
        return fail("REMOTE_SYNC_FAILED", getErrorMessage(err), 502);
      }
    } else {
      syncManager.stop();
    }
    const s = syncManager.status();
    return ok({ enabled: s.enabled, intervalMs: s.intervalMs });
  }

  if (path === "/api/sync/status" && request.method === "GET") return ok(syncManager.status());

  if (path === "/api/sync/run" && request.method === "POST") {
    try { const result = await syncManager.runOnce(); return ok({ ...result, syncAt: syncManager.getLastSyncAt() ?? Date.now() }); }
    catch (err) {
      if (isBaobaoAuthExpiredError(err)) {
        console.warn("[sync] run detected auth expiry", { message: getErrorMessage(err) });
        await markBaobaoAuthExpired();
        return fail("AUTH_EXPIRED", getErrorMessage(err), 401);
      }
      console.error("[sync] run failed", { message: getErrorMessage(err) });
      return fail("REMOTE_SYNC_FAILED", getErrorMessage(err), 502);
    }
  }

  if (path === "/api/sync/reset-run" && request.method === "POST") {
    const syncStatus = syncManager.status();
    const shouldRestartPolling = syncStatus.enabled;
    let hasClearedLocalRecords = false;
    syncManager.stop();

    try {
      const resetResult = await resetCandidateRecords();
      hasClearedLocalRecords = true;
      const syncResult = await syncManager.runOnce();

      if (shouldRestartPolling) {
        syncManager.start(syncStatus.intervalMs);
      }

      return ok({
        ...resetResult,
        ...syncResult,
        syncAt: syncManager.getLastSyncAt() ?? Date.now(),
      });
    } catch (err) {
      if (shouldRestartPolling && !isBaobaoAuthExpiredError(err)) {
        syncManager.start(syncStatus.intervalMs);
      }

      if (isBaobaoAuthExpiredError(err)) {
        console.warn("[sync] reset-run detected auth expiry", { message: getErrorMessage(err) });
        await markBaobaoAuthExpired();
        const message = hasClearedLocalRecords
          ? `本地记录已清空，但重新同步前登录状态已失效：${getErrorMessage(err)}`
          : getErrorMessage(err);
        return fail("AUTH_EXPIRED", message, 401);
      }

      const message = hasClearedLocalRecords
        ? `本地记录已清空，但重新同步失败：${getErrorMessage(err)}`
        : getErrorMessage(err);
      return fail("REMOTE_SYNC_FAILED", message, 502);
    }
  }

  // Candidates
  if (path === "/api/candidates" && request.method === "GET") {
    const search = url.searchParams.get("search")?.trim();
    const source = url.searchParams.get("source")?.trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;
    const { whereClause, params } = buildCandidateListWhereClause(search, source);
    const [countRow] = rawDb.query(`SELECT COUNT(*) as total FROM candidates WHERE ${whereClause}`).all(...params) as CandidateListCountRow[];
    // Order by interview scheduled time (Baobao default order), fall back to candidate updated_at
    const items = rawDb.query(`
      SELECT
        c.id,
        c.source,
        c.remote_id as remoteId,
        c.name,
        c.phone,
        c.email,
        c.position,
        c.organization_name as organizationName,
        c.org_all_parent_name as orgAllParentName,
        c.recruitment_source_name as recruitmentSourceName,
        c.years_of_experience as yearsOfExperience,
        c.tags_json as tagsJson,
        c.deleted_at as deletedAt,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        (
          SELECT MAX(i.scheduled_at) FROM interviews i WHERE i.candidate_id = c.id
        ) as lastActivityAt
      FROM candidates c
      WHERE ${whereClause}
      ORDER BY lastActivityAt DESC NULLS LAST, c.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as (CandidateListRow & { lastActivityAt: number })[];

    if (!items.length) {
      return ok({ items: [], total: countRow?.total ?? 0, page, pageSize });
    }

    const candidateIds = items.map((candidate) => candidate.id);
    const inClause = makeInClauseParams(candidateIds);
    const resumeRows = rawDb.query(`
      SELECT
        candidate_id as candidateId,
        parsed_data_json as parsedDataJson,
        created_at as createdAt
      FROM resumes
      WHERE candidate_id IN (${inClause})
      ORDER BY candidate_id ASC, created_at DESC
    `).all(...candidateIds) as CandidateLatestResumeRow[];
    const interviewRows = rawDb.query(`
      SELECT
        candidate_id as candidateId,
        status,
        status_raw as statusRaw,
        interview_type as interviewType,
        interview_result as interviewResult,
        interview_result_string as interviewResultString,
        scheduled_at as scheduledAt,
        interview_place as interviewPlace,
        meeting_link as meetingLink,
        docking_hr_name as dockingHrName,
        docking_hrbp_name as dockingHrbpName,
        check_in_time as checkInTime,
        created_at as createdAt,
        updated_at as updatedAt
      FROM interviews
      WHERE candidate_id IN (${inClause})
      ORDER BY candidate_id ASC, scheduled_at DESC, updated_at DESC, created_at DESC
    `).all(...candidateIds) as CandidateLatestInterviewRow[];
    const importTaskRows = rawDb.query(`
      SELECT
        candidate_id as candidateId,
        status,
        updated_at as updatedAt
      FROM import_file_tasks
      WHERE candidate_id IN (${inClause})
      ORDER BY candidate_id ASC, updated_at DESC
    `).all(...candidateIds) as CandidateLatestImportTaskRow[];

    const latestResumeByCandidate = pickLatestByCandidate(resumeRows);
    const latestInterviewByCandidate = pickLatestByCandidate(interviewRows);
    const latestImportTaskByCandidate = pickLatestByCandidate(importTaskRows);

    // SQL already sorted by lastActivityAt DESC, no in-memory resort needed

    return ok({
      items: items.map((candidate) => {
        const latestResume = latestResumeByCandidate.get(candidate.id);
        const latestInterview = latestInterviewByCandidate.get(candidate.id);
        const latestImportTask = latestImportTaskByCandidate.get(candidate.id);
        const resumeStatus = deriveResumeStatus(latestResume, latestImportTask);
        const interviewState = deriveInterviewState(latestInterview);
        const pipelineStage = derivePipelineStage(resumeStatus, latestInterview);

        return {
          ...candidate,
          tags: parseCandidateTags(candidate.tagsJson),
          applyPositionName: candidate.position,
          organizationName: candidate.organizationName,
          orgAllParentName: candidate.orgAllParentName,
          interviewTime: latestInterview?.scheduledAt ?? null,
          interviewType: latestInterview?.interviewType ?? null,
          interviewTypeLabel: deriveInterviewTypeLabel(latestInterview?.interviewType ?? null),
          interviewResult: latestInterview?.interviewResult ?? null,
          interviewResultString: latestInterview?.interviewResultString ?? null,
          interviewPlace: latestInterview?.interviewPlace ?? null,
          interviewUrl: latestInterview?.meetingLink ?? null,
          recruitmentSourceName: candidate.recruitmentSourceName,
          dockingHrName: latestInterview?.dockingHrName ?? null,
          dockingHrbpName: latestInterview?.dockingHrbpName ?? null,
          interviewOwnerName: deriveInterviewOwnerName(latestInterview),
      applicationStatusText: deriveApplicationStatusText(latestInterview),
          applicationStatus: resolveApplicationStatusCode(latestInterview?.statusRaw),
          checkInTime: latestInterview?.checkInTime ?? null,
          resumeStatus,
          interviewState,
          pipelineStage,
          lastActivityAt: deriveLastActivityAt(candidate, latestResume, latestInterview, latestImportTask),
        };
      }),
      total: countRow?.total ?? 0,
      page,
      pageSize,
    });
  }

  if (path === "/api/candidates" && request.method === "POST") {
    const body = await parseJson<{ name: string; phone?: string; email?: string; position?: string; yearsOfExperience?: number; source?: "local" | "remote" | "hybrid"; tags?: string[] }>(request);
    if (!body.name?.trim()) return fail("VALIDATION_ERROR", "name is required", 422);
    const id = `cand_${crypto.randomUUID()}`;
    const ts = Date.now();
    await db.insert(candidates).values({ id, source: body.source ?? "local", remoteId: null, name: body.name.trim(), phone: body.phone?.trim() ?? null, email: body.email?.trim() ?? null, position: body.position?.trim() ?? null, yearsOfExperience: body.yearsOfExperience ?? null, tagsJson: JSON.stringify(body.tags ?? []), createdAt: ts, updatedAt: ts });
    return ok({ id, source: body.source ?? "local", name: body.name.trim() }, { status: 201 });
  }

  // GET/PUT/DELETE /api/candidates/:id
  const candMatch = path.match(/^\/api\/candidates\/([^/]+)$/);
  if (candMatch && request.method === "GET") {
    const id = candMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);
    await ensureCandidateResumeAvailable(id);
    const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
    const resumeRows = await db.select().from(resumes).where(eq(resumes.candidateId, id));
    const interviewRows = await db.select().from(interviews).where(eq(interviews.candidateId, id)).orderBy(desc(interviews.scheduledAt));
    const artifactRows = await db.select().from(artifacts).where(eq(artifacts.candidateId, id)).orderBy(desc(artifacts.updatedAt));
    const [ws] = await db.select().from(candidateWorkspaces).where(eq(candidateWorkspaces.candidateId, id)).limit(1);
    return ok({ candidate: { ...row, tags: row.tagsJson ? JSON.parse(row.tagsJson) : [] }, resumes: resumeRows.map(r => ({ ...r, parsedData: r.parsedDataJson ? JSON.parse(r.parsedDataJson) : null })), interviews: interviewRows.map(i => ({ ...i, interviewerIds: i.interviewerIdsJson ? JSON.parse(i.interviewerIdsJson) : [], manualEvaluation: i.manualEvaluationJson ? JSON.parse(i.manualEvaluationJson) : null })), artifactsSummary: artifactRows, workspace: ws ? { id: ws.id, status: ws.workspaceStatus, lastAccessedAt: ws.lastAccessedAt } : null });
  }

  if (candMatch && request.method === "PUT") {
    const id = candMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);
    const body = await parseJson<Record<string, unknown>>(request);
    const allowed = ["position", "yearsOfExperience", "tags", "source"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of allowed) {
      if (key in body) updates[key === "tags" ? "tagsJson" : key] = key === "tags" ? JSON.stringify(body[key]) : body[key];
    }
    await db.update(candidates).set(updates as any).where(eq(candidates.id, id));
    const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
    return ok({ ...row, tags: row.tagsJson ? JSON.parse(row.tagsJson) : [] });
  }

  if (candMatch && request.method === "DELETE") {
    const id = candMatch[1];
    if (!(await candidateOrFail(id))) return fail("NOT_FOUND", "candidate not found", 404);
    await db.update(candidates).set({ deletedAt: Date.now() }).where(eq(candidates.id, id));
    return ok({ id, deletedAt: Date.now() });
  }

  // Resumes
  const resumeCandMatch = path.match(/^\/api\/candidates\/([^/]+)\/resumes$/);
  if (resumeCandMatch && request.method === "GET") {
    const cid = resumeCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db.select().from(resumes).where(eq(resumes.candidateId, cid));
    return ok({ items: rows.map(r => ({ ...r, parsedData: r.parsedDataJson ? JSON.parse(r.parsedDataJson) : null })) });
  }

  const resumeMatch = path.match(/^\/api\/resumes\/([^/]+)$/);
  if (resumeMatch && request.method === "GET") {
    const id = resumeMatch[1];
    const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "resume not found", 404);
    return ok({ ...row, parsedData: row.parsedDataJson ? JSON.parse(row.parsedDataJson) : null });
  }

  const resumePreviewMatch = path.match(/^\/api\/resumes\/([^/]+)\/preview$/);
  if (resumePreviewMatch && request.method === "GET") {
    const id = resumePreviewMatch[1];
    const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "resume not found", 404);

    const { statSync, existsSync } = await import("node:fs");
    if (!existsSync(row.filePath)) return fail("NOT_FOUND", "file not found on disk", 404);

    const contentType = resolveResumeContentType(row.fileType, row.fileName);
    if (!contentType) {
      return fail("UNSUPPORTED_MEDIA_TYPE", "resume preview is not supported for this file type", 415);
    }

    const stat = statSync(row.filePath);
    const file = Bun.file(row.filePath);
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": buildContentDisposition("inline", row.fileName),
        "Content-Length": String(stat.size),
        "Cache-Control": "no-store",
      },
    });
  }

  const resumeDownloadMatch = path.match(/^\/api\/resumes\/([^/]+)\/download$/);
  if (resumeDownloadMatch && request.method === "GET") {
    const id = resumeDownloadMatch[1];
    const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "resume not found", 404);
    const { statSync, existsSync } = await import("node:fs");
    if (!existsSync(row.filePath)) return fail("NOT_FOUND", "file not found on disk", 404);
    const stat = statSync(row.filePath);
    const file = Bun.file(row.filePath);
    const contentType = resolveResumeContentType(row.fileType, row.fileName) ?? "application/octet-stream";
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": buildContentDisposition("attachment", row.fileName),
        "Content-Length": String(stat.size),
      },
    });
  }

  // Interviews
  const intCandMatch = path.match(/^\/api\/candidates\/([^/]+)\/interviews$/);
  if (intCandMatch && request.method === "GET") {
    const cid = intCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db.select().from(interviews).where(eq(interviews.candidateId, cid)).orderBy(desc(interviews.scheduledAt));
    return ok({ items: rows.map(i => ({ ...i, interviewerIds: i.interviewerIdsJson ? JSON.parse(i.interviewerIdsJson) : [], manualEvaluation: i.manualEvaluationJson ? JSON.parse(i.manualEvaluationJson) : null })) });
  }

  if (intCandMatch && request.method === "POST") {
    const cid = intCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const body = await parseJson<{ round?: number; scheduledAt?: number; meetingLink?: string; interviewerIds?: string[] }>(request);
    const id = `int_${crypto.randomUUID()}`;
    const ts = Date.now();
    await db.insert(interviews).values({ id, candidateId: cid, remoteId: null, round: body.round ?? 1, status: "scheduled", scheduledAt: body.scheduledAt ?? null, meetingLink: body.meetingLink ?? null, interviewerIdsJson: JSON.stringify(body.interviewerIds ?? []), manualEvaluationJson: null, createdAt: ts, updatedAt: ts });
    return ok({ id, candidateId: cid }, { status: 201 });
  }

  const intMatch = path.match(/^\/api\/interviews\/([^/]+)$/);
  if (intMatch && request.method === "GET") {
    const [row] = await db.select().from(interviews).where(eq(interviews.id, intMatch[1])).limit(1);
    if (!row) return fail("NOT_FOUND", "interview not found", 404);
    return ok({ ...row, interviewerIds: row.interviewerIdsJson ? JSON.parse(row.interviewerIdsJson) : [], manualEvaluation: row.manualEvaluationJson ? JSON.parse(row.manualEvaluationJson) : null });
  }

  if (intMatch && request.method === "PUT") {
    const [existing] = await db.select().from(interviews).where(eq(interviews.id, intMatch[1])).limit(1);
    if (!existing) return fail("NOT_FOUND", "interview not found", 404);
    const body = await parseJson<Record<string, unknown>>(request);
    const allowed = ["status", "scheduledAt", "meetingLink", "manualEvaluation"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of allowed) {
      if (key in body) updates[key === "manualEvaluation" ? "manualEvaluationJson" : key] = key === "manualEvaluation" ? JSON.stringify(body[key]) : body[key];
    }
    await db.update(interviews).set(updates as any).where(eq(interviews.id, intMatch[1]));

    if ("manualEvaluation" in body && body.manualEvaluation) {
      await markInterviewFeedbackReceived(existing.candidateId);
    }

    const [row] = await db.select().from(interviews).where(eq(interviews.id, intMatch[1])).limit(1);
    return ok({ ...row, interviewerIds: row.interviewerIdsJson ? JSON.parse(row.interviewerIdsJson) : [], manualEvaluation: row.manualEvaluationJson ? JSON.parse(row.manualEvaluationJson) : null });
  }

  const baobaoScoreFormMatch = path.match(/^\/api\/interviews\/([^/]+)\/baobao-score-form$/);
  if (baobaoScoreFormMatch && request.method === "GET") {
    const interviewId = baobaoScoreFormMatch[1];
    const [localInterview] = await db.select().from(interviews).where(eq(interviews.id, interviewId)).limit(1);
    if (!localInterview) return fail("NOT_FOUND", "interview not found", 404);
    if (!localInterview.remoteId) return fail("REMOTE_SYNC_FAILED", "当前面试未关联抱抱记录", 422);

    const client = getBaobaoClient();
    if (!client) return fail("AUTH_EXPIRED", "抱抱登录已失效，请重新登录", 401);

    try {
      const [remoteInfoResponse, positionRanksResponse, interviewResultsResponse, eliminateReasonsResponse] = await Promise.all([
        client.getInterviewInfo(localInterview.remoteId),
        client.getAllPositionRank(),
        client.getDictByType("interview_result"),
        client.getDictByType("eliminate_reason"),
      ]);

      const P6_P8_PATTERN = /^P[6-8][+-]?$/;

      return ok({
        interview: {
          localInterviewId: localInterview.id,
          remoteInterviewId: localInterview.remoteId,
          candidateId: localInterview.candidateId,
          round: localInterview.round ?? null,
          name: remoteInfoResponse.data?.name ?? null,
          organizationName: remoteInfoResponse.data?.organizationName ?? null,
          applyPositionName: remoteInfoResponse.data?.applyPositionName ?? null,
          interviewTime: remoteInfoResponse.data?.interviewTime ?? localInterview.scheduledAt ?? null,
          interviewType: remoteInfoResponse.data?.interviewType ?? localInterview.interviewType ?? null,
          interviewPlace: remoteInfoResponse.data?.interviewPlace ?? localInterview.interviewPlace ?? null,
          interviewResult: remoteInfoResponse.data?.interviewResult ?? localInterview.interviewResult ?? null,
          interviewResultString: remoteInfoResponse.data?.interviewResultString ?? localInterview.interviewResultString ?? null,
          positionRank: remoteInfoResponse.data?.positionRank ?? null,
          interviewEvaluation: remoteInfoResponse.data?.interviewEvaluation ?? null,
          eliminateReasonIds: Array.isArray(remoteInfoResponse.data?.eliminateReason)
            ? remoteInfoResponse.data.eliminateReason.filter((item) => typeof item === "number" && Number.isFinite(item))
            : [],
        },
        interviewResults: (interviewResultsResponse.data ?? [])
          .filter((item) => typeof item.name === "string" && item.name.trim())
          .map((item) => ({
            value: Number(item.id),
            label: item.name.trim(),
            description: item.remark?.trim() || null,
          }))
          .filter((item) => Number.isFinite(item.value)),
        positionRanks: (positionRanksResponse.data ?? [])
          .filter((item) => typeof item === "string" && P6_P8_PATTERN.test(item))
          .map((item) => ({
            value: item,
            label: item,
          })),
        eliminateReasons: (eliminateReasonsResponse.data ?? [])
          .filter((item) => typeof item.name === "string" && item.name.trim())
          .map((item) => ({
            id: Number(item.id),
            name: item.name.trim(),
          }))
          .filter((item) => Number.isFinite(item.id)),
      });
    } catch (err) {
      if (isBaobaoAuthExpiredError(err)) {
        await markBaobaoAuthExpired();
        return fail("AUTH_EXPIRED", getErrorMessage(err), 401);
      }
      return fail("REMOTE_SYNC_FAILED", getErrorMessage(err), 502);
    }
  }

  const baobaoScoreUploadMatch = path.match(/^\/api\/interviews\/([^/]+)\/baobao-score-upload$/);
  if (baobaoScoreUploadMatch && request.method === "POST") {
    const interviewId = baobaoScoreUploadMatch[1];
    const [localInterview] = await db.select().from(interviews).where(eq(interviews.id, interviewId)).limit(1);
    if (!localInterview) return fail("NOT_FOUND", "interview not found", 404);
    if (!localInterview.remoteId) return fail("REMOTE_SYNC_FAILED", "当前面试未关联抱抱记录", 422);

    const body = await parseJson<{
      interviewEvaluation?: string;
      interviewResult?: number;
      interviewResultLabel?: string;
      positionRank?: string;
      eliminateReasonIds?: number[];
    }>(request);

    const interviewEvaluation = body.interviewEvaluation?.trim() ?? "";
    const positionRank = body.positionRank?.trim() ?? "";
    const interviewResult = typeof body.interviewResult === "number" ? body.interviewResult : null;
    const interviewResultLabel = body.interviewResultLabel?.trim() ?? "";
    const eliminateReasonIds = Array.isArray(body.eliminateReasonIds)
      ? body.eliminateReasonIds.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
      : [];

    if (!interviewEvaluation) return fail("VALIDATION_ERROR", "interviewEvaluation is required", 422);
    if (!positionRank) return fail("VALIDATION_ERROR", "positionRank is required", 422);
    if (!interviewResult) return fail("VALIDATION_ERROR", "interviewResult is required", 422);

    const B_OR_C_RESULT_IDS = [9, 10];
    if (B_OR_C_RESULT_IDS.includes(interviewResult) && eliminateReasonIds.length === 0) {
      return fail("VALIDATION_ERROR", "eliminateReasonIds is required when interviewResult is B or C", 422);
    }

    const client = getBaobaoClient();
    if (!client) return fail("AUTH_EXPIRED", "抱抱登录已失效，请重新登录", 401);

    try {
      const remoteInfoResponse = await client.getInterviewInfo(localInterview.remoteId);
      const remoteInfo = remoteInfoResponse.data;

      const saveResponse = await client.saveInterviewRecord({
        ...remoteInfo,
        interviewResult,
        positionRank,
        interviewEvaluation,
        eliminateReason: B_OR_C_RESULT_IDS.includes(interviewResult)
          ? eliminateReasonIds
          : (Array.isArray(remoteInfo.eliminateReason) ? remoteInfo.eliminateReason : null),
      });

      if (saveResponse.errno !== 0) {
        return fail("REMOTE_SYNC_FAILED", saveResponse.errmsg || "上传抱抱面试成绩失败", 502);
      }

      const existingManualEvaluation = localInterview.manualEvaluationJson ? JSON.parse(localInterview.manualEvaluationJson) : null;
      const nextManualEvaluation = {
        rating: typeof existingManualEvaluation?.rating === "number" ? existingManualEvaluation.rating : 0,
        decision: interviewResultLabel || existingManualEvaluation?.decision || "",
        comments: interviewEvaluation,
        eliminateReasonIds,
      };

      await db.update(interviews)
        .set({
          interviewResult,
          interviewResultString: interviewResultLabel || localInterview.interviewResultString,
          eliminateReasonString: eliminateReasonIds.length > 0 ? JSON.stringify(eliminateReasonIds) : null,
          manualEvaluationJson: JSON.stringify(nextManualEvaluation),
          updatedAt: Date.now(),
        })
        .where(eq(interviews.id, localInterview.id));

      await markInterviewFeedbackReceived(localInterview.candidateId);

      const [row] = await db.select().from(interviews).where(eq(interviews.id, localInterview.id)).limit(1);
      return ok({
        ...row,
        interviewerIds: row.interviewerIdsJson ? JSON.parse(row.interviewerIdsJson) : [],
        manualEvaluation: row.manualEvaluationJson ? JSON.parse(row.manualEvaluationJson) : null,
      });
    } catch (err) {
      if (isBaobaoAuthExpiredError(err)) {
        await markBaobaoAuthExpired();
        return fail("AUTH_EXPIRED", getErrorMessage(err), 401);
      }
      return fail("REMOTE_SYNC_FAILED", getErrorMessage(err), 502);
    }
  }

  // Workspace
  const wsMatch = path.match(/^\/api\/candidates\/([^/]+)\/workspace$/);
  if (wsMatch && (request.method === "POST" || request.method === "GET")) {
    const cid = wsMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const now = Date.now();
    const [existing] = await db.select().from(candidateWorkspaces).where(eq(candidateWorkspaces.candidateId, cid)).limit(1);

    if (existing) {
      await db.update(candidateWorkspaces)
        .set({ lastAccessedAt: now })
        .where(eq(candidateWorkspaces.id, existing.id));
      return ok({
        candidateId: cid,
        sessionId: existing.id,
        url: "",
        status: existing.workspaceStatus,
      });
    }

    const id = `ws_${crypto.randomUUID()}`;
    await db.insert(candidateWorkspaces).values({
      id,
      candidateId: cid,
      workspaceStatus: "inactive",
      lastAccessedAt: now,
      createdAt: now,
    });

    return ok({
      candidateId: cid,
      sessionId: id,
      url: "",
      status: "inactive",
    });
  }

  // Artifacts
  const artCandMatch = path.match(/^\/api\/candidates\/([^/]+)\/artifacts$/);
  if (artCandMatch && request.method === "GET") {
    const cid = artCandMatch[1];
    if (!(await candidateOrFail(cid))) return fail("NOT_FOUND", "candidate not found", 404);
    const rows = await db.select().from(artifacts).where(eq(artifacts.candidateId, cid)).orderBy(desc(artifacts.updatedAt));
    const items = await Promise.all(rows.map(async (a) => {
      const [latestVer] = await db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, a.id)).orderBy(desc(artifactVersions.version)).limit(1);
      return { ...a, latestVersion: latestVer ? { version: latestVer.version, feedbackText: latestVer.feedbackText, createdAt: latestVer.createdAt } : null };
    }));
    return ok({ items });
  }

  const artMatch = path.match(/^\/api\/artifacts\/([^/]+)$/);
  if (artMatch && request.method === "GET") {
    const [row] = await db.select().from(artifacts).where(eq(artifacts.id, artMatch[1])).limit(1);
    if (!row) return fail("NOT_FOUND", "artifact not found", 404);
    const versions = await db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, row.id)).orderBy(desc(artifactVersions.version));
    return ok({ artifact: row, versions });
  }

  if (artMatch && request.method === "POST") {
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, artMatch[1])).limit(1);
    if (!artifact) return fail("NOT_FOUND", "artifact not found", 404);
    const body = await parseJson<{ feedback: string }>(request);
    const newVersion = artifact.currentVersion + 1;
    const [latestVer] = await db.select().from(artifactVersions).where(eq(artifactVersions.artifactId, artifact.id)).orderBy(desc(artifactVersions.version)).limit(1);
    await db.insert(artifactVersions).values({ id: `ver_${crypto.randomUUID()}`, artifactId: artifact.id, version: newVersion, promptSnapshot: latestVer?.promptSnapshot ?? null, feedbackText: body.feedback, createdAt: Date.now() });
    await db.update(artifacts).set({ currentVersion: newVersion, updatedAt: Date.now() }).where(eq(artifacts.id, artifact.id));
    return ok({ artifactId: artifact.id, newVersion, status: "generating" }, { status: 202 });
  }

  // Import batches
  if (path === "/api/import/batches" && request.method === "GET") {
    const rows = await db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(50);
    const batchIds = rows.map((batch) => batch.id);
    const tasks = batchIds.length > 0
      ? await db.select().from(importFileTasks).where(inArray(importFileTasks.batchId, batchIds))
      : [];
    return ok({ items: attachImportBatchAnalysisSummary(rows, tasks) });
  }

  if (path === "/api/import/batches" && request.method === "POST") {
    const id = `batch_${crypto.randomUUID()}`;
    const ts = Date.now();
    const contentType = request.headers.get("content-type") ?? "";

    let autoScreen = false;
    let sourcePaths: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      autoScreen = sanitizeString(formData.get("autoScreen")) === "true";
      const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
      if (!files.length) return fail("VALIDATION_ERROR", "files is required and non-empty", 422);
      sourcePaths = await Promise.all(files.map((file) => saveImportUploadToLocal(id, file)));
    } else {
      const body = await parseJson<{ paths: string[]; autoScreen?: boolean }>(request);
      if (!body.paths?.length) return fail("VALIDATION_ERROR", "paths is required and non-empty", 422);
      autoScreen = body.autoScreen ?? false;
      sourcePaths = body.paths;
    }

    let preparedTasks;
    try {
      preparedTasks = await prepareImportTasks(id, sourcePaths);
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return fail("VALIDATION_ERROR", error.message, 422);
      }
      throw error;
    }
    const displayName = buildImportBatchDisplayName(sourcePaths, preparedTasks.length, ts);
    await db.insert(importBatches).values({ id, displayName, status: "processing", sourceType: null, currentStage: "processing", totalFiles: preparedTasks.length, processedFiles: 0, successFiles: 0, failedFiles: 0, autoScreen, createdAt: ts, startedAt: ts });
    const queuedTasks: Array<{ taskId: string; filePath: string; fileType: typeof preparedTasks[number]["fileType"] }> = [];
    for (const task of preparedTasks) {
      const taskId = `task_${crypto.randomUUID()}`;
      await db.insert(importFileTasks).values({ id: taskId, batchId: id, originalPath: task.originalPath, normalizedPath: task.normalizedPath, fileType: task.fileType, status: task.status, stage: task.status === "skipped" ? "classifying" : null, errorCode: task.errorCode, errorMessage: task.errorMessage, candidateId: null, resultJson: null, retryCount: 0, createdAt: ts, updatedAt: ts });
      if (task.status === "queued") {
        queuedTasks.push({
          taskId,
          filePath: task.normalizedPath ?? task.originalPath,
          fileType: task.fileType,
        });
      }
    }
    runImportBatchSerially(queuedTasks);
    await refreshBatchProgress(id);
    return ok({ id, displayName, status: "processing", totalFiles: preparedTasks.length, autoScreen, createdAt: ts }, { status: 201 });
  }

  const batchMatch = path.match(/^\/api\/import\/batches\/([^/]+)$/);
  const batchCancelMatch = path.match(/^\/api\/import\/batches\/([^/]+)\/cancel$/);
  const batchRetryMatch = path.match(/^\/api\/import\/batches\/([^/]+)\/retry-failed$/);
  const batchRerunScreeningMatch = path.match(/^\/api\/import\/batches\/([^/]+)\/rerun-screening$/);
  const fileRerunScreeningMatch = path.match(/^\/api\/import\/file-tasks\/([^/]+)\/rerun-screening$/);
  if (batchMatch && request.method === "GET") {
    const [row] = await db.select().from(importBatches).where(eq(importBatches.id, batchMatch[1])).limit(1);
    if (!row) return fail("NOT_FOUND", "batch not found", 404);
    const tasks = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchMatch[1]));
    return ok(attachImportBatchAnalysisSummary([row], tasks)[0]);
  }

   if (batchMatch && request.method === "DELETE") {
     const id = batchMatch[1];
     const [row] = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
     if (!row) return fail("NOT_FOUND", "batch not found", 404);
     if (row.status === "processing" || row.status === "queued") {
       return fail("BATCH_ACTIVE", "cannot delete active batch", 409);
     }
     await db.delete(importFileTasks).where(eq(importFileTasks.batchId, id));
     await db.delete(importBatches).where(eq(importBatches.id, id));
     return ok({ id, deleted: true });
   }

  const batchFilesMatch = path.match(/^\/api\/import\/batches\/([^/]+)\/files$/);
  if (batchFilesMatch && request.method === "GET") {
    const rows = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchFilesMatch[1])).orderBy(desc(importFileTasks.createdAt));
    return ok({ items: rows });
  }

  if (batchCancelMatch && request.method === "POST") {
    const id = batchCancelMatch[1];
    const [row] = await db.select({ id: importBatches.id }).from(importBatches).where(eq(importBatches.id, id)).limit(1);
    if (!row) return fail("NOT_FOUND", "batch not found", 404);
    await cancelImportBatch(id);
    return ok({ id, status: "cancelled" });
  }

  if (batchRetryMatch && request.method === "POST") {
    return ok({ retriedCount: 0 });
  }

  if (batchRerunScreeningMatch && request.method === "POST") {
    const id = batchRerunScreeningMatch[1];
    const kickoff = await startRerunImportBatchScreening(id);
    if (kickoff.notFound) return fail("NOT_FOUND", "batch not found", 404);
    if (kickoff.alreadyRunning) {
      return fail("BATCH_ACTIVE", "AI 初筛已在处理中", 409);
    }
    if (!kickoff.started) {
      return ok({ id, retriedCount: 0, status: kickoff.status });
    }

    void rerunImportBatchScreening(id).catch((error) => {
      console.error("[import] rerun batch screening failed", {
        batchId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return ok({ id, retriedCount: kickoff.retriedCount, status: "processing" });
  }

  if (fileRerunScreeningMatch && request.method === "POST") {
    const taskId = fileRerunScreeningMatch[1];
    const [task] = await db.select().from(importFileTasks).where(eq(importFileTasks.id, taskId)).limit(1);
    if (!task) return fail("NOT_FOUND", "task not found", 404);

    void rerunFileScreening(taskId).catch((error) => {
      console.error("[import] rerun file screening failed", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return ok({ taskId, retried: true, screeningStatus: "running" });
  }

  // Screening export
  if (path === "/api/screening/export" && request.method === "POST") {
    try {
      const body = await parseJson<ImportScreeningExportRequest>(request);
      if (!body?.mode) return fail("VALIDATION_ERROR", "mode is required", 422);
      if (!Array.isArray(body.batchIds)) return fail("VALIDATION_ERROR", "batchIds is required", 422);

      const { buffer, fileName, contentType } = await exportScreeningResults(body);
      const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, "_");
      const encodedFileName = encodeURIComponent(fileName);
      return new Response(Uint8Array.from(buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`,
          "Content-Length": String(buffer.length),
        },
      });
    } catch (err) {
      if (err instanceof ImportScreeningExportError) {
        return fail(err.code, err.message, err.status);
      }
      return fail("INTERNAL_ERROR", err instanceof Error ? err.message : "export failed", 500);
    }
  }

  // Share
  if (path === "/api/share/devices" && request.method === "GET") {
    const discovery = getDiscovery("Interview-Manager", config.port);
    const online = discovery.getDevices();
    return ok({ recentContacts: [], onlineDevices: online.map(d => ({ id: d.deviceId, name: d.deviceName, userName: d.deviceUserName, userDisplayName: d.deviceUserDisplayName, ip: d.ip, port: d.apiPort })) });
  }

  if (path === "/api/share/set-user-info" && request.method === "POST") {
    const body = await parseJson<{ userName?: string; displayName?: string }>(request);
    const discovery = getDiscovery("Interview-Manager", config.port);
    discovery.setLocalUserInfo(body.userName || "", body.displayName || body.userName || "");
    return ok({ status: "updated" });
  }

  if (path === "/api/share/discover/start" && request.method === "POST") {
    const discovery = getDiscovery("Interview-Manager", config.port);
    await discovery.startDiscovery();
    return ok({ status: "discovering" });
  }

  if (path === "/api/share/discover/stop" && request.method === "POST") {
    const discovery = getDiscovery("Interview-Manager", config.port);
    await discovery.stopDiscovery();
    return ok({ status: "stopped" });
  }

  if (path === "/api/share/export" && request.method === "POST") {
    const body = await parseJson<{ candidateId: string }>(request);
    if (!body.candidateId) return fail("VALIDATION_ERROR", "candidateId is required", 422);
    if (!(await candidateOrFail(body.candidateId))) return fail("NOT_FOUND", "candidate not found", 404);
    try {
      const { buffer, filename } = await exportCandidate(body.candidateId);
      const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_");
      const encodedFilename = encodeURIComponent(filename);
      return new Response(Uint8Array.from(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
          "Content-Length": String(buffer.length),
        },
      });
    } catch (err) { return fail("SHARE_EXPORT_FAILED", (err as Error).message, 500); }
  }

  if (path === "/api/share/send" && request.method === "POST") {
    const body = await parseJson<{
      candidateId?: string;
      candidateIds?: string[];
      target: { ip: string; port: number; deviceId?: string; name: string };
    }>(request);
    if (!body.target) return fail("VALIDATION_ERROR", "target is required", 422);

    // Normalize to array
    const candidateIds = body.candidateIds ?? (body.candidateId ? [body.candidateId] : []);
    if (!candidateIds.length) return fail("VALIDATION_ERROR", "candidateId or candidateIds is required", 422);

    // Validate all candidates exist
    const validIds: string[] = [];
    for (const id of candidateIds) {
      if (await candidateOrFail(id)) {
        validIds.push(id);
      }
    }
    if (!validIds.length) return fail("NOT_FOUND", "no valid candidates found", 404);

    // Send each candidate sequentially
    const results: Array<{ candidateId: string; recordId: string; status: string; error?: string; transferredAt: number | null }> = [];
    for (const cid of validIds) {
      try {
        const { buffer, filename } = await exportCandidate(cid);
        const result = await sendToDevice(cid, body.target as any, buffer, filename);
        results.push({
          candidateId: cid,
          recordId: result.recordId,
          status: result.success ? "success" : "failed",
          error: result.error,
          transferredAt: result.success ? Date.now() : null,
        });
      } catch (err) {
        results.push({ candidateId: cid, recordId: "", status: "failed", error: (err as Error).message, transferredAt: null });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    return ok({ total: results.length, successCount, results });
  }

  if (path === "/api/share/import" && request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";

    // Binary mode: receiving .imr file from another device
    if (contentType.includes("application/octet-stream") || contentType.includes("application/octet")) {
      try {
        const arrayBuffer = await request.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        const fileName = request.headers.get("x-filename") ?? `share-${Date.now()}.imr`;
        const tmpDir = join(config.dataDir, "import-uploads", "incoming");
        await ensureDir(tmpDir);
        const tmpPath = join(tmpDir, fileName);
        await writeFile(tmpPath, buffer);
        const result = await importIpmr(tmpPath);
        if (result.result === "failed") {
          return fail("SHARE_IMPORT_FAILED", result.error!, 422);
        }
        return ok(result);
      } catch (err) {
        return fail("SHARE_IMPORT_FAILED", (err as Error).message, 500);
      }
    }

    // JSON mode: local file path import
    const body = await parseJson<{ filePath: string }>(request);
    if (!body.filePath) return fail("VALIDATION_ERROR", "filePath is required", 422);
    const result = await importIpmr(body.filePath);
    if (result.result === "failed") return fail("SHARE_IMPORT_FAILED", result.error!, 422);
    return ok(result);
  }

  if (path === "/api/share/records" && request.method === "GET") {
    const rows = await db.select().from(shareRecords).orderBy(desc(shareRecords.createdAt)).limit(50);
    return ok({ items: rows.map(r => ({ ...r, targetDevice: r.targetDeviceJson ? JSON.parse(r.targetDeviceJson) : null })) });
  }

  // Notifications
  if (path === "/api/notifications" && request.method === "GET") {
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const filters = unreadOnly ? [isNull(notifications.readAt)] : [];
    const rows = await db.select().from(notifications).where(filters.length ? and(...filters) : undefined).orderBy(desc(notifications.createdAt)).limit(50);
    const unreadCount = (await db.select().from(notifications).where(isNull(notifications.readAt))).length;
    return ok({ items: rows, unreadCount });
  }

  const notifMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notifMatch && request.method === "POST") {
    await db.update(notifications).set({ readAt: Date.now() }).where(eq(notifications.id, notifMatch[1]));
    return ok({ id: notifMatch[1], readAt: Date.now() });
  }

  if (path === "/api/notifications/read-all" && request.method === "POST") {
    await db.update(notifications).set({ readAt: Date.now() }).where(isNull(notifications.readAt));
    return ok({ status: "ok" });
  }

  if (path === "/api/indicator" && request.method === "GET") {
    return ok({ status: "gray", reasons: ["idle"] });
  }

  // AI Chat (LUI)
  if (path === "/api/chat" && request.method === "POST") {
    try {
      const body = await parseJson<{ messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>; modelId?: string }>(request);
      
      const modelId = body.modelId || "gpt-4o";
      let provider: ReturnType<typeof createOpenAI>;
      
      // Create provider using OpenAI Compatible
      provider = createOpenAI({
        name: "custom",
        baseURL: normalizeOpenAIBaseURL(DEFAULT_OPENAI_COMPATIBLE_BASE_URL),
        apiKey: DEFAULT_OPENAI_COMPATIBLE_API_KEY,
      });
      
      const result = streamText({
        model: provider.chat(parseRuntimeModelName(modelId)),
        messages: body.messages,
        system: `You are a helpful AI assistant for an Interview Management System. 
You help recruiters manage candidates, schedule interviews, and analyze candidate information.
When appropriate, you can help with:
- Searching and filtering candidates
- Creating interview schedules
- Analyzing candidate resumes
- Generating candidate evaluation reports
Always be concise and helpful in your responses.`,
      });

      return result.toUIMessageStreamResponse();
    } catch (err) {
      return fail("AI_CHAT_ERROR", `Chat error: ${(err as Error).message}`, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // LUI - Conversations
  // ---------------------------------------------------------------------------

  // GET /api/lui/conversations - List conversations
  if (path === "/api/lui/conversations" && request.method === "GET") {
    const availableAgents = await listAvailableConversationAgents();
    const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    return ok({ items: rows.map((row) => serializeConversation(row, availableAgents)) });
  }

  // POST /api/lui/conversations - Create conversation
  if (path === "/api/lui/conversations" && request.method === "POST") {
    const body = await parseJson<{
      title?: string;
      candidateId?: string;
      agentId?: string | null;
      modelProvider?: string | null;
      modelId?: string | null;
      temperature?: number | null;
    }>(request);
    const now = new Date();
    const id = `conv_${crypto.randomUUID()}`;
    const normalizedTitle = body.title?.trim();
    const title = normalizedTitle || `新会话 ${Date.now()}`;
    const candidateId = body.candidateId?.trim() || null;
    if (candidateId && !(await candidateOrFail(candidateId))) {
      return fail("NOT_FOUND", "candidate not found", 404);
    }
    const agentId = body.agentId?.trim() || (candidateId ? DEFAULT_INTERVIEW_AGENT_ID : null);
    const modelProvider = body.modelProvider?.trim() || null;
    const modelId = body.modelId?.trim() || null;
    const temperature = typeof body.temperature === "number" ? body.temperature : null;
    await db.insert(conversations).values({
      id,
      title: normalizedTitle || "新会话",
      candidateId,
      agentId,
      modelProvider,
      modelId,
      temperature,
      createdAt: now,
      updatedAt: now,
    });
    const availableAgents = await listAvailableConversationAgents();
    return ok({
      ...serializeConversation({
        id,
        title,
        candidateId,
        agentId,
        modelProvider,
        modelId,
        temperature,
        createdAt: now,
        updatedAt: now,
      }, availableAgents),
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    }, { status: 201 });
  }

  // GET /api/lui/conversations/:id - Get conversation with messages and files
  const convMatch = path.match(/^\/api\/lui\/conversations\/([^/]+)$/);
  if (convMatch && request.method === "GET") {
    const availableAgents = await listAvailableConversationAgents();
    const id = convMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    if (conv.candidateId) {
      await syncCandidateResumesToConversation(conv.id, conv.candidateId);
    }

    // Get candidate info if associated
    let candidateInfo: { id: string; name: string; position: string | null } | null = null;
    if (conv.candidateId) {
      const [cand] = await db
        .select({ id: candidates.id, name: candidates.name, position: candidates.position })
        .from(candidates)
        .where(eq(candidates.id, conv.candidateId))
        .limit(1);
      if (cand) {
        candidateInfo = { id: cand.id, name: cand.name, position: cand.position ?? null };
      }
    }

    const messageRows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    const fileRows = await db.select().from(fileResources).where(eq(fileResources.conversationId, id)).orderBy(desc(fileResources.createdAt));
    const workflow = conv.candidateId ? await getWorkflowByCandidate(conv.candidateId, id) : null;
    const workflowView = workflow ? toWorkflowView(workflow) : null;

    if (workflowView) {
      const fileIdByName = new Map(fileRows.map((file) => [file.name, file.id]));
      workflowView.artifacts = workflowView.artifacts.map((artifact: typeof workflowView.artifacts[number]) => ({
        ...artifact,
        fileResourceId: fileIdByName.get(artifact.fileName) ?? null,
      }));
    }

    return ok({
      conversation: serializeConversation(conv, availableAgents),
      candidate: candidateInfo,
      messages: messageRows.map(serializeMessageData),
      files: fileRows,
      workflow: workflowView,
    });
  }

  // DELETE /api/lui/conversations/:id - Delete conversation
  if (convMatch && request.method === "DELETE") {
    const id = convMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    await db.delete(luiWorkflows).where(eq(luiWorkflows.conversationId, id));

    // Delete associated messages and files first
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(fileResources).where(eq(fileResources.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));

    return ok({ id });
  }

  // PUT /api/lui/conversations/:id - Update conversation metadata
  if (convMatch && request.method === "PUT") {
    const availableAgents = await listAvailableConversationAgents();
    const id = convMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    const body = await parseJson<{
      title?: string;
      candidateId?: string | null;
      agentId?: string | null;
      modelProvider?: string | null;
      modelId?: string | null;
      temperature?: number | null;
    }>(request);
    if (body.candidateId) {
      const [candidate] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, body.candidateId)).limit(1);
      if (!candidate) return fail("NOT_FOUND", "candidate not found", 404);
    }

    const nextUpdatedAt = new Date();
    const updates: Partial<typeof conversations.$inferInsert> = {
      updatedAt: nextUpdatedAt,
    };

    if (body.title !== undefined) {
      updates.title = body.title.trim() || conv.title;
    }
    if (body.candidateId !== undefined) {
      updates.candidateId = body.candidateId || null;
    }
    if (body.agentId !== undefined) {
      updates.agentId = body.agentId?.trim() || null;
    }
    if (body.modelProvider !== undefined) {
      updates.modelProvider = body.modelProvider?.trim() || null;
    }
    if (body.modelId !== undefined) {
      updates.modelId = body.modelId?.trim() || null;
    }
    if (body.temperature !== undefined) {
      updates.temperature = typeof body.temperature === "number" ? body.temperature : null;
    }

    await db.update(conversations).set(updates).where(eq(conversations.id, id));

    const [updated] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!updated) return fail("NOT_FOUND", "conversation not found", 404);

    return ok(serializeConversation(updated, availableAgents));
  }

  // ---------------------------------------------------------------------------
  // LUI - Messages (Streaming)
  // ---------------------------------------------------------------------------

  // POST /api/lui/conversations/:id/messages - Send message with streaming response
  const msgMatch = path.match(/^\/api\/lui\/conversations\/([^/]+)\/messages$/);
  if (msgMatch && request.method === "POST") {
    const convId = msgMatch[1];
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
    if (!conv) return fail("NOT_FOUND", "conversation not found", 404);

    const body = await parseJson<{
      content: string;
      fileIds?: string[];
      agentId?: string;
      modelProvider?: string;
      modelId?: string;
      customModelName?: string;
      endpointBaseURL?: string;
      endpointApiKey?: string;
      temperature?: number;
    }>(request);
    if (!body.content?.trim()) return fail("VALIDATION_ERROR", "content is required", 422);
    const trimmedContent = body.content.trim();

    const convConfigUpdates: Partial<typeof conversations.$inferInsert> = {};
    if (body.agentId !== undefined) {
      convConfigUpdates.agentId = body.agentId?.trim() || null;
    }
    if (body.modelId !== undefined) {
      convConfigUpdates.modelId = body.modelId?.trim() || null;
    }
    if (body.modelProvider !== undefined) {
      convConfigUpdates.modelProvider = body.modelProvider?.trim() || null;
    }
    if (body.temperature !== undefined) {
      convConfigUpdates.temperature = body.temperature;
    }
    if (Object.keys(convConfigUpdates).length > 0) {
      await db
        .update(conversations)
        .set({ ...convConfigUpdates, updatedAt: new Date() })
        .where(eq(conversations.id, convId));
    }

    // Save user message
    const now = new Date();
    const msgId = `msg_${crypto.randomUUID()}`;
    await db.insert(messages).values({
      id: msgId,
      conversationId: convId,
      role: "user",
      content: trimmedContent,
      status: "complete",
      createdAt: now,
    });

    // Update conversation timestamp
    await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, convId));

    // Build AI response using streamText
    const historyRows = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(messages.createdAt);

    // Get agent configuration if specified
    let systemPrompt = `You are a helpful AI assistant for an Interview Management System.
You help recruiters manage candidates, schedule interviews, and analyze candidate information.
When appropriate, you can help with:
- Searching and filtering candidates
- Creating interview schedules
- Analyzing candidate resumes
- Generating candidate evaluation reports
Always be concise and helpful in your responses.`;
    let temperature = body.temperature ?? conv.temperature ?? 0.5;

    // Check if agent is in workflow mode
    let isWorkflowMode = false;
    let workflowEngine: "builtin" | "deepagents" = "builtin";
    let workflowAgentName: string | undefined;
    let allowedToolNames: string[] | undefined;
    let agentSystemPrompt: string | null = null;
    const effectiveAgentId = body.agentId?.trim() || conv.agentId || (conv.candidateId ? DEFAULT_INTERVIEW_AGENT_ID : null);
    if (effectiveAgentId && conv.agentId !== effectiveAgentId) {
      await db.update(conversations)
        .set({ agentId: effectiveAgentId, updatedAt: new Date() })
        .where(eq(conversations.id, convId));
      conv.agentId = effectiveAgentId;
    }

    if (effectiveAgentId) {
      const executionConfig = await getResolvedAgentExecutionConfig(effectiveAgentId);
      if (executionConfig) {
        const agent = executionConfig.agent;
        const agentContract = resolveAgentContract({
          id: agent.id,
          name: agent.name,
          sceneAffinity: agent.sceneAffinity,
          mode: agent.mode,
        });
        allowedToolNames = executionConfig.toolNames;
        agentSystemPrompt = executionConfig.systemPrompt;
        if (executionConfig.systemPrompt) {
          systemPrompt = executionConfig.systemPrompt;
        }
        if (agent.temperature !== undefined && agent.temperature !== null) {
          temperature = agent.temperature;
        }
        // Check if this is a workflow agent
        isWorkflowMode = agent.mode === "workflow";
        workflowEngine = agent.engine === "deepagents" ? "deepagents" : "builtin";
        workflowAgentName = agent.name;

        systemPrompt = `${systemPrompt}${buildAgentToolConstraints(agent.name, allowedToolNames)}`;

        if (isWorkflowMode && conv.candidateId) {
          const workflow = await getOrCreateWorkflow(conv.candidateId, convId);
          const contractPromptSegment = buildAgentContractPromptSegment(agentContract, workflow.currentStage);
          if (contractPromptSegment) {
            systemPrompt = `${systemPrompt}\n\n${contractPromptSegment}`;
            agentSystemPrompt = `${agentSystemPrompt ?? executionConfig.systemPrompt ?? ""}\n\n${contractPromptSegment}`.trim();
          }

          const guardResult = guardAgentUserMessage({
            rawContent: trimmedContent,
            workflowStage: workflow.currentStage,
            contract: agentContract,
          });

          if (guardResult.kind === "clarify" || guardResult.kind === "reject") {
            await createCompletedAssistantReply(convId, guardResult.reply);
            await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));
            return createStaticLuiStreamResponse(guardResult.reply.replace(/<!--\s*workflow-action:[^>]+-->/g, "").trim());
          }
        }
      }
    }

    if (isWorkflowMode && conv.candidateId) {
      const workflow = await getOrCreateWorkflow(conv.candidateId, convId);
      const requiresRoundConfirmation = workflow.currentStage === "S1" && typeof workflow.stageData?.round !== "number";
      const directRound = requiresRoundConfirmation ? detectRoundConfirmation(trimmedContent) : null;

      if (requiresRoundConfirmation && directRound) {
        await confirmWorkflowRound(workflow.id, directRound);
        const receipt = buildWorkflowConfirmationReceipt({
          type: "round",
          round: directRound,
          currentStage: workflow.currentStage,
        });
        await createCompletedAssistantReply(convId, receipt);
        await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));
        return createStaticLuiStreamResponse(receipt);
      }

      if (requiresRoundConfirmation) {
        const guidance = buildWorkflowConfirmationGuidance(workflow);
        await createCompletedAssistantReply(convId, guidance);
        await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));
        return createStaticLuiStreamResponse(guidance.replace(/<!--\s*workflow-action:[^>]+-->/g, "").trim());
      }
    }

    const modelProvider = body.modelProvider?.trim() || conv.modelProvider || null;
    const modelId = body.modelId?.trim() || conv.modelId || null;
    if (!modelId) {
      return fail("VALIDATION_ERROR", "modelId is required", 422);
    }

    // Load user's custom endpoints to resolve configuration
    const user = await getOrCreateLocalUser();
    const settings = user ? parseUserSettings(user.settingsJson) : {};
    const luiSettings = extractLuiSettings(settings);

    // Find matching custom endpoint by providerId or gateway id
    const matchingEndpoint = modelProvider
      ? luiSettings.customEndpoints.find((ep) =>
          ep.providerId === modelProvider ||
          (modelProvider.startsWith("gateway:") && ep.id === modelProvider.slice("gateway:".length))
        )
      : null;

    let resolvedBaseURL: string;
    let resolvedApiKey: string;

    if (modelProvider?.startsWith("gateway:")) {
      if (!body.endpointBaseURL?.trim() && !matchingEndpoint?.baseURL) {
        return fail("VALIDATION_ERROR", "endpointBaseURL is required for custom gateway provider", 422);
      }
      resolvedBaseURL = body.endpointBaseURL?.trim() || matchingEndpoint?.baseURL || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
      resolvedApiKey = body.endpointApiKey?.trim() || matchingEndpoint?.apiKey || "";
    } else if (matchingEndpoint?.providerId) {
      const presetProvider = getPresetProvider(matchingEndpoint.providerId);
      resolvedBaseURL = presetProvider?.baseURL || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
      resolvedApiKey = matchingEndpoint.apiKey || "";
    } else {
      resolvedBaseURL = DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
      resolvedApiKey = DEFAULT_OPENAI_COMPATIBLE_API_KEY;
    }

    let actualModelName = parseRuntimeModelName(modelId);
    if (actualModelName === "__manual__") {
      const customModelName = body.customModelName?.trim();
      if (!customModelName) {
        return fail("VALIDATION_ERROR", "customModelName is required when using manual model selection", 422);
      }
      actualModelName = customModelName;
    }

    // Route to workflow orchestrator if in workflow mode
    if (isWorkflowMode && conv.candidateId) {
      const workflowModelProvider = typeof modelProvider === "string" ? modelProvider : undefined;
      const workflowResponse = await executeWorkflowAgent(convId, body.content.trim(), {
        agentId: body.agentId,
        agentName: workflowAgentName,
        engine: workflowEngine,
        candidateId: conv.candidateId,
        modelProvider: workflowModelProvider,
        modelId,
        runtimeModelName: actualModelName,
        endpointBaseURL: resolvedBaseURL,
        endpointApiKey: resolvedApiKey,
        temperature,
        allowedToolNames,
        agentSystemPrompt,
      });
      return workflowResponse;
    }

    if (conv.candidateId) {
      const resumeSync = await ensureCandidateResumeAvailable(conv.candidateId);
      await syncCandidateResumesToConversation(conv.id, conv.candidateId);
      const candidateContext = await buildCandidateContext(conv.candidateId);
      if (candidateContext) {
        const contextPrompt = `\n\n## Candidate Context\nYou are currently helping with candidate: ${candidateContext.candidateName}.\n${formatCandidateContextForPrompt(candidateContext)}`;
        systemPrompt = `${systemPrompt}\n${contextPrompt}\n\nWhen answering questions about this candidate, use the context above. Be specific and reference the candidate's information in your responses.`;
      }
      if (resumeSync.status === "imported") {
        systemPrompt = `${systemPrompt}\n\nA missing remote resume was automatically downloaded before this response. If the user asks for resume analysis, start from the initial screening stage.`;
      }
    }

    const historyMessages = historyRows.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const provider = createOpenAI({
      name: modelProvider || "default-openai-compatible",
      baseURL: normalizeOpenAIBaseURL(resolvedBaseURL),
      apiKey: resolvedApiKey,
    });

    const toolContext: ToolContext = {
      directory: config.dataDir || process.cwd(),
      candidateId: conv.candidateId ?? undefined,
    };
    const runtimeTools = getWorkflowTools(toolContext, allowedToolNames);
    const enabledTools = Object.keys(runtimeTools).length > 0 ? runtimeTools : undefined;

    const assistantMessageId = await messageService.createAssistantStreamingMessage(convId);
    const assistantPersistence = messageService.createAssistantStreamPersistenceHandlers(assistantMessageId);

    const result = streamText({
      model: provider.chat(actualModelName),
      messages: historyMessages,
      system: systemPrompt,
      temperature,
      tools: enabledTools,
      onChunk: assistantPersistence.onChunk,
      onError: assistantPersistence.onError,
    });

    return result.toUIMessageStreamResponse({
      onFinish: assistantPersistence.onFinish,
    });
  }

  // ---------------------------------------------------------------------------
  // LUI - Agents
  // ---------------------------------------------------------------------------

  // GET /api/lui/agents - List all agents
  if (path === "/api/lui/agents" && request.method === "GET") {
    return ok({ items: await listResolvedAgents() });
  }

  // POST /api/lui/agents - Create agent
  if (path === "/api/lui/agents" && request.method === "POST") {
    const body = await parseJson<{
      name?: string;
      displayName?: string;
      description?: string;
      mode?: string;
      engine?: "builtin" | "deepagents";
      temperature?: number;
      systemPrompt?: string;
      tools?: string[];
      isDefault?: boolean;
      sceneAffinity?: "general" | "interview";
    }>(request);

    const displayName = body.displayName?.trim() || body.name?.trim() || "";

    if (!displayName) return fail("VALIDATION_ERROR", "displayName is required", 422);

    const now = new Date();
    const id = `agent_${crypto.randomUUID()}`;

    await db.insert(agents).values({
      id,
      name: displayName,
      description: body.description || null,
      sourceType: "custom",
      isMutable: true,
      sceneAffinity: body.sceneAffinity ?? "general",
      mode: (body.mode as "all" | "chat" | "ask" | "workflow") || "chat",
      engine: parseAgentEngine(body.engine),
      temperature: body.temperature ?? 0,
      systemPrompt: body.systemPrompt || null,
      toolsJson: body.tools ? JSON.stringify(body.tools) : null,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    if (body.isDefault) {
      await setDefaultAgent(id, now);
    }

    const [created] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);

    return ok(serializeAgent(created), { status: 201 });
  }

  // GET /api/lui/agents/:id - Get agent
  const agentMatch = path.match(/^\/api\/lui\/agents\/([^/]+)$/);
  if (agentMatch && request.method === "GET") {
    const id = agentMatch[1];
    const agent = await getResolvedAgent(id);
    if (!agent) return fail("NOT_FOUND", "agent not found", 404);
    return ok(agent);
  }

  // PUT /api/lui/agents/:id - Update agent
  if (agentMatch && request.method === "PUT") {
    await ensureManagedAgents();
    const id = agentMatch[1];
    const [existing] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!existing) return fail("NOT_FOUND", "agent not found", 404);

    const body = await parseJson<{
      name?: string;
      displayName?: string;
      description?: string;
      mode?: string;
      engine?: "builtin" | "deepagents";
      temperature?: number;
      systemPrompt?: string;
      tools?: string[];
      isDefault?: boolean;
      sceneAffinity?: "general" | "interview";
    }>(request);

    const now = new Date();

    if ((body.displayName !== undefined || body.name !== undefined) && !(body.displayName?.trim() || body.name?.trim())) {
      return fail("VALIDATION_ERROR", "displayName cannot be empty", 422);
    }

    if (existing.isMutable === false && (body.description !== undefined
      || body.mode !== undefined
      || body.engine !== undefined
      || body.temperature !== undefined
      || body.systemPrompt !== undefined
      || body.tools !== undefined
      || body.displayName !== undefined
      || body.name !== undefined || body.sceneAffinity !== undefined)) {
      return fail("VALIDATION_ERROR", "builtin agent lifecycle is immutable", 422);
    }

    // Check for duplicate name among custom agents (non-protected)
    const newName = (body.displayName?.trim() || body.name?.trim());
    if (newName && newName !== existing.name) {
      const [existingWithName] = await db.select().from(agents).where(eq(agents.name, newName)).limit(1);
      if (existingWithName && existingWithName.id !== id) {
        return fail("DUPLICATE_NAME", `Agent with name "${newName}" already exists`, 409);
      }
    }

    const updates: Record<string, unknown> = { updatedAt: now };
    const displayName = body.displayName?.trim() || body.name?.trim();
    if (displayName !== undefined) updates.name = displayName;
    if (body.description !== undefined) updates.description = body.description;
    if (body.mode !== undefined) updates.mode = body.mode;
    if (body.engine !== undefined) updates.engine = parseAgentEngine(body.engine);
    if (body.temperature !== undefined) updates.temperature = body.temperature;
    if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
    if (body.tools !== undefined) updates.toolsJson = JSON.stringify(body.tools);
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;
    if (body.sceneAffinity !== undefined) updates.sceneAffinity = body.sceneAffinity;

    await db.update(agents).set(updates).where(eq(agents.id, id));

    if (body.isDefault === true) {
      await setDefaultAgent(id, now);
    } else if (body.isDefault === false && existing.isDefault) {
      await setDefaultAgent("agent_builtin_interview", now);
    }

    const [updated] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    return ok(serializeAgent(updated));
  }

  // DELETE /api/lui/agents/:id - Delete agent
  if (agentMatch && request.method === "DELETE") {
    const id = agentMatch[1];
    const [existing] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!existing) return fail("NOT_FOUND", "agent not found", 404);
    if (isProtectedAgent(existing)) {
      return fail("VALIDATION_ERROR", "builtin agents cannot be deleted", 422);
    }

    await deleteAgentWithFallback(existing);
    return ok({ id });
  }

  // GET /api/lui/providers - List available preset providers
  if (path === "/api/lui/providers" && request.method === "GET") {
    return ok({ providers: getPresetProviderList() });
  }

  // GET|POST /api/lui/models - List available AI models (including custom endpoint discovery)
  if (path === "/api/lui/models" && (request.method === "GET" || request.method === "POST")) {
    let customConfig: CustomModelDiscoveryConfig = {};

    if (request.method === "GET") {
      customConfig = {
        providerId: url.searchParams.get("providerId")?.trim() || undefined,
        baseURL: url.searchParams.get("baseURL")?.trim() || undefined,
        apiKey: url.searchParams.get("apiKey")?.trim() || undefined,
        provider: url.searchParams.get("provider")?.trim() || undefined,
      };
    } else {
      try {
        const body = await parseJson<CustomModelDiscoveryConfig>(request);
        customConfig = {
          providerId: body.providerId?.trim() || undefined,
          baseURL: body.baseURL?.trim() || undefined,
          apiKey: body.apiKey?.trim() || undefined,
          provider: body.provider?.trim() || undefined,
          strict: body.strict === true,
        };
      } catch {
        return fail("VALIDATION_ERROR", "invalid json body", 422);
      }
    }

    // If providerId is specified, use preset provider logic
    if (customConfig.providerId) {
      const presetProvider = getPresetProvider(customConfig.providerId);
      if (presetProvider) {
        const modelsResult = await fetchPresetProviderModels(
          customConfig.providerId,
          customConfig.apiKey,
        );
        if (customConfig.strict && modelsResult.errorMessage) {
          return fail("REMOTE_SYNC_FAILED", modelsResult.errorMessage, 502);
        }
        return ok({
          providers: [{
            id: presetProvider.id,
            name: presetProvider.name,
            icon: presetProvider.icon,
            models: modelsResult.models.map(({ runtimeModel: _runtimeModel, ...model }) => model),
          }],
        });
      }
    }

    // Legacy: if baseURL is provided, use custom endpoint discovery
    if (customConfig.baseURL?.trim()) {
      const customModelsResult = await fetchOpenAiCompatibleModels(customConfig);
      if (customConfig.strict && customModelsResult.errorMessage) {
        return fail("REMOTE_SYNC_FAILED", customModelsResult.errorMessage, 502);
      }
      const customProviderName = customConfig.provider?.trim() || "Custom OpenAI Compatible";
      const customProviderId = customConfig.providerId?.trim() || normalizeProviderId(customProviderName);
      return ok({
        providers: [{
          id: customProviderId,
          name: customProviderName,
          icon: "OpenAI",
          models: customModelsResult.models.map(({ runtimeModel: _runtimeModel, ...model }) => model),
        }],
      });
    }

    return ok({ providers: LUI_MODEL_PROVIDERS_RESPONSE });
  }

  if (path === "/api/lui/settings" && request.method === "GET") {
    const user = await getOrCreateLocalUser();
    const settings = user ? parseUserSettings(user.settingsJson) : {};
    return ok(extractLuiSettings(settings));
  }

  if (path === "/api/lui/settings" && request.method === "PUT") {
    let body: { customEndpoints?: unknown; defaultEndpointId?: unknown };
    try {
      body = await parseJson<{ customEndpoints?: unknown }>(request);
    } catch {
      return fail("VALIDATION_ERROR", "invalid json body", 422);
    }

    const customEndpoints = Array.isArray(body.customEndpoints)
      ? body.customEndpoints
          .map(normalizeGatewayEndpoint)
          .filter((endpoint): endpoint is LuiGatewayEndpoint => endpoint !== null)
      : [];

    const requestedDefaultEndpointId = typeof body.defaultEndpointId === "string"
      ? body.defaultEndpointId.trim()
      : "";
    const defaultEndpointId = requestedDefaultEndpointId && customEndpoints.some((endpoint) => endpoint.id === requestedDefaultEndpointId)
      ? requestedDefaultEndpointId
      : null;

    const user = await getOrCreateLocalUser();
    if (!user) {
      return fail("INTERNAL_ERROR", "failed to initialize local user", 500);
    }

    const existingSettings = parseUserSettings(user.settingsJson);
    const nextLuiSettings = { customEndpoints, defaultEndpointId };
    const nextSettings = mergeLuiSettings(existingSettings, nextLuiSettings);

    await db.update(users)
      .set({ settingsJson: JSON.stringify(nextSettings) })
      .where(eq(users.id, user.id));

    return ok(nextLuiSettings);
  }

  // ---------------------------------------------------------------------------
  // LUI - Provider Credentials
  // ---------------------------------------------------------------------------

  const credentialStatusMatch = path.match(/^\/api\/lui\/credentials\/([^/]+)\/status$/);
  if (credentialStatusMatch && request.method === "GET") {
    const provider = credentialStatusMatch[1].trim();
    if (!provider) return fail("VALIDATION_ERROR", "provider is required", 422);

    const row = await db
      .select({ id: providerCredentials.id })
      .from(providerCredentials)
      .where(eq(providerCredentials.provider, provider))
      .limit(1);

    return ok({ provider, isAuthorized: row.length > 0 });
  }

  const credentialMatch = path.match(/^\/api\/lui\/credentials\/([^/]+)$/);
  if (credentialMatch && request.method === "PUT") {
    const provider = credentialMatch[1].trim();
    if (!provider) return fail("VALIDATION_ERROR", "provider is required", 422);

    const body = await parseJson<{ apiKey: string }>(request);
    const apiKey = body.apiKey?.trim();
    if (!apiKey || apiKey.length < 10) {
      return fail("VALIDATION_ERROR", "apiKey is invalid", 422);
    }

    const now = Date.now();
    await db
      .insert(providerCredentials)
      .values({
        id: `cred_${crypto.randomUUID()}`,
        provider,
        apiKey,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: providerCredentials.provider,
        set: {
          apiKey,
          updatedAt: now,
        },
      });

    return ok({ provider, isAuthorized: true });
  }

  if (credentialMatch && request.method === "DELETE") {
    const provider = credentialMatch[1].trim();
    if (!provider) return fail("VALIDATION_ERROR", "provider is required", 422);

    await db.delete(providerCredentials).where(eq(providerCredentials.provider, provider));
    return ok({ provider, isAuthorized: false });
  }

  // POST /api/lui/generate-title - Generate conversation title from message content
  if (path === "/api/lui/generate-title" && request.method === "POST") {
    const body = await parseJson<{
      content: string;
      modelId?: string;
      modelProvider?: string;
    }>(request);
    if (!body.content?.trim()) {
      return fail("VALIDATION_ERROR", "content is required", 422);
    }

    try {
      const provider = createOpenAI({
        name: "title-generator",
        baseURL: normalizeOpenAIBaseURL(DEFAULT_OPENAI_COMPATIBLE_BASE_URL),
        apiKey: DEFAULT_OPENAI_COMPATIBLE_API_KEY,
      });

      const result = streamText({
        model: provider.chat("gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content: `你是一个会话标题生成助手。请根据用户的第一条消息，生成一个简洁、准确的会话标题（10-20字）。
标题应该概括消息的主要内容或意图。
只返回标题文本，不要有任何其他说明、引号或格式。`,
          },
          {
            role: "user",
            content: `请为以下消息生成标题：\n\n${body.content.trim().slice(0, 500)}`,
          },
        ],
        temperature: 0.3,
      });

      return result.toUIMessageStreamResponse();
    } catch (err) {
      console.error("[generate-title] Error:", err);
      // Return a default title on error
      return ok({ title: body.content.trim().slice(0, 20) + (body.content.length > 20 ? "..." : "") });
    }
  }

  // ---------------------------------------------------------------------------
  // LUI - Agent Execute (Workflow Mode)
  // ---------------------------------------------------------------------------

  // POST /api/lui/agents/:id/execute - Execute agent with workflow orchestration
  const agentExecuteMatch = path.match(/^\/api\/lui\/agents\/([^/]+)\/execute$/);
  if (agentExecuteMatch && request.method === "POST") {
    const agentId = agentExecuteMatch[1];
    const body = await parseJson<{
      conversationId: string;
      message: string;
      candidateId?: string;
      modelProvider?: string;
      modelId?: string;
      endpointBaseURL?: string;
      endpointApiKey?: string;
      temperature?: number;
    }>(request);

    if (!body.conversationId) {
      return fail("VALIDATION_ERROR", "conversationId is required", 422);
    }
    if (!body.message?.trim()) {
      return fail("VALIDATION_ERROR", "message is required", 422);
    }

    try {
      const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      if (!agent) {
        return fail("NOT_FOUND", "agent not found", 404);
      }

      const executionOptions = {
        candidateId: body.candidateId,
        modelProvider: body.modelProvider,
        modelId: body.modelId,
        runtimeModelName: body.modelId ? parseRuntimeModelName(body.modelId) : undefined,
        endpointBaseURL: body.endpointBaseURL,
        endpointApiKey: body.endpointApiKey,
        temperature: body.temperature,
        allowedToolNames: parseAgentTools(agent.toolsJson),
        agentSystemPrompt: agent.systemPrompt,
      };

      if (agent.mode === "workflow") {
        const response = await executeWorkflowAgent(body.conversationId, body.message.trim(), {
          agentId,
          agentName: agent.name,
          engine: agent.engine === "deepagents" ? "deepagents" : "builtin",
          ...executionOptions,
        });

        return response;
      }

      const response = agent.engine === "deepagents"
        ? await executeDeepAgent(body.conversationId, body.message.trim(), {
            agentName: agent.name,
            ...executionOptions,
          })
        : await executeAgent(body.conversationId, body.message.trim(), {
            agentId,
            ...executionOptions,
          });

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail("AGENT_EXECUTION_ERROR", message, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // LUI - Workflows
  // ---------------------------------------------------------------------------

  // GET /api/lui/workflows - List workflows
  if (path === "/api/lui/workflows" && request.method === "GET") {
    const candidateId = url.searchParams.get("candidateId");
    if (candidateId) {
      const workflows = await listCandidateWorkflows(candidateId);
      return ok({ items: workflows });
    }
    return ok({ items: [] });
  }

  // POST /api/lui/workflows - Create workflow
  if (path === "/api/lui/workflows" && request.method === "POST") {
    const body = await parseJson<{
      candidateId: string;
      conversationId: string;
    }>(request);

    if (!body.candidateId) {
      return fail("VALIDATION_ERROR", "candidateId is required", 422);
    }
    if (!body.conversationId) {
      return fail("VALIDATION_ERROR", "conversationId is required", 422);
    }

    // Verify candidate exists
    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.id, body.candidateId))
      .limit(1);
    if (!candidate) {
      return fail("NOT_FOUND", "candidate not found", 404);
    }

    // Verify conversation exists
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, body.conversationId))
      .limit(1);
    if (!conv) {
      return fail("NOT_FOUND", "conversation not found", 404);
    }

    const workflow = await getOrCreateWorkflow(body.candidateId, body.conversationId);
    return ok(workflow, { status: 201 });
  }

  // GET /api/lui/workflows/:id - Get workflow
  const workflowMatch = path.match(/^\/api\/lui\/workflows\/([^/]+)$/);
  if (workflowMatch && request.method === "GET") {
    const id = workflowMatch[1];
    const workflow = await getWorkflow(id);
    if (!workflow) {
      return fail("NOT_FOUND", "workflow not found", 404);
    }
    return ok(toWorkflowView(workflow));
  }

  // PUT /api/lui/workflows/:id - Update workflow
  if (workflowMatch && request.method === "PUT") {
    const id = workflowMatch[1];
    const workflow = await getWorkflow(id);
    if (!workflow) {
      return fail("NOT_FOUND", "workflow not found", 404);
    }

    const body = await parseJson<{
      currentStage?: WorkflowStage;
      status?: "active" | "paused" | "completed" | "error";
    }>(request);

    if (body.currentStage) {
      await updateWorkflow(id, { currentStage: body.currentStage });
    }
    if (body.status) {
      if (body.status === "paused") await pauseWorkflow(id);
      else if (body.status === "active") await resumeWorkflow(id);
      else if (body.status === "completed") await completeWorkflow(id);
    }

    const updated = await getWorkflow(id);
    return ok(updated ? toWorkflowView(updated) : null);
  }

  // POST /api/lui/workflows/:id/advance - Advance to next stage
  const workflowAdvanceMatch = path.match(/^\/api\/lui\/workflows\/([^/]+)\/advance$/);
  if (workflowAdvanceMatch && request.method === "POST") {
    const id = workflowAdvanceMatch[1];
    const workflow = await getWorkflow(id);
    if (!workflow) {
      return fail("NOT_FOUND", "workflow not found", 404);
    }

    const body: { silent?: boolean; targetStage?: WorkflowStage } =
      await parseJson<{ silent?: boolean; targetStage?: WorkflowStage }>(request).catch(() => ({ silent: false, targetStage: undefined }));
    const availableNextStages = getAvailableNextStages(workflow);
    const targetStage = body.targetStage && availableNextStages.includes(body.targetStage)
      ? body.targetStage
      : undefined;

    const nextStage = await advanceStage(id, targetStage);
    if (workflow.conversationId && body.silent !== true) {
      await createCompletedAssistantReply(
        workflow.conversationId,
        buildWorkflowConfirmationReceipt({
          type: nextStage === "completed" ? "complete" : "advance",
          previousStage: workflow.currentStage,
          currentStage: nextStage,
        }),
      );
    }
    return ok({ id, previousStage: workflow.currentStage, currentStage: nextStage });
  }

  const workflowRoundMatch = path.match(/^\/api\/lui\/workflows\/([^/]+)\/round$/);
  if (workflowRoundMatch && request.method === "POST") {
    const id = workflowRoundMatch[1];
    const workflow = await getWorkflow(id);
    if (!workflow) {
      return fail("NOT_FOUND", "workflow not found", 404);
    }

    const body = await parseJson<{ round: number; silent?: boolean }>(request);
    if (![1, 2, 3, 4].includes(body.round)) {
      return fail("VALIDATION_ERROR", "round must be 1-4", 422);
    }

    const updated = await confirmWorkflowRound(id, body.round);
    if (workflow.conversationId && body.silent !== true) {
      await createCompletedAssistantReply(
        workflow.conversationId,
        buildWorkflowConfirmationReceipt({
          type: "round",
          round: body.round,
          currentStage: workflow.currentStage,
        }),
      );
    }
    return ok(updated ? toWorkflowView(updated) : null);
  }

  // POST /api/lui/workflows/:id/reset - Reset workflow
  const workflowResetMatch = path.match(/^\/api\/lui\/workflows\/([^/]+)\/reset$/);
  if (workflowResetMatch && request.method === "POST") {
    const id = workflowResetMatch[1];
    const workflow = await getWorkflow(id);
    if (!workflow) {
      return fail("NOT_FOUND", "workflow not found", 404);
    }

    const body = await parseJson<{ targetStage?: WorkflowStage }>(request);
    await resetWorkflow(id, body.targetStage ?? "S0");
    const updated = await getWorkflow(id);
    return ok(updated ? toWorkflowView(updated) : null);
  }

  // GET /api/lui/workflows/by-candidate/:candidateId - Get workflow by candidate
  const workflowByCandMatch = path.match(/^\/api\/lui\/workflows\/by-candidate\/([^/]+)$/);
  if (workflowByCandMatch && request.method === "GET") {
    const candidateId = workflowByCandMatch[1];
    const conversationId = url.searchParams.get("conversationId");
    
    if (!conversationId) {
      return fail("VALIDATION_ERROR", "conversationId query param is required", 422);
    }

    const workflow = await getWorkflowByCandidate(candidateId, conversationId);
    if (!workflow) {
      return fail("NOT_FOUND", "workflow not found", 404);
    }
    return ok(toWorkflowView(workflow));
  }

  const messagesResponse = await messagesRoute(request);
  if (messagesResponse) return messagesResponse;

  const emailResponse = await emailRoute(request);
  if (emailResponse) return emailResponse;

  const interviewAssessmentResponse = await interviewAssessmentRoute(request);
  if (interviewAssessmentResponse) return interviewAssessmentResponse;

  // ---------------------------------------------------------------------------
  // Memory Routes (Phase 2.2)
  // ---------------------------------------------------------------------------
  const memoryResponse = await memoryRoute(request);
  if (memoryResponse) return memoryResponse;

  const fileResourcesResponse = await fileResourcesRoute(request);
  if (fileResourcesResponse) return fileResourcesResponse;

  const sessionMemoryResponse = await sessionMemoryRoute(request);
  if (sessionMemoryResponse) return sessionMemoryResponse;
  return fail("NOT_FOUND", "route not found", 404);
}
