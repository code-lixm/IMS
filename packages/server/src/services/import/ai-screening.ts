import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { providerCredentials, users } from "../../schema";
import type {
  ImportScreeningConclusion,
  ScreeningTemplateInfo,
  ScreeningTemplateRenderedInfo,
} from "@ims/shared";
import { screeningTemplatesService, type ScreeningTemplatesService } from "../screening-templates";

type ImportScreeningConclusionWithMetadata = ImportScreeningConclusion & {
  candidateName?: string | null;
  candidatePosition?: string | null;
  candidateYearsOfExperience?: number | null;
  screeningBaseUrl?: string | null;
};

type AiScreeningOutputWithMetadata = Partial<AiScreeningOutput> & {
  templateInfo?: ScreeningTemplateInfo;
  renderedPromptSnapshot?: string;
};

interface ScreeningTemplatePromptContext {
  templateInfo: ScreeningTemplateInfo;
}

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = process.env.CUSTOM_BASE_URL || "https://ai-gateway.vercel.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_API_KEY = process.env.CUSTOM_API_KEY || process.env.VERCEL_AI_GATEWAY_TOKEN || "";
const DEFAULT_IMPORT_SCREENING_MODEL = process.env.IMPORT_SCREENING_MODEL || process.env.CUSTOM_MODEL_ID || "gpt-4o-mini";
const IMPORT_SCREENING_SYSTEM_LINES = [
  "你是批量简历初筛 Agent。",
  "你只输出 JSON，不输出额外解释。",
  "请基于简历解析结果给出明确结论：通过 / 待定 / 淘汰。",
  "输出 JSON 字段必须严格包含：verdict,label,score,candidateName,candidatePosition,candidateYearsOfExperience,screeningBaseUrl,summary,strengths,concerns,recommendedAction,wechatConclusion,wechatReason,wechatAction,wechatCopyText。",
  "verdict 只能是 pass、review、reject。",
  "label 只能是 通过、待定、淘汰。",
  "score 是 0-100 的整数。",
  "strengths 和 concerns 各返回 0-3 条简短中文句子。",
  "recommendedAction 返回一句中文建议动作。",
  "wechatConclusion、wechatReason、wechatAction 都必须是单句中文，分别对应结论、原因、建议，不能带编号。",
  "wechatCopyText 必须严格由这三句按换行拼成：第1行为 wechatConclusion，第2行为 wechatReason，第3行为 wechatAction。不要输出额外句子。",
] as const;

let screeningQueue: Promise<void> = Promise.resolve();

interface ParsedResumeInput {
  name: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  education: string[];
  workHistory: string[];
  rawText: string;
}

interface AiScreeningOutput {
  verdict: "pass" | "review" | "reject";
  label: string;
  score: number;
  candidateName: string | null;
  candidatePosition: string | null;
  candidateYearsOfExperience: number | null;
  screeningBaseUrl: string | null;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendedAction: string;
  wechatConclusion: string;
  wechatReason: string;
  wechatAction: string;
  wechatCopyText: string;
}

export async function generateImportScreeningConclusionWithAI(input: {
  parsed: ParsedResumeInput;
  confidence: number;
  fileName: string;
  templateId?: string;
}): Promise<ImportScreeningConclusion> {
  return runScreeningSerially(async () => {
    const endpoint = await resolveImportAiEndpoint();
    const templateContext = await resolveScreeningTemplateContext(input.templateId);

    if (!endpoint.apiKey.trim()) {
      throw new Error("AI screening is not configured");
    }

    if (endpoint.providerId === "minimax") {
      return generateMiniMaxScreeningConclusion(input, endpoint, templateContext);
    }

    const provider = createOpenAI({
      name: endpoint.providerId || "import-screening-openai-compatible",
      baseURL: normalizeOpenAIBaseURL(endpoint.baseURL),
      apiKey: endpoint.apiKey,
    });
    const systemPrompt = buildImportScreeningSystemPrompt(templateContext);

    try {
      const result = await generateText({
        model: provider.chat(parseRuntimeModelName(endpoint.model)),
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(45_000),
        system: systemPrompt,
        prompt: JSON.stringify({
          fileName: input.fileName,
          extractionConfidence: input.confidence,
          candidate: {
            name: input.parsed.name,
            phone: input.parsed.phone,
            email: input.parsed.email,
            position: input.parsed.position,
            yearsOfExperience: input.parsed.yearsOfExperience,
            skills: input.parsed.skills,
            education: input.parsed.education,
            workHistory: input.parsed.workHistory,
            rawTextPreview: input.parsed.rawText.slice(0, 6000),
          },
        }),
      });

      if (!result.text?.trim()) {
        throw new Error("AI screening returned empty content");
      }

      return normalizeAiScreeningOutput(
        {
          ...(JSON.parse(stripAssistantFormatting(result.text)) as Partial<AiScreeningOutput>),
          templateInfo: templateContext?.templateInfo,
          renderedPromptSnapshot: templateContext ? systemPrompt : undefined,
        },
        input,
        endpoint.baseURL,
      );
    } catch (error) {
      throw new Error(`AI screening request failed: ${(error as Error).message}`);
    }
  });
}

