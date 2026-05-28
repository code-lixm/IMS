import { createHash } from "node:crypto";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { providerCredentials, users } from "../../schema";
import type {
  ImportScreeningConclusion as BaseImportScreeningConclusion,
  MatchingTemplate,
  ScreeningTemplateInfo,
  ScreeningTemplateRenderedInfo,
  TemplateEvidence,
  TemplateEvidenceMatchedItem,
  TemplateEvidenceUnmatchedItem,
} from "../../../../shared/src/api-types";
import { PRESET_PROVIDER_BASE_URLS, resolvePresetProviderBaseUrl } from "../../../../shared/src/ai-provider-presets";
import {
  screeningTemplatesService,
  shortlistScreeningTemplatesByResume,
  type ScreeningTemplateShortlistItem,
  type ScreeningTemplatesService,
} from "../screening-templates";

type ImportScreeningConclusion = BaseImportScreeningConclusion & {
  matchedTemplateId?: string | null;
};

type ImportScreeningConclusionWithMetadata = ImportScreeningConclusion & {
  candidateName?: string | null;
  candidatePosition?: string | null;
  candidateYearsOfExperience?: number | null;
  candidateEducation?: string[];
  candidateSchools?: string[];
  screeningBaseUrl?: string | null;
};

type AiScreeningOutputWithMetadata = Partial<AiScreeningOutput> & {
  templateInfo?: ScreeningTemplateInfo;
  renderedPromptSnapshot?: string;
};

interface ScreeningTemplatePromptContext {
  templateInfo: ScreeningTemplateInfo;
  matchedTemplateId: string;
  selectionSource: "direct_template" | "group_explicit" | "group_default" | "group_shortlist" | "group_ai";
  shortlistedTemplateIds: string[];
}

export interface ImportScreeningReuseContext {
  matchedTemplateId: string | null;
  normalizedBaseURL: string;
  promptSnapshot: string;
  shortlistedTemplateIds: string[];
  screeningModel: string;
  screeningProviderId: string | null;
  selectionSource: "none" | ScreeningTemplatePromptContext["selectionSource"];
  templateInfo?: ScreeningTemplateInfo & ScreeningTemplateRenderedInfo;
}

interface ResolvedImportScreeningRunContext extends ImportScreeningReuseContext {}

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = process.env.CUSTOM_BASE_URL || "https://ai-gateway.vercel.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_API_KEY = process.env.CUSTOM_API_KEY || process.env.VERCEL_AI_GATEWAY_TOKEN || "";
const DEFAULT_IMPORT_SCREENING_MODEL = process.env.IMPORT_SCREENING_MODEL || process.env.CUSTOM_MODEL_ID || "gpt-4o-mini";
const MINIMAX_BASE_URL = resolvePresetProviderBaseUrl("minimax", process.env.MINIMAX_API_HOST) || "https://api.minimaxi.com/v1";
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY?.trim() || "";
const IMPORT_SCREENING_SYSTEM_LINES = [
  "你是批量简历初筛 Agent。",
  "你只输出 JSON，不输出额外解释。",
  "请基于简历解析结果给出明确结论：通过 / 待定 / 淘汰。",
  "输出 JSON 字段必须严格包含：verdict,label,score,candidateName,candidatePosition,candidateYearsOfExperience,candidateEducation,candidateSchools,screeningBaseUrl,summary,strengths,concerns,recommendedAction,wechatConclusion,wechatReason,wechatAction,wechatCopyText。",
  "如果提供了筛选模板，还必须包含 templateEvidence 字段，格式为 { matched: [{item,evidence}], unmatched: [{item,reason}] }。",
  "templateEvidence.matched 每项的 item 是匹配的筛选标准/关键词，evidence 是简历中对应的具体证据。",
  "templateEvidence.unmatched 每项的 item 是未匹配的筛选标准/关键词，reason 是未匹配的原因。",
  "matched 和 unmatched 各最多 6 条，按重要性排序。无模板时省略 templateEvidence 字段。",
  "item 字段应使用模板原文中的关键词或标准描述，不要改写。",
  "evidence 和 reason 各为一句简短中文，直接引用或概括简历内容。",
  "candidateEducation 必须是字符串数组，优先从简历原文识别完整教育经历，每条尽量包含学校、学历/学位、专业、时间；无法识别时返回空数组。",
  "candidateSchools 必须是字符串数组，从简历中提取每段教育经历对应的完整大学/学院官方全称，例如'清华大学'而非'清华'；保留括号地点或校区信息，例如'华北电力大学（保定）'，但不要附带院系、专业、时间等额外信息；无法识别时返回空数组。",
  "verdict 只能是 pass、review、reject。",
  "label 只能是 通过、待定、淘汰。",
  "score 是 0-100 的整数。",
  "strengths 和 concerns 各返回 0-3 条简短中文句子。",
  "recommendedAction 返回一句中文建议动作。",
  "wechatConclusion、wechatReason、wechatAction 都必须是单句中文，分别对应结论、原因、建议，不能带编号。",
  "wechatCopyText 必须严格由这三句按换行拼成：第1行为 wechatConclusion，第2行为 wechatReason，第3行为 wechatAction。不要输出额外句子。",
] as const;

