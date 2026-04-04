import { createOpenAI } from "@ai-sdk/openai";
import { agent, execute } from "@deepagents/agent";
import { and, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { config } from "../config";
import { db } from "../db";
import { conversations, luiWorkflows, messages } from "../schema";
import { ensureCandidateResumeAvailable, syncCandidateResumesToConversation } from "./baobao-resume";
import { buildCandidateContext, formatCandidateContextForPrompt } from "./lui-context";
import { getWorkflowTools, type ToolContext } from "./lui-tools";
import type { PreparedWorkflowExecutionRequest, WorkflowHistoryMessage } from "./lui-workflow-runtime";

type DeepAgentContext = {
  candidateId: string;
  candidateName: string;
  currentStage: WorkflowStage;
  conversationTranscript: string;
};

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = process.env.CUSTOM_BASE_URL || "https://ai-gateway.vercel.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_API_KEY = process.env.CUSTOM_API_KEY || process.env.VERCEL_AI_GATEWAY_TOKEN || "";

type WorkflowStage = "S0" | "S1" | "S2" | "completed";

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
      typeof contextVariables?.conversationTranscript === "string" && contextVariables.conversationTranscript
        ? `## Conversation Transcript\n${contextVariables.conversationTranscript}`
        : "",
    ].filter(Boolean).join("\n\n"),
  });

  return execute(
    deepAgent,
    toUiMessages(request.historyMessages),
    {
      candidateId: request.candidateId,
      candidateName: request.candidateName,
      currentStage: request.workflowStage,
      conversationTranscript: transcript,
    },
  ).then((result) => result.toUIMessageStreamResponse());
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

  let systemPrompt = STAGE_SYSTEM_PROMPTS[workflowStage];

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