async function runScreeningSerially<T>(job: () => Promise<T>): Promise<T> {
  const previous = screeningQueue;
  let release!: () => void;
  screeningQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);

  try {
    return await job();
  } finally {
    release();
  }
}

async function generateMiniMaxScreeningConclusion(
  input: { parsed: ParsedResumeInput; confidence: number; fileName: string; templateId?: string },
  endpoint: { baseURL: string; apiKey: string; model: string; providerId?: string | null },
  templateContext: ScreeningTemplatePromptContext | null,
): Promise<ImportScreeningConclusion> {
  const systemPrompt = buildImportScreeningSystemPrompt(templateContext);

  const response = await fetch(`${normalizeOpenAIBaseURL(endpoint.baseURL)}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: parseRuntimeModelName(endpoint.model),
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            fileName: input.fileName,
            extractionConfidence: input.confidence,
            candidate: {
              name: input.parsed.name,
              phone: input.parsed.phone,
              email: input.parsed.email,
              position: input.parsed.position,
              yearsOfExperience: input.parsed.yearsOfExperience,
              skills: input.parsed.skills,
              education: input.parsed.education,
              workHistory: input.parsed.workHistory,
              rawTextPreview: input.parsed.rawText.slice(0, 6000),
            },
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`AI screening request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.slice(0, 400)}` : ""}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
    base_resp?: { status_code?: number; status_msg?: string };
  };

  if (payload.base_resp?.status_code && payload.base_resp.status_code !== 0) {
    throw new Error(payload.base_resp.status_msg || `MiniMax error ${payload.base_resp.status_code}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("AI screening returned empty content");
  }

  return normalizeAiScreeningOutput(
    {
      ...(JSON.parse(stripAssistantFormatting(content)) as Partial<AiScreeningOutput>),
      templateInfo: templateContext?.templateInfo,
      renderedPromptSnapshot: templateContext ? systemPrompt : undefined,
    },
    input,
    endpoint.baseURL,
  );
}

async function resolveScreeningTemplateContext(
  templateId: string | undefined,
  templateService: Pick<ScreeningTemplatesService, "getTemplate"> = screeningTemplatesService,
): Promise<ScreeningTemplatePromptContext | null> {
  const normalizedTemplateId = templateId?.trim();
  if (!normalizedTemplateId) {
    return null;
  }

  const template = await templateService.getTemplate(normalizedTemplateId);
  if (!template) {
    return null;
  }

  return {
    templateInfo: {
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.version,
      promptSnapshot: template.prompt,
    },
  };
}

function buildImportScreeningSystemPrompt(templateContext: ScreeningTemplatePromptContext | null): string {
  if (!templateContext) {
    return IMPORT_SCREENING_SYSTEM_LINES.join("\n");
  }

  return [
    "---",
    `【模板名称】${templateContext.templateInfo.templateName}`,
    "【筛选标准】",
    templateContext.templateInfo.promptSnapshot,
    "---",
    ...IMPORT_SCREENING_SYSTEM_LINES,
  ].join("\n");
}

async function resolveImportAiEndpoint() {
  if (DEFAULT_OPENAI_COMPATIBLE_API_KEY.trim()) {
    return {
      baseURL: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      apiKey: DEFAULT_OPENAI_COMPATIBLE_API_KEY,
      model: DEFAULT_IMPORT_SCREENING_MODEL,
    };
  }

  const [credential] = await db
    .select({ apiKey: providerCredentials.apiKey })
    .from(providerCredentials)
    .where(eq(providerCredentials.provider, "openai"))
    .limit(1);

  if (credential?.apiKey?.trim()) {
    return {
      baseURL: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      apiKey: credential.apiKey,
      model: DEFAULT_IMPORT_SCREENING_MODEL,
      providerId: "openai",
    };
  }

  const [user] = await db.select({ settingsJson: users.settingsJson }).from(users).limit(1);
  const customEndpoint = extractFirstCustomEndpoint(user?.settingsJson);
  if (customEndpoint?.apiKey?.trim()) {
    return {
      baseURL: customEndpoint.baseURL || DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      apiKey: customEndpoint.apiKey,
      model: customEndpoint.providerId === "minimax" ? "MiniMax-M2.7" : DEFAULT_IMPORT_SCREENING_MODEL,
      providerId: customEndpoint.providerId ?? null,
    };
  }

  return {
    baseURL: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
    apiKey: "",
    model: DEFAULT_IMPORT_SCREENING_MODEL,
    providerId: null,
  };
}

