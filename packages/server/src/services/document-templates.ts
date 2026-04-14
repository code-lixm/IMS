import { formatInterviewRoundLabel } from "@ims/shared";

export type WorkflowDocumentStage = "S0" | "S1" | "S2";

interface MarkdownTemplateDefinition {
  title: string;
  description: string;
  sections: string[];
  requireTitle?: boolean;
}

const WORKFLOW_MARKDOWN_TEMPLATES: Record<WorkflowDocumentStage, MarkdownTemplateDefinition> = {
  S0: {
    title: "初筛报告",
    description: "请对齐 interview-screening：先红线核查，再给六维度评分明细、待核验项和面试建议考察维度，最后给筛选结论。",
    sections: ["分析结论", "红线风险核查", "维度评分明细", "加减分项", "待核验项", "面试建议考察维度"],
  },
  S1: {
    title: "候选人 - 岗位 - 年限",
    description: "请严格按 interview-questioning 结构输出，仅保留面试信息、候选人简历分析和面试题目；不要补充评估汇总表、面试官备注或任何尾部使用说明。",
    sections: ["面试信息", "候选人简历分析", "面试题目"],
  },
  S2: {
    title: "面试评分报告",
    description: "请严格对齐 interview-assessment：正文从二级标题开始（不要写一级标题），结构为分析结论、题目对照评分、加分与扣分、系统结论对比、下一轮建议（仅非淘汰时），并在文末直接追加严格逐行微信可复制块；B/C 或淘汰结论不得输出下一轮建议。",
    sections: [
      "一、分析结论",
      "二、题目对照评分（第X轮）",
      "三、加分与扣分（平衡）",
      "四、系统结论 vs 面试官反馈（差异分析）",
      "五、下一轮建议（第X轮）",
    ],
    requireTitle: false,
  },
};

