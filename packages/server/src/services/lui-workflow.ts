/**
 * LUI Workflow Service
 *
 * Agent Orchestrator for managing multi-stage interview workflows.
 * Supports S0 (Screening), S1 (Questioning), S2 (Assessment) stages.
 *
 * Architecture:
 * - Workflow State: Stored in lui_workflows table (replaces meta.json)
 * - Stage Router: Routes between S0/S1/S2 based on current state
 * - Tool Integration: Uses Vercel AI SDK format tools from lui-tools.ts
 */

import { and, desc, eq } from "drizzle-orm";
import { luiWorkflows, conversations, messages, candidates, resumes, interviews, artifacts, artifactVersions } from "../schema";
import { buildCandidateContext, formatCandidateContextForPrompt } from "./lui-context";
import { getWorkflowTools, type ToolContext } from "./lui-tools";
import { ensureCandidateResumeAvailable, syncCandidateResumesToConversation } from "./baobao-resume";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { config } from "../config";
import { db } from "../db";
import { executeDeepAgentWorkflow } from "./deepagents-runtime";
import {
  composeWorkflowSystemPrompt,
  getWorkflowStageIndex,
  type PreparedWorkflowExecutionRequest,
  type WorkflowPromptAssets,
  type WorkflowRuntimeEngine,
  type WorkflowStage,
} from "./lui-workflow-runtime";

export type { WorkflowStage } from "./lui-workflow-runtime";

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = process.env.CUSTOM_BASE_URL || "https://ai-gateway.vercel.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_API_KEY = process.env.CUSTOM_API_KEY || process.env.VERCEL_AI_GATEWAY_TOKEN || "";

function parseRuntimeModelName(modelId: string) {
  const separatorIndex = modelId.indexOf("::");
  if (separatorIndex < 0) {
    return modelId;
  }
  return modelId.slice(separatorIndex + 2);
}

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

// ============================================================================
// Types
// ============================================================================

export type WorkflowStatus = "active" | "paused" | "completed" | "error";

export interface StageDocument {
  filePath?: string;
  content?: string;
  round?: number;
  summary?: string;
  generatedAt: string;
}

export interface WorkflowDocuments {
  S0?: StageDocument;
  S1?: StageDocument & { roundFiles?: Record<number, string> };
  S2?: StageDocument;
}

export interface WorkflowState {
  id: string;
  candidateId: string;
  conversationId: string | null;
  currentStage: WorkflowStage;
  stageData: Record<string, unknown>;
  documents: WorkflowDocuments;
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentExecutionResult {
  success: boolean;
  stage: WorkflowStage;
  message: string;
  toolCalls?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: string;
  }>;
  nextAction?: "continue" | "stage_complete" | "ask_user";
  prompt?: string; // for ask_user
}

// ============================================================================
// Workflow CRUD Operations
// ============================================================================

/**
 * Get or create a workflow for a candidate-conversation pair.
 */
