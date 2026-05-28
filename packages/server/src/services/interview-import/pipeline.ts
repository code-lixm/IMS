import {
  type InterviewImportAIDraft,
  type InterviewImportConfirmationState,
  type InterviewImportDecisionState,
  type InterviewImportBatchSummary,
  type InterviewImportMode,
  type InterviewImportPayload,
  type InterviewImportPersistenceResult,
  type InterviewImportRawInput,
  type InterviewImportSystemContext,
  validateInterviewImportAIDraft,
  validateInterviewImportPayload,
} from "@ims/shared";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { importBatches, importFileTasks, interviewAssessments, interviews } from "../../schema";
import { logError, logInfo, logWarn } from "../../utils/logger";
import { resolveImportAiEndpoint, normalizeOpenAIBaseURL } from "../import/ai-screening";
import { extractPdfTextFromFile } from "../pdf-text";
import {
  type InterviewImportCandidateResolutionResult,
  type ResolveInterviewImportCandidateOptions,
  resolveInterviewImportCandidate,
  saveInterviewImportUploadToLocal,
} from "./candidate-resolution";
import {
  type InterviewRoundAppendedResult,
  type InterviewRoundFailedResult,
  type InterviewRoundPersistenceAssessmentInsert,
  type InterviewRoundPersistenceInterviewInsert,
  type InterviewRoundPersistenceSummary,
  type InterviewRoundSkippedResult,
  type NormalizedInterviewImportRound,
  prepareInterviewRoundPersistence,
} from "./round-persistence";
import {
  advanceInterviewImportWorkflow,
  type InterviewImportWorkflowAdvanceServiceResult,
} from "./workflow-advance";

const ACTIVE_TASK_STATUSES = [
  "queued",
  "preparing",
  "extracting_resume",
  "parsing_payload",
  "resolving_candidate",
  "appending_rounds",
  "ai_advancing_stage",
] as const;

const TERMINAL_TASK_STATUSES = ["completed", "partial_success", "failed", "skipped"] as const;

const STAGE_PRIORITY = [
  "queued",
  "preparing",
  "extracting_resume",
  "parsing_payload",
  "resolving_candidate",
  "appending_rounds",
  "ai_advancing_stage",
] as const;

const MIXED_ROUND_NUMBER_WARNING = "检测到显式 roundNumber 与隐式推导混用；当前 append-only pipeline 会按 shared inferRoundNumbers 规则处理，但不保证轮次连续递增，建议后续优先显式填写每轮 roundNumber。";

export type InterviewImportTaskStage = typeof ACTIVE_TASK_STATUSES[number] | typeof TERMINAL_TASK_STATUSES[number];

export interface InterviewImportTaskSummary {
  createdCandidate: boolean;
  candidateId: string | null;
  appendedRounds: InterviewRoundAppendedResult[];
  skippedRounds: InterviewRoundSkippedResult[];
  failedRounds: InterviewRoundFailedResult[];
  workflowAdvance: InterviewImportWorkflowAdvanceServiceResult | null;
  errors: string[];
  warnings: string[];
}

export interface InterviewImportPipelineRoundPersistenceResult {
  startFrom: number;
  normalizedRounds: NormalizedInterviewImportRound[];
  interviewCreates: InterviewRoundPersistenceInterviewInsert[];
  assessmentCreates: InterviewRoundPersistenceAssessmentInsert[];
  summary: InterviewRoundPersistenceSummary;
}

export interface InterviewImportTaskResult {
  sourceType: "interview_data";
  mode: InterviewImportMode | null;
  rawInput: InterviewImportRawInput | null;
  systemContext: InterviewImportSystemContext | null;
  aiDraft: InterviewImportAIDraft | null;
  confirmation: InterviewImportConfirmationState | null;
  persistence: InterviewImportPersistenceResult | null;
  decisionState: InterviewImportDecisionState | null;
  candidateResolution: InterviewImportCandidateResolutionResult | null;
  roundPersistence: InterviewImportPipelineRoundPersistenceResult | null;
  summary: InterviewImportTaskSummary;
  completedAt: number | null;
}

export interface ProcessInterviewImportTaskOptions extends Pick<ResolveInterviewImportCandidateOptions, "resumePdf"> {}

interface LoadedInterviewImportTask {
  id: string;
  batchId: string;
  status: string;
  stage: string | null;
  payloadJson: string | null;
}

interface LoadedInterviewImportBatch {
  id: string;
  status: string;
  sourceType: string | null;
}

function buildEmptySummary(): InterviewImportTaskSummary {
  return {
    createdCandidate: false,
    candidateId: null,
    appendedRounds: [],
    skippedRounds: [],
    failedRounds: [],
    workflowAdvance: null,
    errors: [],
    warnings: [],
  };
}

function buildEmptyResult(mode: InterviewImportMode | null = null): InterviewImportTaskResult {
  return {
    sourceType: "interview_data",
    mode,
    rawInput: null,
    systemContext: null,
    aiDraft: null,
    confirmation: null,
    persistence: null,
    decisionState: null,
    candidateResolution: null,
    roundPersistence: null,
    summary: buildEmptySummary(),
    completedAt: null,
  };
}

function normalizeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "未知错误");
}

function normalizeOptionalText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function extractRawInput(payload: InterviewImportPayload): InterviewImportRawInput {
  if (payload.rawInput) {
    return payload.rawInput;
  }

  return {
    resume: payload.resume
      ? {
          pdfPath: normalizeOptionalText(payload.resume.pdfPath) ?? undefined,
          extractedText: normalizeOptionalText(payload.resume.extractedText) ?? undefined,
        }
      : undefined,
    meetingNotesText: normalizeOptionalText(payload.meetingNotesText) ?? undefined,
  };
}

function extractSystemContext(payload: InterviewImportPayload): InterviewImportSystemContext {
  if (payload.systemContext) {
    return payload.systemContext;
  }

  return {
    candidateId: payload.mode === "create_candidate" ? undefined : (normalizeOptionalText(getLegacyCandidateId(payload)) || undefined),
    candidateName: payload.mode === "create_candidate" ? (normalizeOptionalText(getLegacyCandidateName(payload)) || undefined) : undefined,
  };
}

function getLegacyCandidateId(payload: InterviewImportPayload): string | undefined {
  return "candidateId" in payload ? payload.candidateId : undefined;
}

function getLegacyCandidateName(payload: InterviewImportPayload): string | undefined {
  return "name" in payload ? payload.name : undefined;
}