function stripLeadingTitle(content: string) {
  return content.replace(/^#\s+.+?(\n|$)/, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSecondLevelHeadings(content: string) {
  return Array.from(content.matchAll(/^##\s+(.+)$/gm)).map((match) => match[1].trim());
}

function hasStrictTemplateStructure(content: string, template: MarkdownTemplateDefinition, title?: string) {
  const requiresTitle = template.requireTitle !== false;
  if (requiresTitle) {
    const expectedTitle = title?.trim() || template.title;
    const topTitleMatch = content.match(/^#\s+(.+)$/m);
    if (!topTitleMatch || topTitleMatch[1].trim() !== expectedTitle) {
      return false;
    }
  }

  const secondLevelHeadings = extractSecondLevelHeadings(content);
  if (secondLevelHeadings.length !== template.sections.length) {
    return false;
  }

  for (let index = 0; index < template.sections.length; index += 1) {
    if (secondLevelHeadings[index] !== template.sections[index]) {
      return false;
    }
  }

  const uniqueHeadings = new Set(secondLevelHeadings);
  if (uniqueHeadings.size !== secondLevelHeadings.length) {
    return false;
  }

  const extraSecondLevelHeadingPattern = new RegExp(
    `^##\\s+(?!${template.sections.map((section) => escapeRegExp(section)).join("|")}$).+$`,
    "gm",
  );
  if (extraSecondLevelHeadingPattern.test(content)) {
    return false;
  }

  return true;
}

function renderTemplateSkeleton(template: MarkdownTemplateDefinition, content: string, title?: string) {
  const body = stripLeadingTitle(content);
  const sections = template.sections.flatMap((section, index) => {
    const sectionBody = index === 0 ? (body || "- 待补充") : "- 待补充";
    return [`## ${section}`, "", sectionBody, ""];
  });

  const requiresTitle = template.requireTitle !== false;
  return [
    requiresTitle ? `# ${title?.trim() || template.title}` : null,
    requiresTitle ? "" : null,
    requiresTitle ? template.description : null,
    requiresTitle ? "" : null,
    ...sections,
  ].filter(Boolean).join("\n").trim();
}

export function getWorkflowMarkdownTemplate(stage: WorkflowDocumentStage): MarkdownTemplateDefinition {
  return WORKFLOW_MARKDOWN_TEMPLATES[stage];
}

export function buildWorkflowMarkdownTemplateInstruction(stage: WorkflowDocumentStage): string {
  const template = getWorkflowMarkdownTemplate(stage);
  if (stage === "S2") {
    return [
      "S2 文档不要写一级标题，正文从 `## 一、分析结论` 开始。",
      "二级标题顺序固定：## 一、分析结论 → ## 二、题目对照评分（角色面试＋第X轮） → ## 三、加分与扣分（平衡） → ## 四、系统结论 vs 面试官反馈（差异分析） →（非淘汰时）## 五、下一轮建议（角色面试＋第X轮）。",
      "文末必须追加微信可复制块（无标题、无空行），格式严格遵循 interview-assessment。",
      "若结论为 B/C、淘汰或不合格，必须移除“下一轮建议”并将推荐职级固定为“不推荐”。",
      template.description,
    ].join("\n");
  }
  return [
    `文档标题必须为：# ${template.title}`,
    `文档必须包含以下二级标题，且顺序保持一致：${template.sections.map((section) => `## ${section}`).join("、")}`,
    template.description,
    "如果信息不足，也要保留标题结构，并在对应段落明确写出缺失项。",
  ].join("\n");
}

export function applyWorkflowMarkdownTemplate(stage: WorkflowDocumentStage, content: string, title?: string): string {
  const template = getWorkflowMarkdownTemplate(stage);
  const trimmed = content.trim();
  if (!trimmed) {
    return renderTemplateSkeleton(template, "", title);
  }

  const requiresTitle = template.requireTitle !== false;
  const normalizedWithTitle = requiresTitle
    ? (/^#\s+.+/m.test(trimmed)
      ? trimmed
      : `# ${title?.trim() || template.title}\n\n${trimmed}`)
    : trimmed;

  if (hasStrictTemplateStructure(normalizedWithTitle, template, title)) {
    return normalizedWithTitle;
  }

  return renderTemplateSkeleton(template, trimmed, title);
}

const ASSESSMENT_SECTION_KEYS = ["analysis", "scoring", "balance", "feedback", "next"] as const;
type AssessmentSectionKey = typeof ASSESSMENT_SECTION_KEYS[number];

const WECHAT_COPY_REQUIRED_LINES = ["面试轮次：", "面试评价：", "推荐职级：", "面试总结："] as const;

function normalizeAssessmentHeading(title: string): AssessmentSectionKey | null {
  if (title.startsWith("一、分析结论")) {
    return "analysis";
  }
  if (title.startsWith("二、题目对照评分")) {
    return "scoring";
  }
  if (title.startsWith("三、加分与扣分")) {
    return "balance";
  }
  if (title.startsWith("四、系统结论")) {
    return "feedback";
  }
  if (title.startsWith("五、下一轮建议")) {
    return "next";
  }
  return null;
}

function buildAssessmentSectionTitle(key: AssessmentSectionKey, round: number | null, nextRound: number | null): string {
  switch (key) {
    case "analysis":
      return "一、分析结论";
    case "scoring":
      return `二、题目对照评分（${formatInterviewRoundLabel(round ?? 1)}）`;
    case "balance":
      return "三、加分与扣分（平衡）";
    case "feedback":
      return "四、系统结论 vs 面试官反馈（差异分析）";
    case "next":
      return `五、下一轮建议（${formatInterviewRoundLabel(nextRound ?? (round ?? 1) + 1)}）`;
    default:
      return "";
  }
}

function extractWechatCopyBlock(content: string): string | null {
  const match = content.match(/(^|\n)([^\n]+)\n面试轮次：[^\n]*\n面试评价：[^\n]*\n推荐职级：[^\n]*\n面试总结：[\s\S]*?(?=\n##\s|$)/);
  if (!match) {
    return null;
  }
  const block = match[0].trim();
  const lines = block.split(/\r?\n/).map((line) => line.trim());
  if (lines.length < 5) {
    return null;
  }
  const hasRequiredLines = WECHAT_COPY_REQUIRED_LINES.every((label) => lines.some((line) => line.startsWith(label)));
  if (!hasRequiredLines) {
    return null;
  }
  return block;
}

function extractAssessmentSections(content: string): Record<AssessmentSectionKey, string | null> {
  const sections: Record<AssessmentSectionKey, string | null> = {
    analysis: null,
    scoring: null,
    balance: null,
    feedback: null,
    next: null,
  };

  const normalized = content.replace(/^#\s+.+$/gm, "").trim();
  if (!normalized) {
    return sections;
  }

  const matches = Array.from(normalized.matchAll(/^##\s+(.+)$/gm));
  if (matches.length === 0) {
    return sections;
  }

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = match[1].trim();
    const key = normalizeAssessmentHeading(title);
    if (!key) {
      continue;
    }
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const body = normalized.slice(start, end).trim();
    sections[key] = body || "- 待补充";
  }

  return sections;
}

export function normalizeInterviewAssessmentMarkdown(input: {
  content: string;
  round: number | null;
  allowNextRound: boolean;
  nextRound: number | null;
}): string {
  const raw = input.content.trim();
  if (!raw) {
    return raw;
  }

  const wechatBlock = extractWechatCopyBlock(raw);
  const bodySource = wechatBlock ? raw.replace(wechatBlock, "").trim() : raw;
  const sections = extractAssessmentSections(bodySource);

  const orderedKeys: AssessmentSectionKey[] = ["analysis", "scoring", "balance", "feedback"];
  if (input.allowNextRound) {
    orderedKeys.push("next");
  }

  const outputSections = orderedKeys.flatMap((key) => {
    const title = buildAssessmentSectionTitle(key, input.round, input.nextRound);
    const body = sections[key] || "- 待补充";
    return [`## ${title}`, "", body, ""];
  });

  const output = [
    ...outputSections,
    wechatBlock ? wechatBlock.trim() : null,
  ].filter(Boolean).join("\n").trim();

  return output;
}

export function buildInterviewAssessmentMarkdown(input: {
  candidateId: string;
  interviewId: string;
  interviewerId: string;
  recommendationLabel: string;
  averageScore: string;
  technicalScore: number;
  communicationScore: number;
  cultureFitScore: number;
  overallScore: number;
  technicalEvaluation: string;
  communicationEvaluation: string;
  cultureFitEvaluation: string;
  overallEvaluation: string;
  round?: number;
  allowNextRound?: boolean;
  nextRound?: number | null;
}): string {
  const round = input.round ?? 1;
  const allowNextRound = input.allowNextRound ?? true;
  const nextRound = input.nextRound ?? (allowNextRound ? round + 1 : null);

  return normalizeInterviewAssessmentMarkdown({
    content: [
      "## 一、分析结论",
      "",
      `- 候选人 ID：${input.candidateId}`,
      `- 面试 ID：${input.interviewId}`,
      `- 评估人 ID：${input.interviewerId}`,
      `- 综合建议：${input.recommendationLabel}`,
      `- 平均分：${input.averageScore}`,
      "",
      `## 二、题目对照评分（${formatInterviewRoundLabel(round)}）`,
      "",
      `- 技术能力：${input.technicalScore}/10`,
      `- 沟通能力：${input.communicationScore}/10`,
      `- 文化匹配：${input.cultureFitScore}/10`,
      `- 综合评分：${input.overallScore}/10`,
      "",
      "## 三、加分与扣分（平衡）",
      "",
      `- 技术能力：${input.technicalEvaluation}`,
      `- 沟通能力：${input.communicationEvaluation}`,
      `- 文化匹配：${input.cultureFitEvaluation}`,
      "",
      "## 四、系统结论 vs 面试官反馈（差异分析）",
      "",
      input.overallEvaluation,
      "",
      allowNextRound
        ? `## 五、下一轮建议（${formatInterviewRoundLabel(nextRound ?? round + 1)}）\n\n- 待补充`
        : null,
    ].filter(Boolean).join("\n"),
    round,
    allowNextRound,
    nextRound,
  });
}

export type StructuredAssessmentGrade = "A+" | "A" | "B+" | "B" | "C";

export interface StructuredAssessmentWechatSummaryItem {
  scene: string;
  performance: string;
  evaluation: string;
}

export interface StructuredAssessmentQuestionScoreItem {
  topic: string;
  observation: string;
  score: string;
}

export interface StructuredAssessmentBalanceItem {
  dimension: string;
  strength: string;
  risk: string;
}

export interface StructuredAssessmentFeedbackItem {
  topic: string;
  systemJudgement: string;
  interviewerFeedback: string;
  conclusion: string;
}

export interface StructuredInterviewAssessmentData {
  candidateName: string;
  roleAbbr: string;
  years: string;
  round: number;
  grade: StructuredAssessmentGrade;
  eliminateReasons: string[];
  recommendedLevel: string;
  scoreSummary: string;
  evidenceCompleteness: string;
  overallJudgement: string;
  analysisConclusion: string;
  questionScores: StructuredAssessmentQuestionScoreItem[];
  balanceHighlights: StructuredAssessmentBalanceItem[];
  feedbackComparisons: StructuredAssessmentFeedbackItem[];
  wechatSummaryItems: StructuredAssessmentWechatSummaryItem[];
  nextRound: number | null;
  nextRoundSuggestions: string[];
  nextRoundFocus: string[];
  shouldContinue: boolean;
}

export interface StructuredInterviewAssessmentView extends StructuredInterviewAssessmentData {
  interviewEvaluationLabel: string;
  normalizedRecommendedLevel: string;
  wechatCopyText: string;
}

const STRUCTURED_ASSESSMENT_START_MARKER = "<!-- interview-assessment-json:start -->";
const STRUCTURED_ASSESSMENT_END_MARKER = "<!-- interview-assessment-json:end -->";
const STRUCTURED_ASSESSMENT_GRADE_LABELS: Record<StructuredAssessmentGrade, string> = {
  "A+": "A+（推荐复试，优先录用，重点培养）",
  "A": "A（推荐复试，可录用）",
  "B+": "B+（推荐复试，offer数量不够，可择优录用）",
  "B": "B（非必要不推荐）",
  "C": "C（面试淘汰）",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => toNonEmptyString(item))
    .filter((item): item is string => Boolean(item));
}

function toGrade(value: unknown): StructuredAssessmentGrade | null {
  const normalized = toNonEmptyString(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "A+" || normalized === "A" || normalized === "B+" || normalized === "B" || normalized === "C") {
    return normalized;
  }

  const base = normalized.split("（")[0]?.trim();
  if (base === "A+" || base === "A" || base === "B+" || base === "B" || base === "C") {
    return base;
  }

  return null;
}

function coerceWechatSummaryItems(value: unknown): StructuredAssessmentWechatSummaryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const scene = toNonEmptyString(item.scene);
      const performance = toNonEmptyString(item.performance);
      const evaluation = toNonEmptyString(item.evaluation);
      if (!scene || !performance || !evaluation) {
        return null;
      }

      return { scene, performance, evaluation };
    })
    .filter((item): item is StructuredAssessmentWechatSummaryItem => Boolean(item));
}

function coerceQuestionScores(value: unknown): StructuredAssessmentQuestionScoreItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const topic = toNonEmptyString(item.topic);
      const observation = toNonEmptyString(item.observation);
      const score = toNonEmptyString(item.score);
      if (!topic || !observation || !score) {
        return null;
      }

      return { topic, observation, score };
    })
    .filter((item): item is StructuredAssessmentQuestionScoreItem => Boolean(item));
}

function coerceBalanceHighlights(value: unknown): StructuredAssessmentBalanceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const dimension = toNonEmptyString(item.dimension);
      const strength = toNonEmptyString(item.strength);
      const risk = toNonEmptyString(item.risk);
      if (!dimension || !strength || !risk) {
        return null;
      }

      return { dimension, strength, risk };
    })
    .filter((item): item is StructuredAssessmentBalanceItem => Boolean(item));
}