const TEMPLATE_SELECTION_SYSTEM_LINES = [
  "你是简历模板路由助手。",
  "你只能从候选 shortlist 中选择 1 个最合适的模板。",
  "只输出 JSON，不输出额外解释。",
  '输出格式必须严格为：{"templateId":"候选模板ID","reason":"一句中文理由"}。',
  "templateId 必须来自输入中的 shortlist。",
  "如果多个模板都能匹配，优先选择与候选人岗位、技能、经历最贴近的那个。",
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
  candidateEducation: string[];
  candidateSchools: string[];
  templateEvidence?: TemplateEvidence;
}

export async function generateImportScreeningConclusionWithAI(input: {
  parsed: ParsedResumeInput;
  confidence: number;
  fileName: string;
  groupId?: string | null;
  templateId?: string;
  resolvedContext?: ResolvedImportScreeningRunContext;
  learningFeedback?: string[];
}): Promise<ImportScreeningConclusion> {
  return runScreeningSerially(async () => {
    const resolvedContext = input.resolvedContext ?? await resolveImportScreeningReuseContext({
      parsed: input.parsed,
      groupId: input.groupId,
      templateId: input.templateId,
    });
    const endpoint = await resolveImportAiEndpoint();

    if (!endpoint.apiKey.trim()) {
      throw new Error("AI screening is not configured");
    }
    const templateContext = buildPromptContextFromReuseContext(resolvedContext);
    const systemPrompt = input.learningFeedback && input.learningFeedback.length > 0
      ? buildImportScreeningSystemPrompt(templateContext, input.learningFeedback)
      : resolvedContext.promptSnapshot || buildImportScreeningSystemPrompt(templateContext, input.learningFeedback);

    try {
      const content = await requestImportAiText({
        endpoint,
        systemPrompt,
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

      return normalizeAiScreeningOutput(
        {
          ...(JSON.parse(stripAssistantFormatting(content)) as Partial<AiScreeningOutput>),
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

async function requestImportAiText(input: {
  endpoint: { baseURL: string; apiKey: string; model: string; providerId?: string | null };
  systemPrompt: string;
  prompt: string;
}): Promise<string> {
  if (input.endpoint.providerId === "minimax") {
    return requestMiniMaxText(input);
  }

  const provider = createOpenAI({
    name: input.endpoint.providerId || "import-screening-openai-compatible",
    baseURL: normalizeOpenAIBaseURL(input.endpoint.baseURL),
    apiKey: input.endpoint.apiKey,
  });

  const result = await generateText({
    model: provider.chat(parseRuntimeModelName(input.endpoint.model)),
    temperature: 0.1,
    abortSignal: AbortSignal.timeout(45_000),
    system: input.systemPrompt,
    prompt: input.prompt,
  });

  if (!result.text?.trim()) {
    throw new Error("AI screening returned empty content");
  }

  return result.text;
}

async function requestMiniMaxText(input: {
  endpoint: { baseURL: string; apiKey: string; model: string; providerId?: string | null };
  systemPrompt: string;
  prompt: string;
}): Promise<string> {
  const response = await fetch(`${normalizeOpenAIBaseURL(input.endpoint.baseURL)}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: parseRuntimeModelName(input.endpoint.model),
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.prompt,
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

  return content;
}

export async function resolveScreeningTemplateContext(
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
    matchedTemplateId: template.id,
    selectionSource: "direct_template",
    shortlistedTemplateIds: [template.id],
  };
}

function buildImportScreeningSystemPrompt(
  templateContext: ScreeningTemplatePromptContext | null,
  learningFeedback?: string[],
): string {
  const feedbackBlock = learningFeedback && learningFeedback.length > 0
    ? [
        "---",
        "【本地人工反馈样本】",
        "以下是同分组/同模板下最近的人工改分记录，仅作为评分尺度校准参考，不能替代简历事实本身：",
        ...learningFeedback,
      ]
    : [];

  if (!templateContext) {
    return [...feedbackBlock, ...IMPORT_SCREENING_SYSTEM_LINES].join("\n");
  }

  return [
    "---",
    `【模板名称】${templateContext.templateInfo.templateName}`,
    "【筛选标准】",
    templateContext.templateInfo.promptSnapshot,
    "---",
    ...feedbackBlock,
    ...IMPORT_SCREENING_SYSTEM_LINES,
  ].join("\n");
}

export async function resolveImportAiEndpoint() {
  if (DEFAULT_OPENAI_COMPATIBLE_API_KEY.trim()) {
    return {
      baseURL: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      apiKey: DEFAULT_OPENAI_COMPATIBLE_API_KEY,
      model: DEFAULT_IMPORT_SCREENING_MODEL,
      providerId: "openai-compatible",
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
  const customEndpoint = extractPreferredCustomEndpoint(user?.settingsJson);
  if (customEndpoint?.apiKey?.trim()) {
    const resolvedApiKey = customEndpoint.providerId === "minimax" && MINIMAX_API_KEY
      ? MINIMAX_API_KEY
      : customEndpoint.apiKey;
    return {
      baseURL: customEndpoint.baseURL || DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      apiKey: resolvedApiKey,
      model: customEndpoint.modelId || (customEndpoint.providerId === "minimax" ? "MiniMax-M2.7" : DEFAULT_IMPORT_SCREENING_MODEL),
      providerId: customEndpoint.providerId ?? "openai-compatible",
    };
  }

  if (MINIMAX_API_KEY) {
    return {
      baseURL: MINIMAX_BASE_URL,
      apiKey: MINIMAX_API_KEY,
      model: "MiniMax-M2.7",
      providerId: "minimax",
    };
  }

  return {
    baseURL: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
    apiKey: "",
    model: DEFAULT_IMPORT_SCREENING_MODEL,
    providerId: "openai-compatible",
  };
}

export async function resolveImportScreeningReuseContext(
  input: string | undefined | { parsed?: ParsedResumeInput; groupId?: string | null; templateId?: string },
): Promise<ImportScreeningReuseContext> {
  if (typeof input === "string" || typeof input === "undefined") {
    return resolveImportScreeningReuseContextFromInput({ templateId: input });
  }

  return resolveImportScreeningReuseContextFromInput(input);

}

export async function resolveImportScreeningReuseContextFromInput(input: {
  parsed?: ParsedResumeInput;
  groupId?: string | null;
  templateId?: string;
}): Promise<ImportScreeningReuseContext> {
  const endpoint = await resolveImportAiEndpoint();
  const templateContext = input.groupId?.trim()
    ? await resolveGroupedScreeningTemplateContext({
        endpoint,
        parsed: input.parsed,
        groupId: input.groupId,
        templateId: input.templateId,
      })
    : await resolveScreeningTemplateContext(input.templateId);
  const promptSnapshot = buildImportScreeningSystemPrompt(templateContext);

  return {
    matchedTemplateId: templateContext?.matchedTemplateId ?? null,
    normalizedBaseURL: normalizeOpenAIBaseURL(endpoint.baseURL),
    promptSnapshot,
    shortlistedTemplateIds: templateContext?.shortlistedTemplateIds ?? [],
    screeningModel: endpoint.model,
    screeningProviderId: endpoint.providerId ?? null,
    selectionSource: templateContext?.selectionSource ?? "none",
    templateInfo: templateContext
      ? {
          ...templateContext.templateInfo,
          renderedPromptSnapshot: promptSnapshot,
        }
      : undefined,
  };
}

async function resolveGroupedScreeningTemplateContext(input: {
  endpoint: { baseURL: string; apiKey: string; model: string; providerId?: string | null };
  parsed?: ParsedResumeInput;
  groupId: string;
  templateId?: string;
  templateService?: Pick<ScreeningTemplatesService, "getGroup">;
}): Promise<ScreeningTemplatePromptContext | null> {
  const templateService = input.templateService ?? screeningTemplatesService;
  const group = await templateService.getGroup(input.groupId.trim());
  if (!group) {
    throw new Error(`Screening template group not found: ${input.groupId}`);
  }

  const explicitTemplateId = input.templateId?.trim();
  if (explicitTemplateId) {
    const explicitTemplate = group.templates.find((template) => template.id === explicitTemplateId) ?? null;
    if (!explicitTemplate) {
      throw new Error(`Selected screening template ${explicitTemplateId} does not belong to group ${group.group.id}`);
    }
    return buildTemplatePromptContext(explicitTemplate, "group_explicit", [explicitTemplate.id]);
  }

  const shortlist = input.parsed
    ? shortlistScreeningTemplatesByResume(group.templates, input.parsed)
    : [];

  if (shortlist.length === 0) {
    if (!group.defaultTemplate) {
      throw new Error(`No matched screening templates for group ${group.group.id} and no default template configured`);
    }
    return buildTemplatePromptContext(group.defaultTemplate, "group_default", []);
  }

  if (shortlist.length === 1) {
    return buildTemplatePromptContext(shortlist[0].template, "group_shortlist", shortlist.map((item) => item.template.id));
  }

  if (!input.endpoint.apiKey.trim()) {
    throw new Error("AI screening is not configured");
  }

  const selectedTemplate = await chooseTemplateFromShortlistWithAI({
    endpoint: input.endpoint,
    parsed: input.parsed,
    shortlist,
  });

  return buildTemplatePromptContext(selectedTemplate, "group_ai", shortlist.map((item) => item.template.id));
}

function buildTemplatePromptContext(
  template: MatchingTemplate,
  selectionSource: ScreeningTemplatePromptContext["selectionSource"],
  shortlistedTemplateIds: string[],
): ScreeningTemplatePromptContext {
  return {
    templateInfo: {
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.version,
      promptSnapshot: template.prompt,
    },
    matchedTemplateId: template.id,
    selectionSource,
    shortlistedTemplateIds,
  };
}

function buildPromptContextFromReuseContext(
  input: ImportScreeningReuseContext,
): ScreeningTemplatePromptContext | null {
  if (!input.templateInfo) {
    return null;
  }

  return {
    templateInfo: input.templateInfo,
    matchedTemplateId: input.matchedTemplateId ?? input.templateInfo.templateId,
    selectionSource: input.selectionSource === "none" ? "direct_template" : input.selectionSource,
    shortlistedTemplateIds: input.shortlistedTemplateIds,
  };
}

async function chooseTemplateFromShortlistWithAI(input: {
  endpoint: { baseURL: string; apiKey: string; model: string; providerId?: string | null };
  parsed?: ParsedResumeInput;
  shortlist: ScreeningTemplateShortlistItem[];
}): Promise<MatchingTemplate> {
  const content = await requestImportAiText({
    endpoint: input.endpoint,
    systemPrompt: TEMPLATE_SELECTION_SYSTEM_LINES.join("\n"),
    prompt: JSON.stringify({
      candidate: {
        name: input.parsed?.name,
        position: input.parsed?.position,
        yearsOfExperience: input.parsed?.yearsOfExperience,
        skills: input.parsed?.skills ?? [],
        education: input.parsed?.education ?? [],
        workHistory: input.parsed?.workHistory ?? [],
        rawTextPreview: input.parsed?.rawText?.slice(0, 3000) ?? "",
      },
      shortlist: input.shortlist.map((item) => ({
        templateId: item.template.id,
        templateName: item.template.name,
        description: item.template.description,
        matchedHints: item.matchedHints,
        matchedKeywords: item.matchedKeywords,
        matchedTerms: item.matchedTerms,
      })),
    }),
  });

  const parsed = JSON.parse(stripAssistantFormatting(content)) as { templateId?: unknown };
  const selectedTemplateId = typeof parsed.templateId === "string" ? parsed.templateId.trim() : "";
  const matched = input.shortlist.find((item) => item.template.id === selectedTemplateId)?.template;
  if (!matched) {
    throw new Error(`AI template chooser returned invalid templateId: ${selectedTemplateId || "<empty>"}`);
  }
  return matched;
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
  const candidateEducation = Array.isArray(raw.candidateEducation)
    ? raw.candidateEducation
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .slice(0, 5)
    : input.parsed.education;
  const normalizedCandidateSchools = Array.isArray(raw.candidateSchools)
    ? raw.candidateSchools
      .filter((item) => typeof item === "string" && /[\u4e00-\u9fa5a-zA-Z]/.test(item))
      .map((item) => item.replace(/\s+/g, " ").trim())
      .slice(0, 5)
    : [];
  const candidateSchools = normalizedCandidateSchools.length > 0
    ? normalizedCandidateSchools
    : extractSchoolNamesFromEducation(candidateEducation.length > 0 ? candidateEducation : input.parsed.education);
  const templateInfo = raw.templateInfo && typeof raw.renderedPromptSnapshot === "string" && raw.renderedPromptSnapshot.trim()
    ? {
      ...raw.templateInfo,
      renderedPromptSnapshot: raw.renderedPromptSnapshot,
    } satisfies ScreeningTemplateInfo & ScreeningTemplateRenderedInfo
    : undefined;
  const templateEvidence = normalizeTemplateEvidence(raw.templateEvidence);

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
    candidateEducation,
    candidateSchools,
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
    matchedTemplateId: raw.templateInfo?.templateId ?? null,
    templateEvidence,
    templateInfo,
  };
}

function normalizeTemplateEvidence(
  raw: unknown,
): TemplateEvidence | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const obj = raw as Record<string, unknown>;

  const matched = normalizeMatchedItems(obj.matched);
  const unmatched = normalizeUnmatchedItems(obj.unmatched);

  if (matched.length === 0 && unmatched.length === 0) {
    return undefined;
  }

  return { matched, unmatched };
}

function normalizeMatchedItems(raw: unknown): TemplateEvidenceMatchedItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: TemplateEvidenceMatchedItem[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const item = typeof e.item === "string" ? e.item.trim() : "";
    const evidence = typeof e.evidence === "string" ? e.evidence.trim() : "";
    if (!item || !evidence) {
      continue;
    }
    result.push({ item, evidence });
    if (result.length >= 6) {
      break;
    }
  }

  return result;
}

function normalizeUnmatchedItems(raw: unknown): TemplateEvidenceUnmatchedItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: TemplateEvidenceUnmatchedItem[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const item = typeof e.item === "string" ? e.item.trim() : "";
    const reason = typeof e.reason === "string" ? e.reason.trim() : "";
    if (!item || !reason) {
      continue;
    }
    result.push({ item, reason });
    if (result.length >= 6) {
      break;
    }
  }

  return result;
}

function extractSchoolNamesFromEducation(educationItems: string[]): string[] {
  const seen = new Set<string>();
  const schools: string[] = [];

  for (const item of educationItems) {
    const schoolName = extractSchoolNameFromEducation(item);
    if (!schoolName || seen.has(schoolName)) continue;
    seen.add(schoolName);
    schools.push(schoolName);
    if (schools.length >= 5) break;
  }

  return schools;
}

function extractSchoolNameFromEducation(education: string): string | null {
  const parenthesizedSchool = education.match(/([\u4e00-\u9fa5]{2,30}(?:大学|学院|学校)[（(][^）)]+[）)])/);
  if (parenthesizedSchool?.[1]?.trim()) {
    return parenthesizedSchool[1].trim();
  }

  const normalized = education
    .replace(/\([^)]*\)/g, " ")
    .replace(/[（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, "");
  const chineseMatches = Array.from(compact.matchAll(/[\u4e00-\u9fa5]{2,30}(?:大学|学院|学校)/g));
  for (const match of chineseMatches) {
    const candidate = match[0]
      .replace(/^(?:教育背景|教育经历|毕业院校|毕业学校|学校名称|学历|院校|毕业于|就读于|我的|本人|是|于|在)+/, "")
      .trim();
    if (candidate.length >= 4) return candidate;
  }

  const englishMatch = normalized.match(/([A-Za-z][A-Za-z·.&\- ]{2,60}(?:University|College|Institute))/i);
  if (englishMatch?.[1]?.trim()) {
    return englishMatch[1].trim();
  }

  return normalized
    .split(/\s+/)
    .find((part) => /大学|学院|学校|University|College|Institute/i.test(part))
    ?.trim() ?? null;
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

function extractPreferredCustomEndpoint(settingsJson: string | null | undefined) {
  if (!settingsJson?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(settingsJson) as {
      lui?: {
        defaultEndpointId?: string | null;
        customEndpoints?: Array<{
          id?: string;
          baseURL?: string;
          apiKey?: string;
          provider?: string;
          providerId?: string;
          modelId?: string;
        }>;
      };
    };
    const endpoints = parsed.lui?.customEndpoints;
    if (!Array.isArray(endpoints)) {
      return null;
    }

    const withApiKey = endpoints.filter(endpoint => typeof endpoint?.apiKey === "string" && endpoint.apiKey.trim());
    const defaultEndpoint = withApiKey.find(endpoint => endpoint.id && endpoint.id === parsed.lui?.defaultEndpointId);
    const selected = defaultEndpoint ?? withApiKey[0] ?? null;
    if (!selected) {
      return null;
    }

    const providerId = selected.providerId?.trim() || selected.provider?.trim() || null;
    const presetBaseURL = providerId
      ? (providerId === "minimax" ? MINIMAX_BASE_URL : PRESET_PROVIDER_BASE_URLS[providerId])
      : undefined;
    return {
      baseURL: presetBaseURL || selected.baseURL?.trim(),
      apiKey: selected.apiKey,
      providerId,
      modelId: selected.modelId?.trim() || undefined,
    };
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

export function normalizeOpenAIBaseURL(baseURL: string | null | undefined): string {
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

export function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
