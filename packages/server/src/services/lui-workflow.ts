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

export type WorkflowStage = "S0" | "S1" | "S2" | "completed";
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
// System Prompts by Stage
// ============================================================================

const STAGE_SYSTEM_PROMPTS: Record<WorkflowStage, string> = {
  S0: `You are an Interview Screening Agent (S0 Stage).
Your task is to screen candidates by analyzing their resumes and initial information.

Available tools:
- scanPdf: Extract and analyze resume PDF content
- batchScreenResumes: Process multiple resumes concurrently
- writeMarkdown: Save screening results

Workflow:
1. Analyze candidate resume and basic information
2. Generate a screening assessment document
3. Save the assessment using writeMarkdown
4. Provide a clear recommendation (通过/待定/淘汰)

Output format: Create a structured screening report with:
- Candidate summary
- Skills assessment
- Experience evaluation  
- Recommendation with reasoning`,

  S1: `You are an Interview Questioning Agent (S1 Stage).
Your task is to generate interview questions based on previous stage results.

Available tools:
- resolveRound: Determine the interview round (1-4)
- writeMarkdown: Save generated questions

Workflow:
1. Review screening results from S0
2. Determine the appropriate interview round
3. Generate targeted interview questions
4. Save questions document

Output format: Create an interview question document with:
- Round number and focus areas
- Technical questions (if applicable)
- Behavioral questions
- Evaluation criteria`,

  S2: `You are an Interview Assessment Agent (S2 Stage).
Your task is to evaluate interview performance and generate assessment reports.

Available tools:
- buildWechatCopyText: Generate WeChat-friendly evaluation summary
- sanitizeInterviewNotes: Clean interview notes before analysis
- writeMarkdown: Save detailed assessment

Workflow:
1. Review interview notes (use sanitizeInterviewNotes if needed)
2. Analyze candidate performance
3. Generate evaluation summary
4. Create WeChat copy text for sharing
5. Save assessment document

Output format: Create an assessment report with:
- Interview summary
- Strengths and weaknesses
- Recommended level (P5-P8 or 不推荐)
- Next steps recommendation`,

  completed: `You are an Interview Manager Agent.
The interview workflow is complete. You can:
- Review all generated documents
- Answer questions about the candidate
- Help with follow-up actions`,
};

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
  }
): Promise<Response> {
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

  // Build system prompt with stage context
  let systemPrompt = STAGE_SYSTEM_PROMPTS[workflow.currentStage];

  if (options.agentSystemPrompt?.trim()) {
    systemPrompt = `${options.agentSystemPrompt.trim()}\n\n${systemPrompt}`;
  }

  if (options.allowedToolNames) {
    systemPrompt += options.allowedToolNames.length > 0
      ? `\n\n## Tool Constraints\nYou may only use these tools for this agent: ${options.allowedToolNames.join(", ")}. Do not invoke any other tools.`
      : `\n\n## Tool Constraints\nThis agent has no tools enabled. Answer without calling tools.`;
  }

  if (resumeSync.status === "imported") {
    systemPrompt += "\n\n## Resume Sync\nA missing remote resume was just downloaded into the local candidate record. Start from S0 screening before moving to later stages.";
  } else if (resumeSync.status !== "already-present") {
    systemPrompt += `\n\n## Resume Sync\nAutomatic remote resume hydration status: ${resumeSync.status}. ${resumeSync.note ?? ""}`.trimEnd();
  }

  // Add candidate context
  const candidateContext = await buildCandidateContext(candidateId);
  if (candidateContext) {
    systemPrompt += `\n\n## Candidate Context\n${formatCandidateContextForPrompt(candidateContext)}`;
  }

  // Add workflow documents context
  if (workflow.documents.S0 && workflow.currentStage !== "S0") {
    systemPrompt += `\n\n## S0 Screening Result\nPrevious screening has been completed. Review the S0 document for context.`;
  }
  if (workflow.documents.S1 && workflow.currentStage === "S2") {
    systemPrompt += `\n\n## S1 Questioning Result\nInterview questions have been generated. Use these as reference for assessment.`;
  }

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

  // Resolve model/provider for execution
  const modelProvider = options.modelProvider?.trim() || conv.modelProvider || null;
  const modelId = options.modelId?.trim() || conv.modelId || null;
  const runtimeModelName = options.runtimeModelName?.trim() || (modelId ? parseRuntimeModelName(modelId) : null);
  if (!runtimeModelName) {
    throw new Error("modelId is required for workflow execution");
  }
  const resolvedBaseURL = options.endpointBaseURL?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  const resolvedApiKey = options.endpointApiKey?.trim() || DEFAULT_OPENAI_COMPATIBLE_API_KEY;
  const temperature = options.temperature ?? conv.temperature ?? 0.5;

  // Create provider using OpenAI SDK with custom base URL
  const provider = createOpenAI({
    name: modelProvider || "default-openai-compatible",
    baseURL: normalizeOpenAIBaseURL(resolvedBaseURL),
    apiKey: resolvedApiKey,
  });

  // Build tool context for execution
  const toolContext: ToolContext = {
    directory: config.dataDir || process.cwd(),
    candidateId,
    workflowId: workflow.id,
  };

  // Get tools with execute functions
  const tools = getWorkflowTools(toolContext, options.allowedToolNames);

  // Execute streaming with tools
  const result = streamText({
    model: provider.chat(runtimeModelName),
    messages: historyMessages,
    system: systemPrompt,
    temperature,
    tools,
  });

  // Return streaming response - tool execution is handled internally by streamText
  return result.toUIMessageStreamResponse();
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