function coerceFeedbackComparisons(value: unknown): StructuredAssessmentFeedbackItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const topic = toNonEmptyString(item.topic);
      const systemJudgement = toNonEmptyString(item.systemJudgement);
      const interviewerFeedback = toNonEmptyString(item.interviewerFeedback);
      const conclusion = toNonEmptyString(item.conclusion);
      if (!topic || !systemJudgement || !interviewerFeedback || !conclusion) {
        return null;
      }

      return { topic, systemJudgement, interviewerFeedback, conclusion };
    })
    .filter((item): item is StructuredAssessmentFeedbackItem => Boolean(item));
}

function normalizeRecommendedLevel(grade: StructuredAssessmentGrade, recommendedLevel: string): string {
  if (grade === "B" || grade === "C") {
    return "不推荐";
  }
  return recommendedLevel;
}

export function buildWechatCopyTextFromStructuredAssessment(input: StructuredInterviewAssessmentData): string {
  const interviewEvaluationLabel = STRUCTURED_ASSESSMENT_GRADE_LABELS[input.grade];
  const normalizedRecommendedLevel = normalizeRecommendedLevel(input.grade, input.recommendedLevel);
  const lines = [
    `${input.candidateName}｜${input.roleAbbr}｜${input.years}`,
    `面试轮次：${formatInterviewRoundLabel(input.round)}`,
    `面试评价：${interviewEvaluationLabel}`,
    `推荐职级：${normalizedRecommendedLevel}`,
    "面试总结：",
    ...input.wechatSummaryItems.slice(0, 3).flatMap((item) => ([
      `- 场景：${item.scene}`,
      `  表现：${item.performance}`,
      `  评价：${item.evaluation}`,
    ])),
  ];

  if ((input.grade === "A+" || input.grade === "A" || input.grade === "B+") && input.nextRoundFocus.length > 0) {
    lines.push("下一阶段面试侧重点：");
    lines.push(...input.nextRoundFocus.map((item) => `- ${item}`));
  }

  if ((input.grade === "B" || input.grade === "C") && input.eliminateReasons.length > 0) {
    lines.push(`淘汰原因：${input.eliminateReasons.join("、")}`);
  }

  return lines.join("\n");
}

