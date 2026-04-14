import { createOpenAI } from "@ai-sdk/openai";
import { agent, execute } from "@deepagents/agent";
import { and, eq } from "drizzle-orm";
import { createUIMessageStream, createUIMessageStreamResponse, generateId, type UIMessage } from "ai";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";
import { db } from "../db";
import { conversations, luiWorkflows, messages } from "../schema";
import { ensureCandidateResumeAvailable, syncCandidateResumesToConversation } from "./baobao-resume";
import { buildCandidateContext, formatCandidateContextForPrompt } from "./lui-context";
import { getWorkflowTools, updateWorkflowDocument, type ToolContext } from "./lui-tools";
import type { PreparedWorkflowExecutionRequest, WorkflowHistoryMessage } from "./lui-workflow-runtime";
import { getWorkflowActionFromToolsJson, messageService } from "./message";
import { fileResourceService } from "./file-resource";
import { resolveStageFileName, withStageFrontmatter } from "./workflow-artifacts";
import {
  buildInterviewAssessmentMarkdownFromStructuredData,
  buildStructuredInterviewAssessmentInstruction,
  extractStructuredInterviewAssessmentBlock,
} from "./document-templates";

type DeepAgentContext = {
  candidateId: string;
  candidateName: string;
  candidatePosition: string | null;
  currentStage: WorkflowStage;
  conversationTranscript: string;
};

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = process.env.CUSTOM_BASE_URL || "https://ai-gateway.vercel.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_API_KEY = process.env.CUSTOM_API_KEY || process.env.VERCEL_AI_GATEWAY_TOKEN || "";

type WorkflowStage = "S0" | "S1" | "S2" | "completed";