export async function getOrCreateWorkflow(
  candidateId: string,
  conversationId: string
): Promise<WorkflowState> {
  const now = new Date();

  // Try to find existing workflow
  const [existing] = await db
    .select()
    .from(luiWorkflows)
    .where(
      and(
        eq(luiWorkflows.candidateId, candidateId),
        eq(luiWorkflows.conversationId, conversationId)
      )
    )
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      candidateId: existing.candidateId,
      conversationId: existing.conversationId,
      currentStage: existing.currentStage as WorkflowStage,
      stageData: existing.stageDataJson ? JSON.parse(existing.stageDataJson) : {},
      documents: existing.documentsJson ? JSON.parse(existing.documentsJson) : {},
      status: existing.status as WorkflowStatus,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  }

  // Create new workflow
  const id = `wf_${crypto.randomUUID()}`;
  await db.insert(luiWorkflows).values({
    id,
    candidateId,
    conversationId,
    currentStage: "S0",
    stageDataJson: "{}",
    documentsJson: "{}",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return {
    id,
    candidateId,
    conversationId,
    currentStage: "S0",
    stageData: {},
    documents: {},
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get workflow by ID.
 */
export async function getWorkflow(workflowId: string): Promise<WorkflowState | null> {
  const [row] = await db
    .select()
    .from(luiWorkflows)
    .where(eq(luiWorkflows.id, workflowId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    candidateId: row.candidateId,
    conversationId: row.conversationId,
    currentStage: row.currentStage as WorkflowStage,
    stageData: row.stageDataJson ? JSON.parse(row.stageDataJson) : {},
    documents: row.documentsJson ? JSON.parse(row.documentsJson) : {},
    status: row.status as WorkflowStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Get workflow by candidate and conversation.
 */
export async function getWorkflowByCandidate(
  candidateId: string,
  conversationId: string
): Promise<WorkflowState | null> {
  const [row] = await db
    .select()
    .from(luiWorkflows)
    .where(
      and(
        eq(luiWorkflows.candidateId, candidateId),
        eq(luiWorkflows.conversationId, conversationId)
      )
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    candidateId: row.candidateId,
    conversationId: row.conversationId,
    currentStage: row.currentStage as WorkflowStage,
    stageData: row.stageDataJson ? JSON.parse(row.stageDataJson) : {},
    documents: row.documentsJson ? JSON.parse(row.documentsJson) : {},
    status: row.status as WorkflowStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Update workflow state.
 */
export async function updateWorkflow(
  workflowId: string,
  updates: Partial<Omit<WorkflowState, "id" | "candidateId" | "createdAt">>
): Promise<void> {
  const now = new Date();
  const dbUpdates: Record<string, unknown> = { updatedAt: now };

  if (updates.currentStage !== undefined) dbUpdates.currentStage = updates.currentStage;
  if (updates.stageData !== undefined) dbUpdates.stageDataJson = JSON.stringify(updates.stageData);
  if (updates.documents !== undefined) dbUpdates.documentsJson = JSON.stringify(updates.documents);
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.conversationId !== undefined) dbUpdates.conversationId = updates.conversationId;

  await db
    .update(luiWorkflows)
    .set(dbUpdates)
    .where(eq(luiWorkflows.id, workflowId));
}

/**
 * Advance workflow to next stage.
 */
export async function advanceStage(workflowId: string): Promise<WorkflowStage> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

  const stageOrder: WorkflowStage[] = ["S0", "S1", "S2", "completed"];
  const currentIndex = stageOrder.indexOf(workflow.currentStage);
  const nextStage = stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];

  await updateWorkflow(workflowId, { currentStage: nextStage });
  return nextStage;
}

// ============================================================================
// Agent Execution
// ============================================================================

/**
 * Execute agent with workflow state management.
 * This is the main orchestrator function.
 */
export async function executeAgent(
  conversationId: string,
  userMessage: string,
  options: {
    candidateId?: string;
    agentId?: string;
    modelProvider?: string;
    modelId?: string;
    runtimeModelName?: string;
    endpointBaseURL?: string;
    endpointApiKey?: string;
    temperature?: number;
    autoAdvance?: boolean;
    allowedToolNames?: string[];
    agentSystemPrompt?: string | null;
    engine?: WorkflowRuntimeEngine;
    agentName?: string;
  }
): Promise<Response> {
  return executeWorkflowAgent(conversationId, userMessage, {
    ...options,
    engine: options.engine ?? "builtin",
  });
}

async function prepareWorkflowExecutionRequest(
  conversationId: string,
  userMessage: string,
  options: {
    candidateId?: string;
    modelProvider?: string;
    modelId?: string;
    runtimeModelName?: string;
    endpointBaseURL?: string;
    endpointApiKey?: string;
    temperature?: number;
    allowedToolNames?: string[];
    agentSystemPrompt?: string | null;
  },
): Promise<PreparedWorkflowExecutionRequest> {
  // Get conversation and candidate context
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) {
    throw new Error("Conversation not found");
  }

  const candidateId = options.candidateId ?? conv.candidateId;
  if (!candidateId) {
    throw new Error("No candidate associated with conversation");
  }

  // Get or create workflow
  const workflow = await getOrCreateWorkflow(candidateId, conversationId);

  const resumeSync = await ensureCandidateResumeAvailable(candidateId);
  await syncCandidateResumesToConversation(conversationId, candidateId);

  const hasScreeningDocument = Boolean(workflow.documents.S0);
  if (!hasScreeningDocument && workflow.currentStage !== "S0") {
    await updateWorkflow(workflow.id, { currentStage: "S0" });
    workflow.currentStage = "S0";
  }

  const workflowDocumentNotes: string[] = [];

  let resumeSyncNote: string | null = null;
  if (resumeSync.status === "imported") {
    resumeSyncNote = "Automatic remote resume hydration imported a missing resume just before this turn. If later-stage work lacks validated S0 output, return to S0 first.";
  } else if (resumeSync.status !== "already-present") {
    resumeSyncNote = `Automatic remote resume hydration status: ${resumeSync.status}. ${resumeSync.note ?? ""}`.trimEnd();
  }

  const candidateContext = await buildCandidateContext(candidateId);
  const promptAssets: WorkflowPromptAssets = {
    candidateSummary: candidateContext ? formatCandidateContextForPrompt(candidateContext) : null,
    jobDescription: null,
    evaluationCriteria: null,
    customContext: {},
  };

  if (workflow.documents.S0 && workflow.currentStage !== "S0") {
    workflowDocumentNotes.push("S0 screening document already exists and should be treated as authoritative prior-stage output.");
  }
  if (workflow.documents.S1 && workflow.currentStage === "S2") {
    workflowDocumentNotes.push("S1 questioning document already exists and should be used as the assessment reference set.");
  }

  if (workflow.status !== "active") {
    promptAssets.customContext.WorkflowStatus = `Current workflow status: ${workflow.status}`;
  }
  if (workflow.documents.S0?.summary) {
    promptAssets.customContext.S0Summary = workflow.documents.S0.summary;
  }
  if (workflow.documents.S1?.summary) {
    promptAssets.customContext.S1Summary = workflow.documents.S1.summary;
  }
  if (workflow.documents.S2?.summary) {
    promptAssets.customContext.S2Summary = workflow.documents.S2.summary;
  }

  const systemPrompt = composeWorkflowSystemPrompt({
    basePrompt: options.agentSystemPrompt,
    workflowStage: workflow.currentStage,
    workflowStageIndex: getWorkflowStageIndex(workflow.currentStage),
    promptAssets,
    allowedToolNames: options.allowedToolNames,
    resumeSyncNote,
    workflowDocumentNote: workflowDocumentNotes.join("\n"),
  });

  // Get message history
  const historyRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const historyMessages = historyRows.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  // Add current user message
  historyMessages.push({ role: "user", content: userMessage });

  const modelProvider = options.modelProvider?.trim() || conv.modelProvider || null;
  const modelId = options.modelId?.trim() || conv.modelId || null;
  const runtimeModelName = options.runtimeModelName?.trim() || (modelId ? parseRuntimeModelName(modelId) : null);
  if (!runtimeModelName) {
    throw new Error("modelId is required for workflow execution");
  }
  const resolvedBaseURL = options.endpointBaseURL?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  const resolvedApiKey = options.endpointApiKey?.trim() || DEFAULT_OPENAI_COMPATIBLE_API_KEY;
  const temperature = options.temperature ?? conv.temperature ?? 0.5;

  const toolContext: ToolContext = {
    directory: config.dataDir || process.cwd(),
    candidateId,
    workflowId: workflow.id,
  };

  return {
    conversationId,
    candidateId,
    candidateName: candidateContext?.candidateName ?? candidateId,
    workflowId: workflow.id,
    workflowStage: workflow.currentStage,
    workflowStageIndex: getWorkflowStageIndex(workflow.currentStage),
    systemPrompt,
    promptAssets,
    historyMessages,
    modelProvider,
    runtimeModelName,
    endpointBaseURL: resolvedBaseURL,
    endpointApiKey: resolvedApiKey,
    temperature,
    allowedToolNames: options.allowedToolNames,
    toolContext,
  };
}

async function executeBuiltinWorkflowRequest(request: PreparedWorkflowExecutionRequest): Promise<Response> {
  const provider = createOpenAI({
    name: request.modelProvider || "default-openai-compatible",
    baseURL: normalizeOpenAIBaseURL(request.endpointBaseURL),
    apiKey: request.endpointApiKey,
  });

  const tools = getWorkflowTools(request.toolContext, request.allowedToolNames);

  const result = streamText({
    model: provider.chat(request.runtimeModelName),
    messages: request.historyMessages,
    system: request.systemPrompt,
    temperature: request.temperature,
    tools,
  });

  return result.toUIMessageStreamResponse();
}

export async function executeWorkflowAgent(
  conversationId: string,
  userMessage: string,
  options: {
    candidateId?: string;
    agentId?: string;
    agentName?: string;
    engine?: WorkflowRuntimeEngine;
    modelProvider?: string;
    modelId?: string;
    runtimeModelName?: string;
    endpointBaseURL?: string;
    endpointApiKey?: string;
    temperature?: number;
    autoAdvance?: boolean;
    allowedToolNames?: string[];
    agentSystemPrompt?: string | null;
  },
): Promise<Response> {
  const request = await prepareWorkflowExecutionRequest(conversationId, userMessage, options);

  if (options.engine === "deepagents") {
    return executeDeepAgentWorkflow(request, {
      agentName: options.agentName?.trim() || "Interview Workflow Agent",
    });
  }

  return executeBuiltinWorkflowRequest(request);
}

// ============================================================================
// Workflow Control
// ============================================================================

/**
 * Reset workflow to a specific stage.
 */
export async function resetWorkflow(
  workflowId: string,
  targetStage: WorkflowStage = "S0"
): Promise<void> {
  await updateWorkflow(workflowId, {
    currentStage: targetStage,
    status: "active",
    stageData: {},
  });
}

/**
 * Pause workflow.
 */
export async function pauseWorkflow(workflowId: string): Promise<void> {
  await updateWorkflow(workflowId, { status: "paused" });
}

/**
 * Resume workflow.
 */
export async function resumeWorkflow(workflowId: string): Promise<void> {
  await updateWorkflow(workflowId, { status: "active" });
}

/**
 * Complete workflow.
 */
export async function completeWorkflow(workflowId: string): Promise<void> {
  await updateWorkflow(workflowId, {
    currentStage: "completed",
    status: "completed",
  });
}

// ============================================================================
// List Workflows
// ============================================================================

/**
 * List workflows for a candidate.
 */
export async function listCandidateWorkflows(candidateId: string): Promise<WorkflowState[]> {
  const rows = await db
    .select()
    .from(luiWorkflows)
    .where(eq(luiWorkflows.candidateId, candidateId))
    .orderBy(desc(luiWorkflows.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    conversationId: row.conversationId,
    currentStage: row.currentStage as WorkflowStage,
    stageData: row.stageDataJson ? JSON.parse(row.stageDataJson) : {},
    documents: row.documentsJson ? JSON.parse(row.documentsJson) : {},
    status: row.status as WorkflowStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * List all active workflows.
 */
export async function listActiveWorkflows(): Promise<WorkflowState[]> {
  const rows = await db
    .select()
    .from(luiWorkflows)
    .where(eq(luiWorkflows.status, "active"))
    .orderBy(desc(luiWorkflows.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    conversationId: row.conversationId,
    currentStage: row.currentStage as WorkflowStage,
    stageData: row.stageDataJson ? JSON.parse(row.stageDataJson) : {},
    documents: row.documentsJson ? JSON.parse(row.documentsJson) : {},
    status: row.status as WorkflowStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
