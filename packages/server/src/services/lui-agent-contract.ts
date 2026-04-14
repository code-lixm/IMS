import {
  AGENT_CONTRACT_VERSION,
  type AgentContractDocument,
  type AgentContractPatch,
  type AgentIntent,
  type AgentWorkflowStage,
  validateAgentContractDocument,
  validateAgentContractPatch,
} from "@ims/shared";

export type { AgentIntent, AgentWorkflowStage } from "@ims/shared";

export type AgentContract = AgentContractDocument;

export type AgentGuardDecision =
  | { kind: "allow"; detectedIntent: AgentIntent; normalizedContent: string }
  | { kind: "rewrite"; detectedIntent: AgentIntent; normalizedContent: string; reason: string }
  | { kind: "clarify"; detectedIntent: AgentIntent; reply: string }
  | { kind: "reject"; detectedIntent: AgentIntent; reply: string };

export interface AgentContractSource {
  id: string;
  name: string;
  sceneAffinity: "general" | "interview";
  mode: "all" | "chat" | "ask" | "workflow";
  contractJson?: string | null;
}

export interface AgentContractParseFailure {
  code: "INVALID_JSON" | "INVALID_CONTRACT_PATCH" | "INVALID_MERGED_CONTRACT";
  message: string;
  details: unknown;
}

const WORKFLOW_CLARIFY_BASE = "当前智能体会严格按照既定工作流推进。";

const PERMISSIVE_AGENT_CONTRACT: AgentContract = {
  version: AGENT_CONTRACT_VERSION,
  scope: "permissive",
  allowedIntents: [
    "screening",
    "questioning",
    "assessment",
    "clarify_round",
    "general_followup",
    "offtopic",
  ],
  stageRules: {},
  offtrackPolicy: "rewrite",
  hardRules: {
    requireRoundConfirmationInS1: false,
    requireInterviewNotesInS2: false,
    forbidScoringByInterviewerSpeech: false,
  },
};

export const INTERVIEW_WORKFLOW_CONTRACT: AgentContract = {
  version: AGENT_CONTRACT_VERSION,
  scope: "workflow",
  allowedIntents: [
    "screening",
    "questioning",
    "assessment",
    "clarify_round",
    "general_followup",
  ],
  stageRules: {
    S0: {
      allowedIntents: ["screening", "general_followup"],
      requiredHints: ["请围绕简历、岗位匹配度、风险点或筛选建议继续输入。"],
    },
    S1: {
      allowedIntents: ["questioning", "clarify_round", "general_followup"],
      requiredHints: ["请确认第几轮，或补充本轮关注点、上一轮反馈。"],
    },
    S2: {
      allowedIntents: ["assessment", "general_followup"],
      requiredHints: ["请提供面试纪要或候选人回答记录，格式不限。"],
    },
    completed: {
      allowedIntents: ["general_followup", "assessment"],
    },
  },
  offtrackPolicy: "clarify",
  hardRules: {
    requireRoundConfirmationInS1: true,
    requireInterviewNotesInS2: true,
    forbidScoringByInterviewerSpeech: true,
  },
};

function cloneContract(contract: AgentContract): AgentContract {
  return {
    version: contract.version,
    scope: contract.scope,
    allowedIntents: [...contract.allowedIntents],
    stageRules: Object.fromEntries(
      Object.entries(contract.stageRules).map(([stage, rule]) => [
        stage,
        rule
          ? {
              allowedIntents: [...rule.allowedIntents],
              requiredHints: rule.requiredHints ? [...rule.requiredHints] : undefined,
            }
          : undefined,
      ]),
    ) as AgentContract["stageRules"],
    offtrackPolicy: contract.offtrackPolicy,
    hardRules: { ...contract.hardRules },
  };
}

function mergeAgentContract(base: AgentContract, patch: AgentContractPatch | null): AgentContract {
  if (!patch) {
    return base;
  }

  const next = cloneContract(base);
  next.version = AGENT_CONTRACT_VERSION;

  if (patch.scope) {
    next.scope = patch.scope;
  }
  if (patch.allowedIntents && patch.allowedIntents.length > 0) {
    next.allowedIntents = [...patch.allowedIntents];
  }
  if (patch.offtrackPolicy) {
    next.offtrackPolicy = patch.offtrackPolicy;
  }
  if (patch.hardRules) {
    next.hardRules = {
      ...next.hardRules,
      ...patch.hardRules,
    };
  }
  if (patch.stageRules) {
    for (const stage of Object.keys(patch.stageRules) as AgentWorkflowStage[]) {
      const stagePatch = patch.stageRules[stage];
      if (!stagePatch) {
        continue;
      }
      next.stageRules[stage] = {
        allowedIntents: stagePatch.allowedIntents && stagePatch.allowedIntents.length > 0
          ? [...stagePatch.allowedIntents]
          : [...(next.stageRules[stage]?.allowedIntents ?? next.allowedIntents)],
        requiredHints: stagePatch.requiredHints
          ? [...stagePatch.requiredHints]
          : next.stageRules[stage]?.requiredHints,
      };
    }
  }

  return next;
}