export function toStructuredInterviewAssessmentView(input: StructuredInterviewAssessmentData): StructuredInterviewAssessmentView {
  const normalizedRecommendedLevel = normalizeRecommendedLevel(input.grade, input.recommendedLevel);
  return {
    ...input,
    recommendedLevel: normalizedRecommendedLevel,
    normalizedRecommendedLevel,
    interviewEvaluationLabel: STRUCTURED_ASSESSMENT_GRADE_LABELS[input.grade],
    wechatCopyText: buildWechatCopyTextFromStructuredAssessment({
      ...input,
      recommendedLevel: normalizedRecommendedLevel,
    }),
  };
}

export function buildInterviewAssessmentMarkdownFromStructuredData(input: StructuredInterviewAssessmentData): string {
  const view = toStructuredInterviewAssessmentView(input);
  const sections = [
    "## 一、分析结论",
    "",
    "| 项目 | 评估结果 |",
    "|---|---|",
    `| 本轮得分 | ${view.scoreSummary} |`,
    `| 评估结论 | ${view.analysisConclusion} |`,
    `| 推荐职级 | ${view.normalizedRecommendedLevel} |`,
    `| 证据完整度 | ${view.evidenceCompleteness} |`,
    `| 总体判断 | ${view.overallJudgement} |`,
    "",
    `## 二、题目对照评分（${formatInterviewRoundLabel(view.round)}）`,
    "",
    "| 题目方向 | 观察结论 | 得分 |",
    "|---|---|---|",
    ...(view.questionScores.length > 0
      ? view.questionScores.map((item) => `| ${item.topic} | ${item.observation} | ${item.score} |`)
      : ["| 待补充 | 待补充 | 待补充 |"]),
    "",
    "## 三、加分与扣分（平衡）",
    "",
    "| 维度 | 加分项 | 扣分项 |",
    "|---|---|---|",
    ...(view.balanceHighlights.length > 0
      ? view.balanceHighlights.map((item) => `| ${item.dimension} | ${item.strength} | ${item.risk} |`)
      : ["| 待补充 | 待补充 | 待补充 |"]),
    "",
    "## 四、系统结论 vs 面试官反馈（差异分析）",
    "",
    "| 项目 | 系统判断 | 面试官反馈 | 差异结论 |",
    "|---|---|---|---|",
    ...(view.feedbackComparisons.length > 0
      ? view.feedbackComparisons.map((item) => `| ${item.topic} | ${item.systemJudgement} | ${item.interviewerFeedback} | ${item.conclusion} |`)
      : ["| 待补充 | 待补充 | 待补充 | 待补充 |"]),
    "",
  ];

  if ((view.grade === "A+" || view.grade === "A" || view.grade === "B+") && view.shouldContinue && view.nextRoundSuggestions.length > 0) {
    sections.push(`## 五、下一轮建议（${formatInterviewRoundLabel(view.nextRound ?? (view.round + 1))})`);
    sections.push("");
    sections.push(...view.nextRoundSuggestions.map((item, index) => `${index + 1}. ${item}`));
    sections.push("");
  }

  sections.push(view.wechatCopyText);
  return sections.join("\n").trim();
}