function buildCompatibilityAIDraft(
  payload: InterviewImportPayload,
  rawInput: InterviewImportRawInput,
  systemContext: InterviewImportSystemContext,
  capturedAt: number,
): InterviewImportAIDraft {
  const sourceText = rawInput.resume?.extractedText?.trim() || rawInput.meetingNotesText?.trim() || payload.overallSummaryText?.trim() || payload.interviewQuestionsText?.trim() || null;
  const candidateName = systemContext.candidateName ?? (payload.mode === "create_candidate" ? normalizeOptionalText(getLegacyCandidateName(payload)) : null) ?? "候选人";
  const candidateId = normalizeOptionalText(systemContext.candidateId) ?? undefined;
  const inferredRounds = payload.rounds.map((round, index) => ({
    ...round,
    inputIndex: index,
    resolvedRoundNumber: typeof round.roundNumber === "number" && Number.isFinite(round.roundNumber) ? round.roundNumber : index + 1,
    confidence: 0.92,
    reason: "legacy payload bridge",
    auditSnapshot: {
      sourceText: sourceText ?? undefined,
      model: "legacy_bridge",
      promptVersion: "compat_v1",
      capturedAt,
    },
  }));

  return {
    candidateOptions: [
      {
        candidateId,
        candidateName,
        confidence: candidateId ? 1 : 0.85,
        reason: candidateId ? "system context candidateId" : "legacy payload bridge",
        evidence: sourceText ? [sourceText.slice(0, 180)] : undefined,
      },
    ],
    rounds: inferredRounds,
    overallEvaluationText: normalizeOptionalText(payload.overallSummaryText) ?? normalizeOptionalText(payload.meetingNotesText) ?? undefined,
    confidence: candidateId ? 1 : 0.85,
    reasons: [candidateId ? "系统上下文已提供候选人标识" : "使用兼容桥接自动生成 AI draft"],
    auditSnapshot: {
      sourceText: sourceText ?? undefined,
      model: "legacy_bridge",
      promptVersion: "compat_v1",
      capturedAt,
    },
  };
}

const INTERVIEW_IMPORT_AI_PROMPT_LINES = [
  "你是一个面试信息分析助手。你的任务是根据候选人简历文本和面试记录（会议纪要），生成结构化的面试导入数据。",
  "",
  "## 输入",
  "- 简历文本（可能为空）",
  "- 面试记录/会议纪要（可能为空）",
  "- 系统上下文（候选人和已知信息）",
  "",
  "## 输出格式",
  "你必须输出严格的 JSON，不要有任何多余文字。格式如下：",
  "",
  "```json",
  '{',
  '  "candidateOptions": [',
  '    {',
  '      "candidateName": "从简历或面试记录中提取的候选人姓名",',
  '      "confidence": 0.85,',
  '      "reason": "姓名提取来源说明",',
  '      "evidence": ["支持该姓名的证据片段"]',
  '    }',
  '  ],',
  '  "rounds": [',
  '    {',
  '      "inputIndex": 0,',
  '      "resolvedRoundNumber": 1,',
  '      "roundNumber": 1,',
  '      "roundName": "技术一面",',
  '      "interviewDate": "2024-01-15",',
  '      "interviewerNames": ["张三"],',
  '      "interviewType": "现场",',
  '      "evaluationText": "根据面试记录生成的结构化评价（包含评价要点、候选人表现、优势与不足）",',
  '      "resultLabel": "通过",',
  '      "confidence": 0.9,',
  '      "reason": "面试记录中有完整的第一轮评价信息"',
  '    }',
  '  ],',
  '  "overallEvaluationText": "对候选人整体评价的综合描述",',
  '  "confidence": 0.85,',
  '  "reasons": ["面试记录信息较完整", "简历文本可提取有效信息"]',
  '}',
  "```",
  "",
  "## 分析要点",
  "1. 从简历文本提取候选人姓名、职位、经验等信息",
  "2. 从面试记录提取每轮面试的评价、面试官、日期等",
  "3. 如果无法提取某轮面试信息，confidence 应降低",
  "4. evaluationText 应该是结构化的评价文本，而不是简单复述原文",
  "5. 如果输入材料不足以判断，宁可降低 confidence 而不是编造信息",
  "6. roundNumber 从 1 开始递增",
  "7. 整体 confidence 在 0-1 之间，0.7 以上为自动落库，0.7 以下需要人工确认",
  "",
  "## 重要",
  "- 只输出 JSON，不要有其他文字",
  "- confidence 必须 0-1 之间的数字",
  "- evaluationText 不能为空",
  "- 如果输入为空或无法解析，返回低 confidence 结果",
].join("\n");

function parseRuntimeModelName(modelId: string): string {
  const separatorIndex = modelId.indexOf("::");
  if (separatorIndex < 0) return modelId;
  return modelId.slice(separatorIndex + 2);
}