export function stringifyAgentContract(contract: AgentContract): string {
  return JSON.stringify(contract, null, 2);
}

export function stringifyAgentContractPatch(patch: AgentContractPatch | null): string | null {
  if (!patch || Object.keys(patch).length === 0) {
    return null;
  }
  return JSON.stringify(patch, null, 2);
}

export function parseAndValidateAgentContractJson(contractJson: string | null | undefined): {
  patch: AgentContractPatch | null;
  failure: AgentContractParseFailure | null;
} {
  const trimmed = contractJson?.trim();
  if (!trimmed) {
    return { patch: null, failure: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      patch: null,
      failure: {
        code: "INVALID_JSON",
        message: "contractJson 不是合法 JSON",
        details: [{ path: "$", message: "JSON 解析失败" }],
      },
    };
  }

  const validation = validateAgentContractPatch(parsed);
  if (!validation.ok) {
    return {
      patch: null,
      failure: {
        code: "INVALID_CONTRACT_PATCH",
        message: "contractJson 结构不合法",
        details: validation.issues,
      },
    };
  }

  return { patch: validation.value, failure: null };
}

export function validateResolvedAgentContract(contract: AgentContract): AgentContractParseFailure | null {
  const validation = validateAgentContractDocument(contract);
  if (validation.ok) {
    return null;
  }
  return {
    code: "INVALID_MERGED_CONTRACT",
    message: "合并后的 agent contract 不合法",
    details: validation.issues,
  };
}

export function resolveAgentContractResult(agent: AgentContractSource | null | undefined): {
  contract: AgentContract;
  failure: AgentContractParseFailure | null;
} {
  if (!agent) {
    return { contract: PERMISSIVE_AGENT_CONTRACT, failure: null };
  }

  const { patch, failure } = parseAndValidateAgentContractJson(agent.contractJson);
  const base = agent.sceneAffinity === "interview" && agent.mode === "workflow"
    ? INTERVIEW_WORKFLOW_CONTRACT
    : PERMISSIVE_AGENT_CONTRACT;

  if (failure) {
    return { contract: base, failure };
  }

  const merged = mergeAgentContract(base, patch);
  const mergedFailure = validateResolvedAgentContract(merged);
  if (mergedFailure) {
    return { contract: base, failure: mergedFailure };
  }

  return { contract: merged, failure: null };
}

export function resolveAgentContract(agent: AgentContractSource | null | undefined): AgentContract {
  return resolveAgentContractResult(agent).contract;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeStructuredAssessmentInput(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  const hasRoundInfo = /面试轮次|第\s*[1-4]\s*轮|round\s*[1-4]/i.test(normalized);
  const hasScoreSignals = /优秀|一般|不通过|通过|待定|推荐|不推荐|录用建议|综合评价|评价|评分|score/i.test(normalized);
  const hasStructuredItems = /(?:^|\s)\d+[.、]\s*\S+|备注\s*[:：]|候选人\s*[:：]/.test(normalized);

  return (hasRoundInfo && hasScoreSignals) || (hasStructuredItems && hasScoreSignals);
}

function looksLikeQuestionGenerationRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return /(?:请|直接|继续|重新|再|帮我|马上|现在)(?:\S|\s){0,12}(?:出题|面试题|问题清单|题目|提问)|(?:生成|出)(?:\S|\s){0,8}(?:第\s*[1-4]\s*轮)?(?:\S|\s){0,8}(?:面试题|题目|问题清单)|(?:出题|面试题|问题清单|题目|提问)(?:\S|\s){0,8}(?:吧|一下|一轮|继续|重新|生成)/i.test(normalized);
}

function detectIntent(rawContent: string): AgentIntent {
  const text = rawContent.trim();
  const normalized = text.toLowerCase();

  if (!text) {
    return "general_followup";
  }
  if (looksLikeStructuredAssessmentInput(text)) {
    return "assessment";
  }
  if (/第\s*[1-4]\s*轮|round\s*[1-4]/i.test(text)) {
    return "clarify_round";
  }
  if (/简历|筛选|初筛|匹配度|resume|jd|岗位/.test(text)) {
    return "screening";
  }
  if (
    /面试纪要|回答记录|候选人回答|反馈差异|面试反馈|综合评价|录用建议|候选人表现|答题表现|回答情况/.test(text)
  ) {
    return "assessment";
  }
  if (looksLikeQuestionGenerationRequest(text) || /\bquestion\b/i.test(text)) {
    return "questioning";
  }
  if (/评估|评分|结论|纪要|面试记录|反馈|assessment|notes|feedback/.test(text)) {
    return "assessment";
  }
  if (/天气|股价|股票|八卦|翻译诗|写小说|闲聊|讲笑话/.test(text) || normalized.includes("weather")) {
    return "offtopic";
  }
  return "general_followup";
}