export function parseStructuredInterviewAssessmentData(value: unknown): StructuredInterviewAssessmentData | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidateName = toNonEmptyString(value.candidateName);
  const roleAbbr = toNonEmptyString(value.roleAbbr);
  const years = toNonEmptyString(value.years);
  const grade = toGrade(value.grade);
  const recommendedLevel = toNonEmptyString(value.recommendedLevel);
  const eliminateReasons = toStringArray(value.eliminateReasons);
  const scoreSummary = toNonEmptyString(value.scoreSummary);
  const evidenceCompleteness = toNonEmptyString(value.evidenceCompleteness);
  const overallJudgement = toNonEmptyString(value.overallJudgement);
  const analysisConclusion = toNonEmptyString(value.analysisConclusion);
  const round = typeof value.round === "number" && Number.isInteger(value.round) && value.round >= 1 && value.round <= 4
    ? value.round
    : null;
  const nextRound = typeof value.nextRound === "number" && Number.isInteger(value.nextRound) && value.nextRound >= 2 && value.nextRound <= 4
    ? value.nextRound
    : null;
  const shouldContinue = Boolean(value.shouldContinue);
  const questionScores = coerceQuestionScores(value.questionScores);
  const balanceHighlights = coerceBalanceHighlights(value.balanceHighlights);
  const feedbackComparisons = coerceFeedbackComparisons(value.feedbackComparisons);
  const wechatSummaryItems = coerceWechatSummaryItems(value.wechatSummaryItems);
  const nextRoundSuggestions = toStringArray(value.nextRoundSuggestions);
  const nextRoundFocus = toStringArray(value.nextRoundFocus);

  const requiresEliminateReasons = grade === "B" || grade === "C";

  if (
    !candidateName
    || !roleAbbr
    || !years
    || !grade
    || !recommendedLevel
    || !scoreSummary
    || !evidenceCompleteness
    || !overallJudgement
    || !analysisConclusion
    || !round
    || questionScores.length === 0
    || balanceHighlights.length === 0
    || feedbackComparisons.length === 0
    || wechatSummaryItems.length !== 3
    || (requiresEliminateReasons && eliminateReasons.length === 0)
  ) {
    return null;
  }

  return {
    candidateName,
    roleAbbr,
    years,
    round,
    grade,
    eliminateReasons: grade === "B" || grade === "C" ? eliminateReasons : [],
    recommendedLevel,
    scoreSummary,
    evidenceCompleteness,
    overallJudgement,
    analysisConclusion,
    questionScores,
    balanceHighlights,
    feedbackComparisons,
    wechatSummaryItems,
    nextRound: shouldContinue ? (nextRound ?? Math.min(round + 1, 4)) : null,
    nextRoundSuggestions: shouldContinue ? nextRoundSuggestions : [],
    nextRoundFocus: shouldContinue ? nextRoundFocus : [],
    shouldContinue: shouldContinue && grade !== "B" && grade !== "C",
  };
}