async function generateInterviewImportAIDraft(
  rawInput: InterviewImportRawInput,
  systemContext: InterviewImportSystemContext,
  capturedAt: number,
): Promise<InterviewImportAIDraft | null> {
  const resumeText = rawInput.resume?.extractedText?.trim();
  const meetingNotes = rawInput.meetingNotesText?.trim();

  if (!resumeText && !meetingNotes) {
    logWarn("interview_import.ai_draft.no_input_text", {});
    return null;
  }

  try {
    const endpoint = await resolveImportAiEndpoint();

    const sourceParts: string[] = [];
    if (resumeText) {
      sourceParts.push(`## 简历文本\n${resumeText}`);
    }
    if (meetingNotes) {
      sourceParts.push(`## 面试记录/会议纪要\n${meetingNotes}`);
    }
    if (systemContext.candidateId) {
      sourceParts.push(`## 已知候选人ID\n${systemContext.candidateId}`);
    }
    if (systemContext.candidateName) {
      sourceParts.push(`## 已知候选人姓名\n${systemContext.candidateName}`);
    }

    const prompt = sourceParts.join("\n\n");
    const sourceTextPreview = resumeText || meetingNotes || "";

    if (endpoint.providerId === "minimax") {
      const response = await fetch(`${normalizeOpenAIBaseURL(endpoint.baseURL)}/text/chatcompletion_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          model: parseRuntimeModelName(endpoint.model),
          messages: [
            { role: "system", content: INTERVIEW_IMPORT_AI_PROMPT_LINES },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`MiniMax API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("MiniMax returned empty content");
      }
      const parsedDraft = parseAIDraftResponse(content, {
        capturedAt,
        sourceTextPreview,
        rawInput,
        systemContext,
      });
      if (!parsedDraft) {
        logWarn("interview_import.ai_draft.minimax_parse_returned_null", {
          model: endpoint.model,
          contentPreview: content.slice(0, 1200),
        });
      } else {
        logInfo("interview_import.ai_draft.generated", {
          providerId: endpoint.providerId,
          model: endpoint.model,
          roundCount: parsedDraft.rounds.length,
          candidateName: parsedDraft.candidateOptions[0]?.candidateName,
        });
      }
      return parsedDraft;
    }

    const provider = createOpenAI({
      name: endpoint.providerId || "interview-import-openai-compatible",
      baseURL: normalizeOpenAIBaseURL(endpoint.baseURL),
      apiKey: endpoint.apiKey,
    });

    const result = await generateText({
      model: provider.chat(parseRuntimeModelName(endpoint.model)),
      temperature: 0.1,
      system: INTERVIEW_IMPORT_AI_PROMPT_LINES,
      prompt,
      abortSignal: AbortSignal.timeout(45_000),
    });

    const content = result.text?.trim();
    if (!content) {
      throw new Error("AI interview import draft returned empty content");
    }

    const parsedDraft = parseAIDraftResponse(content, {
      capturedAt,
      sourceTextPreview,
      rawInput,
      systemContext,
    });
    if (!parsedDraft) {
      logWarn("interview_import.ai_draft.openai_parse_returned_null", {
        model: endpoint.model,
        contentPreview: content.slice(0, 1200),
      });
    } else {
      logInfo("interview_import.ai_draft.generated", {
        providerId: endpoint.providerId,
        model: endpoint.model,
        roundCount: parsedDraft.rounds.length,
        candidateName: parsedDraft.candidateOptions[0]?.candidateName,
      });
    }
    return parsedDraft;
  } catch (error) {
    logWarn("interview_import.ai_draft.generation_failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function stripAssistantFormatting(content: string) {
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return stripMarkdownCodeFence(withoutThinking);
}

function stripMarkdownCodeFence(content: string) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function normalizeConfidence(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1 && value <= 100) {
      return Math.max(0, Math.min(1, value / 100));
    }
    return Math.max(0, Math.min(1, value));
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["high", "strong", "高", "高置信度"].includes(normalized)) return 0.9;
    if (["medium", "mid", "moderate", "中", "中等", "中等置信度"].includes(normalized)) return 0.7;
    if (["low", "weak", "低", "低置信度"].includes(normalized)) return 0.45;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      if (parsed > 1 && parsed <= 100) {
        return Math.max(0, Math.min(1, parsed / 100));
      }
      return Math.max(0, Math.min(1, parsed));
    }
  }

  return fallback;
}

