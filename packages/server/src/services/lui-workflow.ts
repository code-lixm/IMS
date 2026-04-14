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
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { luiWorkflows, conversations, messages } from "../schema";
import { buildCandidateContext, formatCandidateContextForPrompt } from "./lui-context";
import { getWorkflowTools, updateWorkflowDocument, type ToolContext } from "./lui-tools";
import { ensureCandidateResumeAvailable, syncCandidateResumesToConversation } from "./baobao-resume";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { config } from "../config";
import { db } from "../db";
import { getWorkflowActionFromToolsJson, messageService } from "./message";
import { executeDeepAgentWorkflow } from "./deepagents-runtime";
import { fileResourceService } from "./file-resource";
import { resolveStageFileName, withStageFrontmatter } from "./workflow-artifacts";
import { syncWorkflowMetaFile } from "./workflow-meta";
import {
  buildInterviewAssessmentMarkdownFromStructuredData,
  extractStructuredInterviewAssessmentBlock,
  type StructuredInterviewAssessmentView,
} from "./document-templates";
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
  structuredData?: StructuredInterviewAssessmentView | null;
  generatedAt: string;
}

export interface WorkflowDocuments {
  S0?: StageDocument;
  S1?: StageDocument & { roundFiles?: Record<number, string>; latestRound?: number; latestFile?: string };
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

export interface WorkflowArtifactView {
  id: string;
  stage: WorkflowStage;
  title: string;
  type: "markdown";
  fileResourceId: string | null;
  fileName: string;
  filePath: string | null;
  language: "markdown";
  summary: string | null;
  createdAt: number;
}

export interface WorkflowView {
  id: string;
  candidateId: string;
  conversationId: string | null;
  currentStage: WorkflowStage;
  confirmedRound: number | null;
  suggestedNextRound: number | null;
  requiresRoundConfirmation: boolean;
  recommendedNextStage: WorkflowStage | null;
  availableNextStages: WorkflowStage[];
  recommendedAction: string | null;
  status: WorkflowStatus;
  artifacts: WorkflowArtifactView[];
  latestAssessment: StructuredInterviewAssessmentView | null;
  updatedAt: number;
}

const REJECTED_ASSESSMENT_LINE_PATTERNS = [
  /(^|\n)面试评价：\s*(?:B|C)(?:（[^\n]*）)?(?:\n|$)/,
  /(^|\n)推荐职级：\s*不推荐(?:\n|$)/,
  /(淘汰|不合格)/,
] as const;

export function isRejectedAssessmentContent(content: string | null | undefined): boolean {
  const normalized = content?.trim();
  if (!normalized) {
    return false;
  }

  return REJECTED_ASSESSMENT_LINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isRejectedAssessmentWorkflow(workflow: WorkflowState): boolean {
  if (workflow.documents?.S2?.structuredData) {
    const grade = workflow.documents.S2.structuredData.grade;
    if (grade === "B" || grade === "C") {
      return true;
    }
  }

  const recommendedLevel = typeof workflow.stageData?.recommendedLevel === "string"
    ? workflow.stageData.recommendedLevel
    : typeof workflow.stageData?.recommended_level === "string"
      ? workflow.stageData.recommended_level
      : null;
  if (recommendedLevel === "不推荐") {
    return true;
  }

  const interviewEvaluation = typeof workflow.stageData?.interviewEvaluation === "string"
    ? workflow.stageData.interviewEvaluation
    : typeof workflow.stageData?.interview_evaluation === "string"
      ? workflow.stageData.interview_evaluation
      : null;
  if (typeof interviewEvaluation === "string" && isRejectedAssessmentContent(`面试评价：${interviewEvaluation}`)) {
    return true;
  }

  return isRejectedAssessmentContent(workflow.documents?.S2?.content);
}

function getConfirmedRound(workflow: WorkflowState): number | null {
  const round = workflow.stageData?.round;
  return typeof round === "number" && round >= 1 && round <= 4 ? round : null;
}

function getStageDataRound(value: unknown): number | null {
  return typeof value === "number" && value >= 1 && value <= 4 ? value : null;
}

export function getSuggestedNextRound(workflow: WorkflowState): number | null {
  if (workflow.currentStage === "S2" && isRejectedAssessmentWorkflow(workflow)) {
    return null;
  }

  const explicitSuggestedRound = getStageDataRound(workflow.stageData?.suggestedRound);
  if (explicitSuggestedRound) {
    return explicitSuggestedRound;
  }

  const lastCompletedRound = getStageDataRound(workflow.stageData?.lastCompletedRound);
  if (workflow.currentStage === "S1" && getConfirmedRound(workflow) === null && lastCompletedRound && lastCompletedRound < 4) {
    return lastCompletedRound + 1;
  }

  const currentRound = getConfirmedRound(workflow);
  if (workflow.currentStage === "S2" && currentRound && currentRound < 4) {
    return currentRound + 1;
  }

  return null;
}

export function getAvailableNextStages(workflow: WorkflowState): WorkflowStage[] {
  switch (workflow.currentStage) {
    case "S0":
      return ["S1"];
    case "S1":
      return getConfirmedRound(workflow) !== null ? ["S2"] : [];
    case "S2": {
      if (isRejectedAssessmentWorkflow(workflow)) {
        return ["completed"];
      }
      const currentRound = getConfirmedRound(workflow);
      if (currentRound && currentRound < 4) {
        return ["S1", "completed"];
      }
      return ["completed"];
    }
    default:
      return [];
  }
}

function stageDisplayName(stage: WorkflowStage): string {
  switch (stage) {
    case "S0":
      return "初筛";
    case "S1":
      return "面试题";
    case "S2":
      return "面试环节";
    default:
      return "已完成";
  }
}

function defaultStageFileName(stage: WorkflowStage): string {
  return resolveStageFileName(stage);
}

function buildDocumentSummary(content: string): string | null {
  const compact = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/\n+/g, " ")
    .trim();

  if (!compact) {
    return null;
  }

  return compact.slice(0, 160);
}

function stripThinkingForArtifact(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function createStaticAssistantStreamResponse(conversationId: string, content: string): Promise<Response> {
  const assistantMessageId = await messageService.createAssistantStreamingMessage(conversationId);
  await messageService.completeMessage(assistantMessageId, content);

  const encoder = new TextEncoder();
  const payloads = [
    JSON.stringify({ type: "text", text: content }),
    JSON.stringify({ type: "finish" }),
  ];

  return new Response(new ReadableStream({
    start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.close();
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export function inferRecommendedNextStage(workflow: WorkflowState): WorkflowStage | null {
  return getAvailableNextStages(workflow)[0] ?? null;
}

export function inferRecommendedAction(workflow: WorkflowState): string | null {
  const confirmedRound = getConfirmedRound(workflow);
  const suggestedNextRound = getSuggestedNextRound(workflow);
  const availableNextStages = getAvailableNextStages(workflow);
  switch (workflow.currentStage) {
    case "S0":
      return "下一步请先阅读本轮初筛结论；如果你认可通过判断，直接点击“进入出题”，否则补充反馈或继续追问。";
    case "S1":
      return confirmedRound
        ? `下一步请直接生成第 ${confirmedRound} 轮面试题；如果你还想调整这一轮考察重点，先补充要求后再出题。`
        : suggestedNextRound
          ? `下一步建议继续第 ${suggestedNextRound} 轮；请确认轮次后再直接生成对应轮次的面试题。`
          : "下一步请先选择当前是第几轮面试；确认轮次后再直接生成对应轮次的面试题。";
    case "S2": {
      const hasAssessmentDocument = Boolean(
        workflow.documents.S2?.content || workflow.documents.S2?.filePath,
      );
      if (!hasAssessmentDocument) {
        return "下一步请提供本轮面试纪要或候选人回答记录（格式不限），我会基于纪要生成评分报告并给出建议。";
      }
      if (isRejectedAssessmentWorkflow(workflow)) {
        return "本轮结论为 B/C 不推荐、淘汰或不合格，不会继续下一轮出题。下一步请补充面试官反馈并完成当前候选人的流程。";
      }
      if (availableNextStages.includes("S1")) {
        return suggestedNextRound
          ? `下一步你可以继续进入第 ${suggestedNextRound} 轮出题；如果当前流程已经足够，也可以直接完成当前候选人的面试流程。`
          : "下一步你可以继续进入下一轮出题；如果当前流程已经足够，也可以直接完成当前候选人的面试流程。";
      }
      return "下一步请确认当前流程是否结束；如无后续轮次，直接完成当前候选人的面试流程。";
    }
    default:
      return "当前流程已完成；下一步你可以查看历史产物、补充追问，或重新开启新的面试轮次讨论。";
  }
}

export function buildWorkflowArtifacts(workflow: WorkflowState): WorkflowArtifactView[] {
  const artifactEntries = Object.entries(workflow.documents) as Array<[WorkflowStage, StageDocument | undefined]>;

  return artifactEntries
    .filter(([, document]) => Boolean(document?.content))
    .map(([stage, document]) => {
      const generatedAt = document?.generatedAt
        ? new Date(document.generatedAt).getTime()
        : workflow.updatedAt.getTime();
      const round = stage === "S1" && typeof (document as WorkflowDocuments["S1"])?.round === "number"
        ? (document as WorkflowDocuments["S1"])?.round
        : null;

      return {
        id: `${workflow.id}:${stage}`,
        stage,
        title: stage === "S1" && round ? `第 ${round} 轮面试题` : `${stageDisplayName(stage)}文档`,
        type: "markdown",
        fileResourceId: null,
        fileName: document?.filePath?.split("/").pop() || defaultStageFileName(stage),
        filePath: document?.filePath ?? null,
        language: "markdown",
        summary: document?.summary ?? (document?.content ? buildDocumentSummary(document.content) : null),
        createdAt: generatedAt,
      } satisfies WorkflowArtifactView;
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function toWorkflowView(workflow: WorkflowState): WorkflowView {
  const confirmedRound = getConfirmedRound(workflow);
  const suggestedNextRound = getSuggestedNextRound(workflow);
  const availableNextStages = getAvailableNextStages(workflow);
  return {
    id: workflow.id,
    candidateId: workflow.candidateId,
    conversationId: workflow.conversationId,
    currentStage: workflow.currentStage,
    confirmedRound,
    suggestedNextRound,
    requiresRoundConfirmation: workflow.currentStage === "S1" && confirmedRound === null,
    recommendedNextStage: inferRecommendedNextStage(workflow),
    availableNextStages,
    recommendedAction: inferRecommendedAction(workflow),
    status: workflow.status,
    artifacts: buildWorkflowArtifacts(workflow),
    latestAssessment: workflow.documents.S2?.structuredData ?? null,
    updatedAt: workflow.updatedAt.getTime(),
  };
}

export async function confirmWorkflowRound(workflowId: string, round: number): Promise<WorkflowState | null> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    return null;
  }

  const nextStageData = {
    ...workflow.stageData,
    round,
    suggestedRound: null,
  };

  await updateWorkflow(workflowId, { stageData: nextStageData });
  return getWorkflow(workflowId);
}

export function shouldPersistWorkflowArtifact(input: {
  stage: WorkflowStage;
  confirmedRound: number | null;
  workflowAction: "advance-stage" | "complete-workflow" | null;
  content: string;
}): boolean {
  if (input.stage === "S1") {
    return input.confirmedRound !== null;
  }

  if (input.stage === "S2") {
    if (input.workflowAction === "advance-stage" || input.workflowAction === "complete-workflow") {
      return true;
    }

    const normalized = input.content.trim();
    if (!normalized) {
      return false;
    }

    if (extractStructuredInterviewAssessmentBlock(normalized).structuredData) {
      return true;
    }

    const hasScoreSignals = /评分|总分|推荐职级|面试评价|面试评估|评分概览/.test(normalized);
    const hasStructuredSections = /##\s+一、分析结论|##\s+二、题目对照评分/.test(normalized);
    const hasWechatCopySignals = /(^|\n)面试轮次：第\d+轮[\s\S]*推荐职级：/.test(normalized);
    return hasScoreSignals || hasStructuredSections || hasWechatCopySignals;
  }

  const expectedAction = "advance-stage";
  return input.workflowAction === expectedAction;
}

export async function persistWorkflowStageArtifact(input: {
  workflow: WorkflowState;
  content: string;
  workflowAction: "advance-stage" | "complete-workflow" | null;
}): Promise<void> {
  const { workflow } = input;
  if (!workflow.conversationId || workflow.currentStage === "completed") {
    return;
  }

  const content = input.content.trim();
  const strippedArtifactContent = stripThinkingForArtifact(content);
  if (!strippedArtifactContent) {
    return;
  }

  const extractedAssessment = workflow.currentStage === "S2"
    ? extractStructuredInterviewAssessmentBlock(strippedArtifactContent)
    : { structuredData: null, cleanedContent: strippedArtifactContent };
  const rawArtifactContent = extractedAssessment.structuredData
    ? buildInterviewAssessmentMarkdownFromStructuredData(extractedAssessment.structuredData)
    : extractedAssessment.cleanedContent;
  if (!rawArtifactContent) {
    return;
  }

  const artifactRound = workflow.currentStage === "S1" || workflow.currentStage === "S2"
    ? getConfirmedRound(workflow)
    : null;
  const shouldPersist = shouldPersistWorkflowArtifact({
    stage: workflow.currentStage,
    confirmedRound: artifactRound,
    workflowAction: input.workflowAction,
    content: rawArtifactContent,
  });

  if (!shouldPersist) {
    return;
  }

  const candidateContext = await buildCandidateContext(workflow.candidateId);
  const artifactContent = withStageFrontmatter(rawArtifactContent, {
    stage: workflow.currentStage,
    candidateName: candidateContext?.candidateName ?? workflow.candidateId,
    position: candidateContext?.position ?? null,
    round: artifactRound,
  });

  const fileName = resolveStageFileName(workflow.currentStage, artifactRound);
  const dirPath = join(config.filesDir, "workflow-documents", workflow.candidateId, workflow.id);
  await mkdir(dirPath, { recursive: true });
  const filePath = join(dirPath, fileName);
  await Bun.write(filePath, artifactContent);

  await fileResourceService.createFile({
    conversationId: workflow.conversationId,
    name: fileName,
    type: "document",
    content: artifactContent,
    language: "markdown",
  });

  await updateWorkflowDocument(workflow.id, workflow.currentStage, {
    filePath,
    content: artifactContent,
    summary: buildDocumentSummary(rawArtifactContent) ?? undefined,
    round: artifactRound ?? undefined,
    structuredData: extractedAssessment.structuredData ?? undefined,
  });
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

  await syncWorkflowMetaFile(id);

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

  await syncWorkflowMetaFile(workflowId);
}

/**
 * Advance workflow to next stage.
 */
export async function advanceStage(workflowId: string, targetStage?: WorkflowStage): Promise<WorkflowStage> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
  const availableNextStages = getAvailableNextStages(workflow);
  const nextStage = targetStage ?? availableNextStages[0] ?? workflow.currentStage;

  if (!availableNextStages.includes(nextStage) && nextStage !== workflow.currentStage) {
    throw new Error(`Invalid next stage transition: ${workflow.currentStage} -> ${nextStage}`);
  }

  if (nextStage === "completed") {
    await completeWorkflow(workflowId);
    return "completed";
  }

  let nextStageData = { ...workflow.stageData };
  if (workflow.currentStage === "S2" && nextStage === "S1") {
    const currentRound = getConfirmedRound(workflow);
    nextStageData = {
      ...nextStageData,
      lastCompletedRound: currentRound ?? nextStageData.lastCompletedRound ?? null,
      suggestedRound: currentRound && currentRound < 4 ? currentRound + 1 : null,
    };
    delete nextStageData.round;
  }

  await updateWorkflow(workflowId, {
    currentStage: nextStage,
    stageData: nextStageData,
    status: "active",
  });
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
  if (workflow.documents.S1?.latestRound) {
    promptAssets.customContext.S1LatestRound = String(workflow.documents.S1.latestRound);
  }
  if (workflow.documents.S1?.latestFile) {
    promptAssets.customContext.S1LatestFile = workflow.documents.S1.latestFile;
  }
  if (workflow.documents.S2?.summary) {
    promptAssets.customContext.S2Summary = workflow.documents.S2.summary;
  }
  if (workflow.currentStage === "S2" && userMessage.trim()) {
    promptAssets.customContext.S2LatestUserInput = userMessage.trim();
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
    candidatePosition: candidateContext?.position ?? null,
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
  const assistantMessageId = await messageService.createAssistantStreamingMessage(request.conversationId);
  const assistantPersistence = messageService.createAssistantStreamPersistenceHandlers(assistantMessageId);

  const result = streamText({
    model: provider.chat(request.runtimeModelName),
    messages: request.historyMessages,
    system: request.systemPrompt,
    temperature: request.temperature,
    tools,
    onChunk: assistantPersistence.onChunk,
    onError: assistantPersistence.onError,
  });

  return result.toUIMessageStreamResponse({
    onFinish: async (payload) => {
      await assistantPersistence.onFinish(payload);
      const workflow = await getWorkflow(request.workflowId);
      const persistedMessage = await messageService.getMessageById(assistantMessageId);
      const finalText = persistedMessage?.content.trim() ?? "";
      const rawWorkflowAction = getWorkflowActionFromToolsJson(persistedMessage?.toolsJson);
      const workflowAction: "advance-stage" | "complete-workflow" | null = rawWorkflowAction === "advance-stage" || rawWorkflowAction === "complete-workflow"
        ? rawWorkflowAction
        : null;
      if (workflow && finalText) {
        await persistWorkflowStageArtifact({
          workflow,
          content: finalText,
          workflowAction,
        });
      }
    },
  });
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

  if (request.workflowStage === "S1") {
    const workflow = await getWorkflow(request.workflowId);
    const confirmedRound = workflow ? getConfirmedRound(workflow) : null;
    const existingRoundPath = confirmedRound && workflow?.documents.S1?.roundFiles
      ? workflow.documents.S1.roundFiles[confirmedRound]
      : null;

    if (existingRoundPath) {
      const existingFile = Bun.file(existingRoundPath);
      if (await existingFile.exists()) {
        const existingContent = (await existingFile.text()).trim();
        if (existingContent) {
          return createStaticAssistantStreamResponse(
            conversationId,
            `${existingContent}\n\n已复用当前候选人的第 ${confirmedRound} 轮面试题。`,
          );
        }
      }
    }
  }

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