function normalizeAiScreeningOutput(
  raw: AiScreeningOutputWithMetadata,
  input: { parsed: ParsedResumeInput; confidence: number; fileName: string },
  baseURL: string,
): ImportScreeningConclusionWithMetadata {
  const verdict = raw.verdict === "pass" || raw.verdict === "review" || raw.verdict === "reject"
    ? raw.verdict
    : "review";

  const label = verdict === "pass"
    ? "通过"
    : verdict === "reject"
      ? "淘汰"
      : "待定";

  const score = Number.isFinite(raw.score)
    ? Math.max(0, Math.min(100, Math.round(raw.score ?? 0)))
    : 60;

  const summary = typeof raw.summary === "string" && raw.summary.trim()
    ? raw.summary.trim()
    : "已完成 AI 初筛，请结合岗位要求继续确认。";
  const strengths = Array.isArray(raw.strengths)
    ? raw.strengths.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : [];
  const concerns = Array.isArray(raw.concerns)
    ? raw.concerns.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : [];
  const recommendedAction = typeof raw.recommendedAction === "string" && raw.recommendedAction.trim()
    ? raw.recommendedAction.trim()
    : verdict === "pass"
      ? "建议进入后续面试环节"
      : verdict === "reject"
        ? "建议暂不进入后续流程"
        : "建议人工复核后再决定";
  const fallbackParts = buildWechatCopyParts(label, verdict, summary, strengths, concerns, recommendedAction);
  const wechatConclusion = typeof raw.wechatConclusion === "string" && raw.wechatConclusion.trim()
    ? raw.wechatConclusion.trim()
    : fallbackParts.wechatConclusion;
  const wechatReason = typeof raw.wechatReason === "string" && raw.wechatReason.trim()
    ? raw.wechatReason.trim()
    : fallbackParts.wechatReason;
  const wechatAction = typeof raw.wechatAction === "string" && raw.wechatAction.trim()
    ? raw.wechatAction.trim()
    : fallbackParts.wechatAction;
  const wechatCopyText = typeof raw.wechatCopyText === "string" && raw.wechatCopyText.trim()
    ? buildWechatCopyText(wechatConclusion, wechatReason, wechatAction, raw.wechatCopyText)
    : buildWechatCopyText(wechatConclusion, wechatReason, wechatAction);
  const templateInfo = raw.templateInfo && typeof raw.renderedPromptSnapshot === "string" && raw.renderedPromptSnapshot.trim()
    ? {
      ...raw.templateInfo,
      renderedPromptSnapshot: raw.renderedPromptSnapshot,
    } satisfies ScreeningTemplateInfo & ScreeningTemplateRenderedInfo
    : undefined;

  return {
    verdict,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : label,
    score,
    candidateName: typeof raw.candidateName === "string" && raw.candidateName.trim()
      ? raw.candidateName.trim()
      : input.parsed.name,
    candidatePosition: typeof raw.candidatePosition === "string" && raw.candidatePosition.trim()
      ? raw.candidatePosition.trim()
      : input.parsed.position,
    candidateYearsOfExperience: Number.isFinite(raw.candidateYearsOfExperience)
      ? Math.max(0, Math.round(raw.candidateYearsOfExperience ?? 0))
      : input.parsed.yearsOfExperience,
    screeningBaseUrl: typeof raw.screeningBaseUrl === "string" && raw.screeningBaseUrl.trim()
      ? raw.screeningBaseUrl.trim()
      : baseURL,
    summary,
    strengths,
    concerns,
    recommendedAction,
    wechatConclusion,
    wechatReason,
    wechatAction,
    wechatCopyText,
    templateInfo,
  };
}

function buildWechatCopyParts(
  label: string,
  verdict: "pass" | "review" | "reject",
  summary: string,
  strengths: string[],
  concerns: string[],
  recommendedAction: string,
) {
  const summaryText = summary.trim()
    ? summary.trim()
    : verdict === "pass"
      ? "匹配度较高，建议继续推进。"
      : verdict === "reject"
        ? "当前匹配度不足，不建议继续推进。"
        : "匹配度尚可，但仍需补充确认关键信息。";
  const reasonText = verdict === "reject"
    ? (concerns.find((item) => item.trim()) ?? summaryText)
    : (strengths.find((item) => item.trim()) ?? summaryText);
  const actionText = recommendedAction.trim()
    ? recommendedAction.trim()
    : verdict === "pass"
      ? "建议进入后续面试环节。"
      : verdict === "reject"
        ? "建议暂不进入后续流程。"
        : "建议人工复核后再决定。";

  return {
    wechatConclusion: `${label}：${summaryText}`,
    wechatReason: `原因：${reasonText}`,
    wechatAction: `建议：${actionText}`,
  };
}

function buildWechatCopyText(
  wechatConclusion: string,
  wechatReason: string,
  wechatAction: string,
  rawWechatCopyText?: string,
) {
  const lines = [wechatConclusion.trim(), wechatReason.trim(), wechatAction.trim()].filter(Boolean);
  if (lines.length === 3) {
    return lines.join("\n");
  }

  return rawWechatCopyText?.trim() || [wechatConclusion, wechatReason, wechatAction].join("\n");
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

function extractFirstCustomEndpoint(settingsJson: string | null | undefined) {
  if (!settingsJson?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(settingsJson) as {
      lui?: {
        customEndpoints?: Array<{
          baseURL?: string;
          apiKey?: string;
          providerId?: string;
        }>;
      };
    };
    const endpoints = parsed.lui?.customEndpoints;
    if (!Array.isArray(endpoints)) {
      return null;
    }
    return endpoints.find(endpoint => typeof endpoint?.apiKey === "string" && endpoint.apiKey.trim()) ?? null;
  } catch {
    return null;
  }
}

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