function splitInterviewerNames(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const names = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    return names.length > 0 ? names : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const names = value
    .split(/[\/,，、;&和]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return names.length > 0 ? names : undefined;
}

function extractCandidateNameFromSource(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  const patterns = [
    /姓名[:：]\s*([\u4e00-\u9fa5A-Za-z·]{2,30})/,
    /候选人[:：]\s*([\u4e00-\u9fa5A-Za-z·]{2,30})/,
    /面试人[:：]\s*([\u4e00-\u9fa5A-Za-z·]{2,30})/,
    /^([\u4e00-\u9fa5·]{2,8})\s+(?:意向岗位|电话|手机号|邮箱|工作年限|现居住地)/m,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidateName = match?.[1]?.trim();
    if (candidateName) {
      return candidateName;
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  for (const line of lines) {
    const match = line.match(/^([\u4e00-\u9fa5]{2,8}|[A-Za-z]+(?:\s+[A-Za-z]+){0,2})$/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function ensureNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeRoundResultLabel(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function buildRoundEvaluationText(round: Record<string, unknown>): string {
  const directEvaluation = typeof round.evaluationText === "string" ? round.evaluationText.trim() : "";
  if (directEvaluation) {
    return directEvaluation;
  }

  const roundName = typeof round.roundName === "string"
    ? round.roundName.trim()
    : typeof round.type === "string"
      ? round.type.trim()
      : "本轮面试";
  const focus = typeof round.focus === "string" ? round.focus.trim() : "";
  const duration = typeof round.duration === "string" ? round.duration.trim() : "";
  const summaryParts = [
    `${roundName}。`,
    focus ? `重点考察：${focus}。` : "",
    duration ? `建议时长：${duration}。` : "",
  ].filter(Boolean);

  return summaryParts.join(" ").trim() || "（无评价内容）";
}

function inferCandidateName(
  parsed: Record<string, unknown>,
  rawInput: InterviewImportRawInput,
  systemContext: InterviewImportSystemContext,
): string {
  const snakeCaseName = typeof parsed.candidate_name === "string" ? parsed.candidate_name.trim() : "";
  if (snakeCaseName) {
    return snakeCaseName;
  }

  const parsedName = typeof parsed.candidateName === "string" ? parsed.candidateName.trim() : "";
  if (parsedName) {
    return parsedName;
  }

  const basicInfo = typeof parsed.basic_info === "object" && parsed.basic_info !== null
    ? parsed.basic_info as Record<string, unknown>
    : typeof parsed.basicInfo === "object" && parsed.basicInfo !== null
      ? parsed.basicInfo as Record<string, unknown>
      : typeof parsed.candidate_info === "object" && parsed.candidate_info !== null
        ? parsed.candidate_info as Record<string, unknown>
        : typeof parsed.candidateInfo === "object" && parsed.candidateInfo !== null
          ? parsed.candidateInfo as Record<string, unknown>
      : null;
  const basicInfoName = typeof basicInfo?.name === "string" ? basicInfo.name.trim() : "";
  if (basicInfoName) {
    return basicInfoName;
  }

  return systemContext.candidateName?.trim()
    || extractCandidateNameFromSource(rawInput.resume?.extractedText)
    || extractCandidateNameFromSource(rawInput.meetingNotesText)
    || "未知候选人";
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAnalysisBackfillRound(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const analysis = typeof parsed.interview_analysis === "object" && parsed.interview_analysis !== null
    ? parsed.interview_analysis as Record<string, unknown>
    : typeof parsed.interviewAnalysis === "object" && parsed.interviewAnalysis !== null
      ? parsed.interviewAnalysis as Record<string, unknown>
      : null;
  const selfEvaluation = typeof parsed.self_evaluation === "object" && parsed.self_evaluation !== null
    ? parsed.self_evaluation as Record<string, unknown>
    : typeof parsed.selfEvaluation === "object" && parsed.selfEvaluation !== null
      ? parsed.selfEvaluation as Record<string, unknown>
      : null;

  const strengths = analysis
    ? readStringList(analysis.strengths)
    : readStringList(selfEvaluation?.strengths);
  const concernPoints = analysis
    ? readStringList(analysis.concern_points ?? analysis.concernPoints)
    : readStringList(selfEvaluation?.potential_concerns ?? selfEvaluation?.potentialConcerns);
  const suggestedQuestions = analysis
    ? readStringList(analysis.suggested_questions ?? analysis.suggestedQuestions)
    : readStringList(parsed.interview_focus_suggestions ?? parsed.interviewFocusSuggestions);
  const keyHighlights = readStringList(parsed.key_data_highlights ?? parsed.keyDataHighlights);
  const personalStrengths = readStringList(parsed.personal_strengths ?? parsed.personalStrengths);
  const interviewFocusAreas = readStringList(parsed.interview_focus_areas ?? parsed.interviewFocusAreas);
  const positionMatchAnalysis = typeof parsed.position_match_analysis === "string"
    ? parsed.position_match_analysis.trim()
    : typeof parsed.positionMatchAnalysis === "string"
      ? parsed.positionMatchAnalysis.trim()
      : "";
  const keyMetricsRaw = parsed.key_metrics ?? parsed.keyMetrics;
  const keyMetrics = typeof keyMetricsRaw === "object" && keyMetricsRaw !== null
    ? Object.entries(keyMetricsRaw as Record<string, unknown>)
      .map(([key, value]) => {
        const normalized = typeof value === "string"
          ? value.trim()
          : typeof value === "number"
            ? String(value)
            : "";
        return normalized ? `${key}: ${normalized}` : "";
      })
      .filter(Boolean)
    : [];
  const sections = [
    strengths.length > 0 ? `优势：${strengths.join("；")}` : "",
    personalStrengths.length > 0 ? `个人优势：${personalStrengths.join("；")}` : "",
    concernPoints.length > 0 ? `风险点：${concernPoints.join("；")}` : "",
    suggestedQuestions.length > 0 ? `建议追问：${suggestedQuestions.join("；")}` : "",
    interviewFocusAreas.length > 0 ? `面试关注点：${interviewFocusAreas.join("；")}` : "",
    keyHighlights.length > 0 ? `关键亮点：${keyHighlights.join("；")}` : "",
    keyMetrics.length > 0 ? `关键数据：${keyMetrics.join("；")}` : "",
    positionMatchAnalysis ? `岗位匹配分析：${positionMatchAnalysis}` : "",
  ].filter(Boolean);

  const overallEvaluationText = typeof parsed.overallEvaluationText === "string"
    ? parsed.overallEvaluationText.trim()
    : typeof parsed.position_match_analysis === "string"
      ? parsed.position_match_analysis.trim()
      : typeof parsed.positionMatchAnalysis === "string"
        ? parsed.positionMatchAnalysis.trim()
        : "";
  const reasonTexts = Array.isArray(parsed.reasons)
    ? parsed.reasons
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];

  if (overallEvaluationText) {
    sections.push(`综合评价：${overallEvaluationText}`);
  }
  if (reasonTexts.length > 0) {
    sections.push(`判断依据：${reasonTexts.join("；")}`);
  }

  if (sections.length === 0) {
    return null;
  }

  return {
    roundNumber: 1,
    roundName: "AI导入分析",
    evaluationText: sections.join("\n"),
    confidence: parsed.confidence,
    reason: "根据简历分析结果自动生成结构化评价",
  };
}

function parseAIDraftResponse(
  text: string,
  context: {
    capturedAt: number;
    sourceTextPreview?: string;
    rawInput: InterviewImportRawInput;
    systemContext: InterviewImportSystemContext;
  },
): InterviewImportAIDraft | null {
  try {
    const cleanedText = stripAssistantFormatting(text);
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logWarn("interview_import.ai_draft.no_json_found", { textPreview: cleanedText.slice(0, 200) });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const inferredCandidateName = inferCandidateName(parsed, context.rawInput, context.systemContext);

    const basicInfo = typeof parsed.basic_info === "object" && parsed.basic_info !== null
      ? parsed.basic_info as Record<string, unknown>
      : typeof parsed.basicInfo === "object" && parsed.basicInfo !== null
        ? parsed.basicInfo as Record<string, unknown>
        : typeof parsed.candidate_info === "object" && parsed.candidate_info !== null
          ? parsed.candidate_info as Record<string, unknown>
          : typeof parsed.candidateInfo === "object" && parsed.candidateInfo !== null
            ? parsed.candidateInfo as Record<string, unknown>
        : null;

    const candidateOptions = Array.isArray(parsed.candidateOptions)
      ? parsed.candidateOptions
        .filter((opt): opt is Record<string, unknown> => typeof opt === "object" && opt !== null)
        .map((opt, index: number) => ({
          candidateId: typeof opt.candidateId === "string" ? opt.candidateId : undefined,
          candidateName: ensureNonEmptyString(
            opt.candidateName ?? opt.name,
            inferredCandidateName,
          ),
          confidence: normalizeConfidence(opt.confidence, index === 0 ? 0.82 : 0.55),
          reason: ensureNonEmptyString(
            opt.reason,
            typeof opt.optionText === "string" && opt.optionText.trim()
              ? `AI 候选选项：${opt.optionText.trim()}`
              : "根据简历与面试记录综合推断",
          ),
          evidence: Array.isArray(opt.evidence) ? opt.evidence.filter((e): e is string => typeof e === "string") : undefined,
        }))
      : [];

    if (candidateOptions.length === 0 && basicInfo) {
      candidateOptions.push({
        candidateId: undefined,
        candidateName: ensureNonEmptyString(basicInfo.name, inferredCandidateName),
        confidence: normalizeConfidence(parsed.confidence, 0.8),
        reason: "根据 AI 返回的 basic_info 生成候选人信息",
        evidence: undefined,
      });
    }

    const parsedRounds = Array.isArray(parsed.rounds)
      ? (parsed.rounds.length > 0
          ? parsed.rounds
          : (() => {
              const analysisRound = buildAnalysisBackfillRound(parsed);
              return analysisRound ? [analysisRound] : [];
            })())
      : (() => {
          const analysisRound = buildAnalysisBackfillRound(parsed);
          return analysisRound ? [analysisRound] : [];
        })();

    const rounds = Array.isArray(parsedRounds)
      ? parsedRounds
        .filter((round): round is Record<string, unknown> => typeof round === "object" && round !== null)
        .map((round, index: number) => ({
          inputIndex: typeof round.inputIndex === "number"
            ? round.inputIndex
            : typeof round.order === "number"
              ? Math.max(0, round.order - 1)
              : typeof round.round === "number"
                ? Math.max(0, round.round - 1)
                : index,
          resolvedRoundNumber: typeof round.resolvedRoundNumber === "number"
            ? round.resolvedRoundNumber
            : typeof round.roundNumber === "number"
              ? Math.max(1, round.roundNumber)
              : typeof round.order === "number" && Number.isFinite(round.order)
                ? Math.max(1, round.order)
                : typeof round.round === "number" && Number.isFinite(round.round)
                  ? Math.max(1, round.round)
                  : index + 1,
          roundNumber: typeof round.roundNumber === "number"
            ? round.roundNumber
            : typeof round.round === "number" && Number.isFinite(round.round)
              ? Math.max(1, round.round)
              : typeof round.order === "number" && Number.isFinite(round.order)
                ? Math.max(1, round.order)
                : index + 1,
          roundName: typeof round.roundName === "string"
            ? round.roundName
            : typeof round.type === "string"
              ? round.type
              : undefined,
          interviewDate: typeof round.interviewDate === "string" ? round.interviewDate : undefined,
          interviewerNames: splitInterviewerNames(round.interviewerNames ?? round.evaluator ?? round.interviewer),
          interviewType: typeof round.interviewType === "string"
            ? round.interviewType
            : typeof round.type === "string"
              ? round.type
              : undefined,
          evaluationText: buildRoundEvaluationText(round),
          resultLabel: normalizeRoundResultLabel(round.resultLabel, typeof round.optionText === "string" ? round.optionText.trim() : undefined),
          confidence: normalizeConfidence(round.confidence, 0.78),
          reason: ensureNonEmptyString(round.reason, "根据面试记录和简历内容自动生成"),
          auditSnapshot: {
            sourceText: typeof parsed.overallEvaluationText === "string" ? parsed.overallEvaluationText.slice(0, 500) : undefined,
            model: "ai_generated",
            promptVersion: "interview_import_v1",
            capturedAt: context.capturedAt,
          },
        }))
          .filter((round) => Boolean(round.evaluationText.trim()))
      : [];

    if (candidateOptions.length === 0) {
      candidateOptions.push({
        candidateId: undefined,
        candidateName: inferredCandidateName,
        confidence: 0.7,
        reason: "AI 返回结构不完整，已根据原始文本兜底候选人姓名",
        evidence: undefined,
      });
    }

    const overallEvaluationText = typeof parsed.overallEvaluationText === "string"
      ? parsed.overallEvaluationText
      : typeof parsed.position_match_analysis === "string"
        ? parsed.position_match_analysis
        : typeof parsed.positionMatchAnalysis === "string"
          ? parsed.positionMatchAnalysis
          : undefined;

    if (rounds.length === 0) {
      return null;
    }

    return {
      candidateOptions,
      rounds,
      overallEvaluationText,
      confidence: normalizeConfidence(parsed.confidence, 0.72),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.filter((r): r is string => typeof r === "string" && Boolean(r.trim())) : ["AI 生成"],
      auditSnapshot: {
        sourceText: context.sourceTextPreview?.slice(0, 500) || undefined,
        model: "ai_generated",
        promptVersion: "interview_import_v1",
        capturedAt: context.capturedAt,
      },
    };
  } catch (error) {
    logWarn("interview_import.ai_draft.parse_failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function normalizeAIDraft(
  payload: InterviewImportPayload,
  rawInput: InterviewImportRawInput,
  systemContext: InterviewImportSystemContext,
  capturedAt: number,
): Promise<InterviewImportAIDraft> {
  if (payload.aiDraft) {
    return payload.aiDraft;
  }

  const aiDraft = await generateInterviewImportAIDraft(rawInput, systemContext, capturedAt);
  if (aiDraft) {
    return aiDraft;
  }

  return buildCompatibilityAIDraft(payload, rawInput, systemContext, capturedAt);
}

function deriveDecisionState(
  payload: InterviewImportPayload,
  aiDraft: InterviewImportAIDraft,
  validationErrors: Array<{ field: string; message: string }>,
): InterviewImportDecisionState {
  if (validationErrors.length > 0) {
    return "rejected_invalid_input";
  }

  const providedDecision = payload.confirmation?.decisionState;
  if (providedDecision) {
    return providedDecision;
  }

  const rawInput = extractRawInput(payload);
  const hasMeetingNotes = Boolean(rawInput.meetingNotesText?.trim());
  const hasResumeText = Boolean(rawInput.resume?.extractedText?.trim() || rawInput.resume?.pdfPath?.trim());
  const topCandidateConfidence = aiDraft.candidateOptions[0]?.confidence ?? 0;
  const hasStructuredRound = aiDraft.rounds.some((round) => Boolean(round.evaluationText?.trim()));

  if (!hasMeetingNotes && hasResumeText && hasStructuredRound && topCandidateConfidence >= 0.9) {
    return "auto_commit";
  }

  const minConfidence = 0.7;
  if (!Number.isFinite(aiDraft.confidence) || aiDraft.confidence < minConfidence) {
    return "needs_confirmation";
  }

  return "auto_commit";
}

function normalizeConfirmationState(
  payload: InterviewImportPayload,
  decisionState: InterviewImportDecisionState,
  validationErrors: Array<{ field: string; message: string }>,
): InterviewImportConfirmationState {
  const provided = payload.confirmation;
  const reason = normalizeOptionalText(provided?.reason) ?? (decisionState === "needs_confirmation" ? "AI draft 置信度不足，需要人工确认后再落库。" : decisionState === "rejected_invalid_input" ? "输入数据校验失败。" : "AI draft 通过自动落库条件。");
  const warnings = Array.from(new Set([...(provided?.warnings ?? []), ...(decisionState === "needs_confirmation" ? ["AI draft 置信度不足，需要人工确认。"] : [])]));
  const errors = validationErrors.length > 0
    ? validationErrors
    : provided?.errors ?? [];

  return {
    decisionState,
    reason,
    warnings,
    errors,
  };
}

function parseInterviewImportPayload(payloadJson: string | null): InterviewImportPayload {
  if (!payloadJson?.trim()) {
    throw new Error("缺少 interview import payload_json");
  }

  return JSON.parse(payloadJson) as InterviewImportPayload;
}

function hasMixedRoundNumberInputs(payload: InterviewImportPayload): boolean {
  const hasExplicit = payload.rounds.some(
    (round) => typeof round.roundNumber === "number" && Number.isFinite(round.roundNumber),
  );
  const hasImplicit = payload.rounds.some(
    (round) => !(typeof round.roundNumber === "number" && Number.isFinite(round.roundNumber)),
  );
  return hasExplicit && hasImplicit;
}

function toBatchSummary(result: InterviewImportTaskResult): InterviewImportBatchSummary {
  const { summary } = result;
  return {
    createdCandidate: summary.createdCandidate ? summary.candidateId : null,
    candidateId: summary.candidateId,
    appendedRounds: summary.appendedRounds.length,
    skippedRounds: summary.skippedRounds.length,
    failedRounds: summary.failedRounds.length,
    workflowAdvance: summary.workflowAdvance,
    decisionState: result.decisionState,
    confirmation: result.confirmation,
    persistence: result.persistence,
    warnings: [...summary.warnings],
    errors: [...summary.errors],
  };
}

function stageWeight(stage: string | null | undefined): number {
  if (!stage) {
    return -1;
  }

  const index = STAGE_PRIORITY.indexOf(stage as typeof STAGE_PRIORITY[number]);
  return index >= 0 ? index : -1;
}

async function loadTask(taskId: string): Promise<LoadedInterviewImportTask> {
  const [task] = await db
    .select({
      id: importFileTasks.id,
      batchId: importFileTasks.batchId,
      status: importFileTasks.status,
      stage: importFileTasks.stage,
      payloadJson: importFileTasks.payloadJson,
    })
    .from(importFileTasks)
    .where(eq(importFileTasks.id, taskId))
    .limit(1);

  if (!task) {
    throw new Error(`interview import task not found: ${taskId}`);
  }

  return task;
}

async function loadBatch(batchId: string): Promise<LoadedInterviewImportBatch> {
  const [batch] = await db
    .select({
      id: importBatches.id,
      status: importBatches.status,
      sourceType: importBatches.sourceType,
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error(`interview import batch not found: ${batchId}`);
  }

  return batch;
}

async function updateTask(
  taskId: string,
  updates: Partial<{
    status: string;
    stage: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    candidateId: string | null;
    resultJson: string | null;
    updatedAt: number;
  }>,
) {
  await db.update(importFileTasks).set(updates).where(eq(importFileTasks.id, taskId));
}

async function updateBatch(
  batchId: string,
  updates: Partial<{
    status: string;
    currentStage: string | null;
    summaryJson: string | null;
    processedFiles: number;
    successFiles: number;
    failedFiles: number;
    startedAt: number | null;
    completedAt: number | null;
  }>,
) {
  await db.update(importBatches).set(updates).where(eq(importBatches.id, batchId));
}

async function markTaskCancelledIfNeeded(taskId: string): Promise<boolean> {
  const [row] = await db
    .select({
      taskStatus: importFileTasks.status,
      batchStatus: importBatches.status,
    })
    .from(importFileTasks)
    .innerJoin(importBatches, eq(importFileTasks.batchId, importBatches.id))
    .where(eq(importFileTasks.id, taskId))
    .limit(1);

  if (!row || row.batchStatus !== "cancelled") {
    return false;
  }

  if (row.taskStatus !== "skipped") {
    await updateTask(taskId, {
      status: "skipped",
      stage: "cancelled",
      errorCode: null,
      errorMessage: "cancelled by user",
      updatedAt: Date.now(),
    });
  }

  return true;
}

function buildPartialFailureResults(
  rounds: NormalizedInterviewImportRound[],
  skippedRounds: InterviewRoundSkippedResult[],
  reason: string,
): InterviewRoundFailedResult[] {
  const skippedRoundKeys = new Set(skippedRounds.map((round) => `${round.inputIndex}:${round.roundNumber}`));

  return rounds
    .filter((round) => !skippedRoundKeys.has(`${round.inputIndex}:${round.roundNumber}`))
    .map((round) => ({
      status: "failed",
      code: "round_persistence_failed",
      inputIndex: round.inputIndex,
      roundNumber: round.roundNumber,
      roundName: round.roundName,
      reason,
    }));
}

export async function refreshInterviewImportBatchProgress(batchId: string) {
  const [batch] = await db
    .select({
      status: importBatches.status,
      sourceType: importBatches.sourceType,
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (!batch) {
    return;
  }

  const allTasks = await db
    .select({
      id: importFileTasks.id,
      status: importFileTasks.status,
      stage: importFileTasks.stage,
      resultJson: importFileTasks.resultJson,
    })
    .from(importFileTasks)
    .where(eq(importFileTasks.batchId, batchId));

  const total = allTasks.length;
  const processed = allTasks.filter((task) => TERMINAL_TASK_STATUSES.includes(task.status as typeof TERMINAL_TASK_STATUSES[number])).length;
  const completed = allTasks.filter((task) => task.status === "completed").length;
  const partialSuccess = allTasks.filter((task) => task.status === "partial_success").length;
  const failed = allTasks.filter((task) => task.status === "failed").length;

  if (batch.status === "cancelled") {
    await updateBatch(batchId, {
      status: "cancelled",
      processedFiles: processed,
      successFiles: completed + partialSuccess,
      failedFiles: failed,
      currentStage: "cancelled",
      completedAt: Date.now(),
    });
    return;
  }

  const activeStage = allTasks
    .filter((task) => ACTIVE_TASK_STATUSES.includes(task.status as typeof ACTIVE_TASK_STATUSES[number]))
    .sort((left, right) => stageWeight(right.stage ?? right.status) - stageWeight(left.stage ?? left.status))[0]?.stage ?? null;

  let batchStatus = "processing";
  if (processed >= total) {
    if (failed === total && total > 0) {
      batchStatus = "failed";
    } else if (failed > 0 || partialSuccess > 0) {
      batchStatus = "partial_success";
    } else {
      batchStatus = "completed";
    }
  }

  let summaryJson: string | null = null;
  if (batch.sourceType === "interview_data") {
    const terminalTask = allTasks.find((task) => task.resultJson?.trim());
    if (terminalTask?.resultJson?.trim()) {
      summaryJson = JSON.stringify(toBatchSummary(JSON.parse(terminalTask.resultJson) as InterviewImportTaskResult));
    }
  }

  await updateBatch(batchId, {
    status: batchStatus,
    processedFiles: processed,
    successFiles: completed + partialSuccess,
    failedFiles: failed,
    currentStage: batchStatus === "processing" ? activeStage ?? batchStatus : batchStatus,
    completedAt: batchStatus === "processing" ? null : Date.now(),
    summaryJson,
  });
}

export async function processInterviewImportTask(
  taskId: string,
  options: ProcessInterviewImportTaskOptions = {},
): Promise<InterviewImportTaskResult> {
  const startedAt = Date.now();
  const task = await loadTask(taskId);
  const batch = await loadBatch(task.batchId);

  if (batch.sourceType !== "interview_data") {
    throw new Error(`task ${taskId} is not an interview_data import task`);
  }

  if (await markTaskCancelledIfNeeded(taskId)) {
    await refreshInterviewImportBatchProgress(task.batchId);
    return buildEmptyResult();
  }

  await updateBatch(task.batchId, {
    status: "processing",
    currentStage: "preparing",
    startedAt,
    completedAt: null,
  });
  await updateTask(taskId, {
    status: "preparing",
    stage: "preparing",
    updatedAt: startedAt,
  });

  let payload: InterviewImportPayload | null = null;
  let result = buildEmptyResult();

  try {
    await updateTask(taskId, {
      status: "parsing_payload",
      stage: "parsing_payload",
      updatedAt: Date.now(),
    });

    payload = parseInterviewImportPayload(task.payloadJson);
    result = buildEmptyResult(payload.mode);

    const rawInput = extractRawInput(payload);
    const systemContext = extractSystemContext(payload);

    if (options.resumePdf && !rawInput.resume?.extractedText) {
      try {
        await updateTask(taskId, {
          status: "extracting_resume",
          stage: "extracting_resume",
          updatedAt: Date.now(),
        });
        const uploadedPath = await saveInterviewImportUploadToLocal(
          task.batchId,
          options.resumePdf,
        );
        const extraction = await extractPdfTextFromFile(uploadedPath);
        if (extraction.sufficientText) {
          rawInput.resume = rawInput.resume ?? { pdfPath: uploadedPath };
          rawInput.resume.extractedText = extraction.text;
        }
      } catch (pdfError) {
        logWarn("interview_import.pipeline.pdf_extraction_failed_for_ai", {
          errorMessage: pdfError instanceof Error ? pdfError.message : String(pdfError),
        });
      }
    }

    const aiDraft = await normalizeAIDraft(payload, rawInput, systemContext, startedAt);
    const normalizedPayload = {
      ...payload,
    candidateId: normalizeOptionalText(getLegacyCandidateId(payload) ?? systemContext.candidateId),
    name: payload.mode === "create_candidate" ? normalizeOptionalText(getLegacyCandidateName(payload) ?? systemContext.candidateName) ?? getLegacyCandidateName(payload) : getLegacyCandidateName(payload),
    rawInput,
    systemContext,
    aiDraft,
  } as unknown as InterviewImportPayload;
    const aiDraftErrors = validateInterviewImportAIDraft(aiDraft);
    const payloadErrors = validateInterviewImportPayload(normalizedPayload);
    const validationErrors = [...payloadErrors, ...aiDraftErrors];
    const decisionState = deriveDecisionState(normalizedPayload, aiDraft, validationErrors);
    const confirmation = normalizeConfirmationState(normalizedPayload, decisionState, validationErrors);

    result.rawInput = rawInput;
    result.systemContext = systemContext;
    result.aiDraft = aiDraft;
    result.confirmation = confirmation;
    result.decisionState = decisionState;
    result.summary.warnings.push(...confirmation.warnings);
    result.summary.errors.push(...confirmation.errors.map((error) => `${error.field}: ${error.message}`));

    if (hasMixedRoundNumberInputs(payload)) {
      result.summary.warnings.push(MIXED_ROUND_NUMBER_WARNING);
      logWarn("interview_import.pipeline.mixed_round_numbers", {
        taskId,
        batchId: task.batchId,
      });
    }

    if (decisionState === "rejected_invalid_input") {
      result.summary.errors.push("AI draft 或输入内容校验失败，已拒绝落库");
      result.completedAt = Date.now();
      result.persistence = {
        state: "failed",
        candidateId: null,
        batchId: task.batchId,
        taskId,
        warnings: [...result.summary.warnings],
        errors: [...result.summary.errors],
        snapshotRef: {
          payloadJson: JSON.stringify(normalizedPayload),
          aiDraftJson: JSON.stringify(aiDraft),
          confirmationJson: JSON.stringify(confirmation),
          resultJson: JSON.stringify({ ...result, persistence: null }),
          auditSnapshotJson: JSON.stringify(aiDraft.auditSnapshot),
        },
      };
      await updateTask(taskId, {
        status: "failed",
        stage: "failed",
        candidateId: null,
        resultJson: JSON.stringify(result),
        errorCode: "INTERVIEW_IMPORT_FAILED",
        errorMessage: result.summary.errors.join("；") || "interview import rejected",
        updatedAt: Date.now(),
      });
      await refreshInterviewImportBatchProgress(task.batchId);
      return result;
    }

    if (decisionState === "needs_confirmation") {
      result.completedAt = Date.now();
      result.persistence = {
        state: "pending",
        candidateId: null,
        batchId: task.batchId,
        taskId,
        warnings: [...result.summary.warnings],
        errors: [...result.summary.errors],
        snapshotRef: {
          payloadJson: JSON.stringify(normalizedPayload),
          aiDraftJson: JSON.stringify(aiDraft),
          confirmationJson: JSON.stringify(confirmation),
          resultJson: JSON.stringify({ ...result, persistence: null }),
          auditSnapshotJson: JSON.stringify(aiDraft.auditSnapshot),
        },
      };

      await updateTask(taskId, {
        status: "partial_success",
        stage: "needs_confirmation",
        candidateId: null,
        resultJson: JSON.stringify(result),
        errorCode: null,
        errorMessage: null,
        updatedAt: Date.now(),
      });
      await refreshInterviewImportBatchProgress(task.batchId);
      return result;
    }

    const hasResumeInput = Boolean(options.resumePdf || rawInput.resume?.pdfPath?.trim());
    await updateTask(taskId, {
      status: hasResumeInput ? "extracting_resume" : "resolving_candidate",
      stage: hasResumeInput ? "extracting_resume" : "resolving_candidate",
      updatedAt: Date.now(),
      resultJson: JSON.stringify(result),
    });

    const candidateResolution = await resolveInterviewImportCandidate(normalizedPayload, {
      batchId: task.batchId,
      resumePdf: options.resumePdf,
      systemContext,
      aiDraft,
      now: startedAt,
    });
    result.candidateResolution = candidateResolution;
    result.summary.createdCandidate = candidateResolution.createdCandidate;
    result.summary.candidateId = candidateResolution.candidateId;

    if (candidateResolution.resumeError) {
      result.summary.errors.push(`简历导入失败：${candidateResolution.resumeError.message}`);
    }

    if (await markTaskCancelledIfNeeded(taskId)) {
      await refreshInterviewImportBatchProgress(task.batchId);
      return result;
    }

    await updateTask(taskId, {
      status: "appending_rounds",
      stage: "appending_rounds",
      candidateId: candidateResolution.candidateId,
      resultJson: JSON.stringify(result),
      updatedAt: Date.now(),
    });

    const existingInterviews = await db
      .select({
        id: interviews.id,
        round: interviews.round,
      })
      .from(interviews)
      .where(eq(interviews.candidateId, candidateResolution.candidateId));

    const roundPersistence = prepareInterviewRoundPersistence({
      candidateId: candidateResolution.candidateId,
      rounds: aiDraft.rounds,
      existingInterviews,
      now: startedAt,
    });

    result.roundPersistence = roundPersistence;

    try {
      await db.transaction(async (tx) => {
        if (roundPersistence.interviewCreates.length > 0) {
          await tx.insert(interviews).values(roundPersistence.interviewCreates);
        }
        if (roundPersistence.assessmentCreates.length > 0) {
          await tx.insert(interviewAssessments).values(roundPersistence.assessmentCreates);
        }
      });

      result.summary.appendedRounds = roundPersistence.summary.appendedRounds;
      result.summary.skippedRounds = roundPersistence.summary.skippedRounds;
      result.summary.failedRounds = roundPersistence.summary.failedRounds;
    } catch (error) {
      const reason = normalizeMessage(error);
      result.summary.skippedRounds = roundPersistence.summary.skippedRounds;
      result.summary.failedRounds = buildPartialFailureResults(
        roundPersistence.normalizedRounds,
        roundPersistence.summary.skippedRounds,
        reason,
      );
      result.summary.errors.push(`面试轮次写入失败：${reason}`);
      logError("interview_import.pipeline.round_persistence_failed", error, {
        taskId,
        batchId: task.batchId,
        candidateId: candidateResolution.candidateId,
      });
    }

    await updateTask(taskId, {
      status: "ai_advancing_stage",
      stage: "ai_advancing_stage",
      candidateId: candidateResolution.candidateId,
      resultJson: JSON.stringify(result),
      updatedAt: Date.now(),
    });

    const workflowAdvanceResult: InterviewImportWorkflowAdvanceServiceResult = await advanceInterviewImportWorkflow({
      batchId: task.batchId,
      importSource: batch.sourceType ?? "interview_data",
      candidateId: candidateResolution.candidateId,
      roundPersistence: result.roundPersistence,
    });
    result.summary.workflowAdvance = workflowAdvanceResult;

    if (workflowAdvanceResult.errorMessage) {
      result.summary.errors.push(`工作流推进失败：${workflowAdvanceResult.errorMessage}`);
      logWarn("interview_import.pipeline.workflow_advance_failed", {
        taskId,
        batchId: task.batchId,
        candidateId: candidateResolution.candidateId,
        errorMessage: workflowAdvanceResult.errorMessage,
      });
    }

    const finalStatus = resolveTaskTerminalStatus(result.summary);
    result.completedAt = Date.now();
    result.persistence = {
      state: finalStatus === "completed" ? "persisted" : finalStatus === "partial_success" ? "persisted" : "failed",
      candidateId: candidateResolution.candidateId,
      batchId: task.batchId,
      taskId,
      warnings: [...result.summary.warnings],
      errors: [...result.summary.errors],
      snapshotRef: {
        payloadJson: JSON.stringify(normalizedPayload),
        aiDraftJson: JSON.stringify(aiDraft),
        confirmationJson: JSON.stringify(confirmation),
        resultJson: JSON.stringify({ ...result, persistence: null }),
        auditSnapshotJson: JSON.stringify(aiDraft.auditSnapshot),
      },
    };

    await updateTask(taskId, {
      status: finalStatus,
      stage: finalStatus,
      candidateId: candidateResolution.candidateId,
      resultJson: JSON.stringify(result),
      errorCode: finalStatus === "failed" ? "INTERVIEW_IMPORT_FAILED" : null,
      errorMessage: finalStatus === "failed" ? result.summary.errors.join("；") || "interview import failed" : null,
      updatedAt: Date.now(),
    });

    await refreshInterviewImportBatchProgress(task.batchId);

    logInfo("interview_import.pipeline.finish", {
      taskId,
      batchId: task.batchId,
      candidateId: candidateResolution.candidateId,
      status: finalStatus,
      appendedRounds: result.summary.appendedRounds.length,
      skippedRounds: result.summary.skippedRounds.length,
      failedRounds: result.summary.failedRounds.length,
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (error) {
    const message = normalizeMessage(error);
    result.summary.errors.push(message);
    result.completedAt = Date.now();

    await updateTask(taskId, {
      status: "failed",
      stage: "failed",
      candidateId: result.summary.candidateId,
      resultJson: JSON.stringify(result),
      errorCode: "INTERVIEW_IMPORT_FAILED",
      errorMessage: message,
      updatedAt: Date.now(),
    });
    await refreshInterviewImportBatchProgress(task.batchId);

    logError("interview_import.pipeline.failed", error, {
      taskId,
      batchId: task.batchId,
      mode: payload?.mode ?? null,
      durationMs: Date.now() - startedAt,
    });

    return result;
  }
}

function resolveTaskTerminalStatus(summary: InterviewImportTaskSummary): "completed" | "partial_success" | "failed" {
  const hasFailedRounds = summary.failedRounds.length > 0;
  const hasWarningsOrErrors = summary.warnings.length > 0 || summary.errors.length > 0;
  const hasSuccessfulRoundOutcome = summary.appendedRounds.length > 0 || summary.skippedRounds.length > 0;

  if (hasFailedRounds && !hasSuccessfulRoundOutcome) {
    return "failed";
  }

  if (hasFailedRounds || hasWarningsOrErrors) {
    return "partial_success";
  }

  return "completed";
}