export function extractStructuredInterviewAssessmentBlock(content: string): {
  structuredData: StructuredInterviewAssessmentView | null;
  cleanedContent: string;
} {
  const pattern = new RegExp(
    `${escapeRegExp(STRUCTURED_ASSESSMENT_START_MARKER)}\\s*([\\s\\S]*?)\\s*${escapeRegExp(STRUCTURED_ASSESSMENT_END_MARKER)}`,
    "m",
  );
  const match = content.match(pattern);
  if (!match) {
    return {
      structuredData: null,
      cleanedContent: content.trim(),
    };
  }

  const cleanedContent = content.replace(pattern, "").trim();

  try {
    const parsed = JSON.parse(match[1]);
    const normalized = parseStructuredInterviewAssessmentData(parsed);
    return {
      structuredData: normalized ? toStructuredInterviewAssessmentView(normalized) : null,
      cleanedContent,
    };
  } catch {
    return {
      structuredData: null,
      cleanedContent,
    };
  }
}

export function buildStructuredInterviewAssessmentInstruction(): string {
  return [
    "在正常正文末尾，必须追加一个隐藏 JSON 注释块，供系统提取；页面不会展示这个注释块。",
    `隐藏块格式固定为：${STRUCTURED_ASSESSMENT_START_MARKER} + JSON + ${STRUCTURED_ASSESSMENT_END_MARKER}`,
    "JSON 顶层字段固定为：candidateName, roleAbbr, years, round, grade, eliminateReasons, recommendedLevel, scoreSummary, evidenceCompleteness, overallJudgement, analysisConclusion, questionScores, balanceHighlights, feedbackComparisons, wechatSummaryItems, nextRound, nextRoundSuggestions, nextRoundFocus, shouldContinue。",
    "grade 只允许：A+ / A / B+ / B / C。",
    "wechatSummaryItems 必须正好输出 3 个最重要的正向场景，每项字段固定为 scene / performance / evaluation，且都必须是非空字符串。",
    "questionScores / balanceHighlights / feedbackComparisons 都必须输出完整数组，不得省略字段名。",
    "若 grade 为 B 或 C，则 shouldContinue=false，recommendedLevel 必须写“不推荐”，nextRound / nextRoundSuggestions / nextRoundFocus 置空，且 eliminateReasons 必须输出 1~多个非空字符串。",
    "可见正文与隐藏 JSON 的字段值必须一致。",
  ].join("\n");
}