function buildStageClarifyReply(stage: AgentWorkflowStage, hints: string[] | undefined): string {
  const stageLabel = stage === "completed" ? "已完成阶段" : `当前处于 ${stage} 阶段`;
  const hintText = hints && hints.length > 0 ? ` ${hints.join(" ")}` : "";
  return `${WORKFLOW_CLARIFY_BASE}${stageLabel}，请继续提供与当前阶段相关的信息。${hintText}`.trim();
}

function buildRoundClarifyReply(): string {
  return [
    `${WORKFLOW_CLARIFY_BASE}当前在出题阶段，需要先确认轮次。`,
    "请直接点击下方按钮，选择要生成的技术专家 / 主管 / 总监 / HR 面试。",
  ].join(" ");
}

function buildAssessmentClarifyReply(): string {
  return [
    `${WORKFLOW_CLARIFY_BASE}当前在评估阶段。`,
    "请直接提供面试纪要或候选人回答记录，格式不限；你记下的要点或零散记录也可以。",
  ].join(" ");
}

function looksLikeStageDecisionWithoutNotes(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  const decisionSignals = /继续|下一轮|进入下一轮|完成|结束|收尾|完结|直接完成|推进/;
  const noteSignals = /纪要|记录|回答|题目|面试|候选人|问|答|notes|interview|feedback|评分|评价/;
  const hasNoteLike = noteSignals.test(normalized);

  if (hasNoteLike) {
    return false;
  }

  return decisionSignals.test(normalized) && normalized.length <= 30;
}

export function buildAgentContractPromptSegment(contract: AgentContract, stage: AgentWorkflowStage | null): string | null {
  if (contract.scope !== "workflow" || !stage) {
    return null;
  }

  const stageRule = contract.stageRules[stage];
  const allowedIntents = stageRule?.allowedIntents ?? contract.allowedIntents;
  const lines = [
    "## Agent Contract",
    `Contract version: ${contract.version}.`,
    `Current stage accepts intents: ${allowedIntents.join(", ")}.`,
    "If the user request drifts away from the allowed intents, do not silently comply.",
    "You must either ask for clarification or redirect the user back to the current stage objective.",
  ];

  if (stage === "S1" && contract.hardRules.requireRoundConfirmationInS1) {
    lines.push("In S1, round confirmation is mandatory before generating interview questions.");
  }
  if (stage === "S2" && contract.hardRules.requireInterviewNotesInS2) {
    lines.push("In S2, interview notes or candidate answer records are required before producing an assessment.");
  }
  if (contract.hardRules.forbidScoringByInterviewerSpeech) {
    lines.push("Do not score the candidate based on interviewer prompts or comments; only candidate evidence counts.");
  }

  return lines.join("\n");
}

export function buildInterceptedUserMessage(input: {
  stage: AgentWorkflowStage;
  detectedIntent: AgentIntent;
  decision: "clarify" | "reject";
}): string {
  const decisionLabel = input.decision === "reject" ? "rejected" : "clarified";
  return `[agent-contract:${decisionLabel}] stage=${input.stage}; intent=${input.detectedIntent}`;
}

export function guardAgentUserMessage(input: {
  rawContent: string;
  workflowStage: AgentWorkflowStage;
  contract: AgentContract;
}): AgentGuardDecision {
  const normalizedContent = normalizeText(input.rawContent);
  const detectedIntent = detectIntent(normalizedContent);

  if (input.contract.scope !== "workflow") {
    return { kind: "allow", detectedIntent, normalizedContent };
  }

  const stageRule = input.contract.stageRules[input.workflowStage];
  const allowedIntents = stageRule?.allowedIntents ?? input.contract.allowedIntents;

  if (!allowedIntents.includes(detectedIntent)) {
    const reply = buildStageClarifyReply(input.workflowStage, stageRule?.requiredHints);
    return input.contract.offtrackPolicy === "reject"
      ? { kind: "reject", detectedIntent, reply }
      : { kind: "clarify", detectedIntent, reply };
  }

  if (
    input.workflowStage === "S1"
    && input.contract.hardRules.requireRoundConfirmationInS1
    && detectedIntent === "questioning"
    && !/第\s*[1-4]\s*轮|round\s*[1-4]/i.test(normalizedContent)
  ) {
    return {
      kind: "clarify",
      detectedIntent: "clarify_round",
      reply: buildRoundClarifyReply(),
    };
  }

  if (
    input.workflowStage === "S2"
    && input.contract.hardRules.requireInterviewNotesInS2
    && detectedIntent === "assessment"
    && (normalizedContent.length === 0 || looksLikeStageDecisionWithoutNotes(normalizedContent))
  ) {
    return {
      kind: "clarify",
      detectedIntent,
      reply: buildAssessmentClarifyReply(),
    };
  }

  return { kind: "allow", detectedIntent, normalizedContent };
}