function stripThinkingForArtifact(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

const STAGE_SYSTEM_PROMPTS: Record<WorkflowStage, string> = {
  S0: `You are an Interview Screening Agent (S0 Stage).
Your task is to screen candidates by analyzing their resumes and initial information.

Available tools:
- scan_resume: Extract and analyze resume PDF content
- screen_resumes: Process multiple resumes concurrently

Workflow:
1. Analyze candidate resume and basic information
2. Generate a screening assessment document
3. Provide a clear recommendation (通过/待定/淘汰)

Output format: Create a structured screening report with:
- Candidate summary
- Skills assessment
- Experience evaluation
- Recommendation with reasoning

If the screening conclusion is pass/通过, you MUST append this exact marker on its own line at the end: <!-- workflow-action:advance-stage -->.
If the conclusion is pending/待定 or reject/淘汰, do not append any workflow-action marker.`,

  S1: `You are an Interview Questioning Agent (S1 Stage).
Your task is to generate interview questions based on previous stage results.
If the workspace skills include interview-questioning templates or reference files, you must follow them as the authoritative question structure and constraints.

Workflow:
1. Review screening results from S0
2. Determine the appropriate interview round and focus areas
3. Generate targeted interview questions

Output format: Create an interview question document with:
- Round number and focus areas
- Technical questions (if applicable)
- Behavioral questions
- Evaluation criteria

If the round is not confirmed yet, append this exact marker on its own line at the end: <!-- workflow-action:confirm-round -->.
If the round is confirmed and you recommend moving on, append this exact marker on its own line at the end: <!-- workflow-action:advance-stage -->.`,

  S2: `You are an Interview Assessment Agent (S2 Stage).
Your task is to evaluate interview performance and generate an interview-assessment compliant report body.

Available tools:
- generate_wechat_summary: Generate WeChat-friendly evaluation summary
- sanitize_interview_notes: Clean interview notes before analysis

${buildStructuredInterviewAssessmentInstruction()}

Workflow:
1. Review interview notes immediately (use sanitize_interview_notes if needed)
2. Score only from candidate answers, never from interviewer prompts or hints
3. Generate the current-round assessment without waiting for another confirmation
4. Create strict line-template WeChat copy text for sharing

Output format requirements:
- No H1 title
- Do not write workflow control text such as "当前阶段" or "推荐动作" into the document body
- Use this order: ## 一、分析结论 -> ## 二、题目对照评分（第X轮） -> ## 三、加分与扣分（平衡） -> ## 四、系统结论 vs 面试官反馈（差异分析） -> only for non-reject cases ## 五、下一轮建议（第X+1轮）
- The WeChat block must stay as strict line-template text, not a titled paragraph summary
- Grade must be one of A+/A/B+/B/C; recommended level must be P5-P8 or 不推荐; when grade is B, render it as B（非必要不推荐）
- If interview evaluation is B/C, or contains 淘汰/不合格, treat it as non-recommend flow: B means 非必要不推荐, C means 淘汰; recommended level must be 不推荐, no next-round suggestion, and do not use advance-stage

Only when the case is non-reject and clearly needs another round, append this exact marker on its own line at the end: <!-- workflow-action:advance-stage -->.
Otherwise append this exact marker on its own line at the end: <!-- workflow-action:complete-workflow -->.`,

  completed: `You are an Interview Manager Agent.
The interview workflow is complete. You can:
- Review all generated documents
- Answer questions about the candidate
- Help with follow-up actions`,
};

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

function formatConversationTranscript(historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  return historyMessages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
}

function toUiMessages(historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>): UIMessage[] {
  return historyMessages.map((message, index) => ({
    id: `deepagents-msg-${index}`,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));
}

function createDeepAgentResponse(
  request: PreparedWorkflowExecutionRequest,
  options: { agentName: string },
): Promise<Response> {
  const tools = getWorkflowTools(request.toolContext, request.allowedToolNames);
  const transcript = formatConversationTranscript(request.historyMessages);

  const provider = createOpenAI({
    name: request.modelProvider || "default-openai-compatible",
    baseURL: normalizeOpenAIBaseURL(request.endpointBaseURL),
    apiKey: request.endpointApiKey,
  });

  const deepAgent = agent<unknown, DeepAgentContext>({
    name: options.agentName,
    model: provider.chat(request.runtimeModelName),
    tools,
    prompt: (contextVariables?: DeepAgentContext) => [
      request.systemPrompt,
      `## Runtime Context\nCandidate: ${typeof contextVariables?.candidateName === "string" && contextVariables.candidateName ? contextVariables.candidateName : request.candidateName}\nWorkflow Stage: ${typeof contextVariables?.currentStage === "string" ? contextVariables.currentStage : request.workflowStage}\nStage Index: ${request.workflowStageIndex}\nTemperature: ${request.temperature}`,
      typeof contextVariables?.candidatePosition === "string" && contextVariables.candidatePosition
        ? `## Candidate Position\n${contextVariables.candidatePosition}`
        : "",
      typeof contextVariables?.conversationTranscript === "string" && contextVariables.conversationTranscript
        ? `## Conversation Transcript\n${contextVariables.conversationTranscript}`
        : "",
    ].filter(Boolean).join("\n\n"),
  });

  return messageService.createAssistantStreamingMessage(request.conversationId).then((assistantMessageId) => {
    return createUIMessageStreamResponse({ stream: createUIMessageStream({
      originalMessages: toUiMessages(request.historyMessages),
      generateId,
      execute: async ({ writer }) => {
        const result = await execute(
          deepAgent,
          toUiMessages(request.historyMessages),
          {
            candidateId: request.candidateId,
            candidateName: request.candidateName,
            candidatePosition: request.candidatePosition,
            currentStage: request.workflowStage,
            conversationTranscript: transcript,
          },
        );

        writer.merge(result.toUIMessageStream({
          sendFinish: false,
          sendStart: true,
          onFinish: async ({ responseMessage }) => {
            const finalText = responseMessage.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("")
              .trim();

            await messageService.completeMessage(assistantMessageId, finalText);
            const persistedMessage = await messageService.getMessageById(assistantMessageId);
            const workflowAction = getWorkflowActionFromToolsJson(persistedMessage?.toolsJson);

            const [workflow] = await db
              .select()
              .from(luiWorkflows)
              .where(and(eq(luiWorkflows.id, request.workflowId), eq(luiWorkflows.conversationId, request.conversationId)))
              .limit(1);

            if (workflow && finalText && workflow.currentStage !== "completed") {
              const stage = workflow.currentStage as WorkflowStage;
              let round: number | null = null;
              if (stage === "S1" && workflow.stageDataJson) {
                try {
                  const parsed = JSON.parse(workflow.stageDataJson);
                  round = typeof parsed?.round === "number" ? parsed.round : null;
                } catch {
                  round = null;
                }
              }
              const strippedArtifactContent = stripThinkingForArtifact(finalText);
              const shouldPersist = stage === "S1"
                ? round !== null
                : stage === "S2"
                  ? workflowAction === "advance-stage" || workflowAction === "complete-workflow"
                  : workflowAction === "advance-stage"
                    || /初筛报告|筛选结论|待核验项|六维度评分|通过初筛|进入面试环节|建议：进入面试/.test(strippedArtifactContent);
              if (!shouldPersist) {
                return;
              }
              const extractedAssessment = stage === "S2"
                ? extractStructuredInterviewAssessmentBlock(strippedArtifactContent)
                : { structuredData: null, cleanedContent: strippedArtifactContent };
              const rawArtifactContent = extractedAssessment.structuredData
                ? buildInterviewAssessmentMarkdownFromStructuredData(extractedAssessment.structuredData)
                : extractedAssessment.cleanedContent;
              if (!rawArtifactContent) {
                return;
              }
              const artifactContent = withStageFrontmatter(rawArtifactContent, {
                stage,
                candidateName: request.candidateName,
                position: request.candidatePosition,
                round,
              });
              const fileName = resolveStageFileName(stage, round);
              const dirPath = join(config.filesDir, "workflow-documents", request.candidateId, request.workflowId);
              await mkdir(dirPath, { recursive: true });
              const filePath = join(dirPath, fileName);
              await Bun.write(filePath, artifactContent);
              await fileResourceService.createFile({
                conversationId: request.conversationId,
                name: fileName,
                type: "document",
                content: artifactContent,
                language: "markdown",
              });
              if (stage === "S0" || stage === "S1" || stage === "S2") {
                await updateWorkflowDocument(request.workflowId, stage, {
                  filePath,
                  content: artifactContent,
                  summary: rawArtifactContent.replace(/```[\s\S]*?```/g, " ").replace(/^#+\s*/gm, "").replace(/\n+/g, " ").trim().slice(0, 160) || undefined,
                  round: round ?? undefined,
                  structuredData: extractedAssessment.structuredData ?? undefined,
                });
              }
            }
          },
        }));

        await result.consumeStream({ onError: console.error });
        writer.write({ type: "finish" });
      },
    }) });
  });
}

export async function executeDeepAgentWorkflow(
  request: PreparedWorkflowExecutionRequest,
  options: { agentName: string },
): Promise<Response> {
  return createDeepAgentResponse(request, options);
}

export async function executeDeepAgent(
  conversationId: string,
  userMessage: string,
  options: {
    candidateId?: string;
    agentName: string;
    modelProvider?: string;
    modelId?: string;
    runtimeModelName?: string;
    endpointBaseURL?: string;
    endpointApiKey?: string;
    temperature?: number;
    allowedToolNames?: string[];
    agentSystemPrompt?: string | null;
  },
): Promise<Response> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const candidateId = options.candidateId ?? conversation.candidateId;
  if (!candidateId) {
    throw new Error("No candidate associated with conversation");
  }

  const [workflow] = await db
    .select()
    .from(luiWorkflows)
    .where(and(eq(luiWorkflows.candidateId, candidateId), eq(luiWorkflows.conversationId, conversationId)))
    .limit(1);

  const workflowStage = (workflow?.currentStage as WorkflowStage | undefined) ?? "S0";
  const resumeSync = await ensureCandidateResumeAvailable(candidateId);
  await syncCandidateResumesToConversation(conversationId, candidateId);

  let systemPrompt = STAGE_SYSTEM_PROMPTS[workflowStage] ?? STAGE_SYSTEM_PROMPTS.S0;

  if (options.agentSystemPrompt?.trim()) {
    systemPrompt = `${options.agentSystemPrompt.trim()}\n\n${systemPrompt}`;
  }

  if (options.allowedToolNames) {
    systemPrompt += options.allowedToolNames.length > 0
      ? `\n\n## Tool Constraints\nYou may only use these tools for this agent: ${options.allowedToolNames.join(", ")}. Do not invoke any other tools.`
      : "\n\n## Tool Constraints\nThis agent has no tools enabled. Answer without calling tools.";
  }

  if (resumeSync.status === "imported") {
    systemPrompt += "\n\n## Resume Sync\nA missing remote resume was just downloaded into the local candidate record. Start from S0 screening before moving to later stages.";
  } else if (resumeSync.status !== "already-present") {
    systemPrompt += `\n\n## Resume Sync\nAutomatic remote resume hydration status: ${resumeSync.status}. ${resumeSync.note ?? ""}`.trimEnd();
  }

  const candidateContext = await buildCandidateContext(candidateId);
  if (candidateContext) {
    systemPrompt += `\n\n## Candidate Context\n${formatCandidateContextForPrompt(candidateContext)}`;
  }

  const historyRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const historyMessages = historyRows.map((message) => ({
    role: message.role as "user" | "assistant" | "system",
    content: message.content,
  }));

  historyMessages.push({ role: "user", content: userMessage });

  const modelProvider = options.modelProvider?.trim() || conversation.modelProvider || null;
  const modelId = options.modelId?.trim() || conversation.modelId || null;
  const runtimeModelName = options.runtimeModelName?.trim() || (modelId ? parseRuntimeModelName(modelId) : null);
  if (!runtimeModelName) {
    throw new Error("modelId is required for deepagents execution");
  }

  const resolvedBaseURL = options.endpointBaseURL?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  const resolvedApiKey = options.endpointApiKey?.trim() || DEFAULT_OPENAI_COMPATIBLE_API_KEY;
  const temperature = options.temperature ?? conversation.temperature ?? 0.5;

  const toolContext: ToolContext = {
    directory: config.dataDir || process.cwd(),
    candidateId,
    workflowId: workflow?.id,
  };

  const preparedRequest: PreparedWorkflowExecutionRequest = {
    conversationId,
    candidateId,
    candidateName: candidateContext?.candidateName ?? candidateId,
    candidatePosition: candidateContext?.position ?? null,
    workflowId: workflow?.id ?? `wf-missing-${conversationId}`,
    workflowStage,
    workflowStageIndex: ["S0", "S1", "S2", "completed"].indexOf(workflowStage),
    systemPrompt,
    promptAssets: {
      candidateSummary: candidateContext ? formatCandidateContextForPrompt(candidateContext) : null,
      jobDescription: null,
      evaluationCriteria: null,
      customContext: {},
    },
    historyMessages: historyMessages as WorkflowHistoryMessage[],
    modelProvider,
    runtimeModelName,
    endpointBaseURL: resolvedBaseURL,
    endpointApiKey: resolvedApiKey,
    temperature,
    allowedToolNames: options.allowedToolNames,
    toolContext,
  };

  return createDeepAgentResponse(preparedRequest, { agentName: options.agentName });
}
