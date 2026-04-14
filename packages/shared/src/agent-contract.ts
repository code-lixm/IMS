export const AGENT_CONTRACT_VERSION = 1 as const;

export type AgentWorkflowStage = "S0" | "S1" | "S2" | "completed";

export type AgentIntent =
  | "screening"
  | "questioning"
  | "assessment"
  | "clarify_round"
  | "general_followup"
  | "offtopic";

export interface AgentContractStageRule {
  allowedIntents: AgentIntent[];
  requiredHints?: string[];
}

export interface AgentContractHardRules {
  requireRoundConfirmationInS1: boolean;
  requireInterviewNotesInS2: boolean;
  forbidScoringByInterviewerSpeech: boolean;
}

export interface AgentContractDocument {
  version: typeof AGENT_CONTRACT_VERSION;
  scope: "permissive" | "workflow";
  allowedIntents: AgentIntent[];
  stageRules: Partial<Record<AgentWorkflowStage, AgentContractStageRule>>;
  offtrackPolicy: "clarify" | "reject" | "rewrite";
  hardRules: AgentContractHardRules;
}

export interface AgentContractPatch {
  version?: typeof AGENT_CONTRACT_VERSION;
  scope?: AgentContractDocument["scope"];
  allowedIntents?: AgentIntent[];
  stageRules?: Partial<Record<AgentWorkflowStage, Partial<AgentContractStageRule>>>;
  offtrackPolicy?: AgentContractDocument["offtrackPolicy"];
  hardRules?: Partial<AgentContractHardRules>;
}

export interface AgentContractValidationIssue {
  path: string;
  message: string;
}

export interface AgentContractValidationResult<T> {
  ok: boolean;
  value: T | null;
  issues: AgentContractValidationIssue[];
}

const VALID_INTENTS: AgentIntent[] = [
  "screening",
  "questioning",
  "assessment",
  "clarify_round",
  "general_followup",
  "offtopic",
];

const VALID_STAGES: AgentWorkflowStage[] = ["S0", "S1", "S2", "completed"];
const DOCUMENT_KEYS = ["version", "scope", "allowedIntents", "stageRules", "offtrackPolicy", "hardRules"] as const;
const PATCH_KEYS = ["version", "scope", "allowedIntents", "stageRules", "offtrackPolicy", "hardRules"] as const;
const STAGE_RULE_KEYS = ["allowedIntents", "requiredHints"] as const;
const HARD_RULE_KEYS = [
  "requireRoundConfirmationInS1",
  "requireInterviewNotesInS2",
  "forbidScoringByInterviewerSpeech",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issues: AgentContractValidationIssue[], path: string, message: string) {
  issues.push({ path, message });
}

function validateUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: AgentContractValidationIssue[],
) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      pushIssue(issues, path === "$" ? key : `${path}.${key}`, "未知字段");
    }
  }
}

function validateIntentArray(value: unknown, path: string, issues: AgentContractValidationIssue[]): AgentIntent[] | null {
  if (!Array.isArray(value)) {
    pushIssue(issues, path, "必须是 intent 数组");
    return null;
  }

  const intents: AgentIntent[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || !VALID_INTENTS.includes(item as AgentIntent)) {
      pushIssue(issues, `${path}[${index}]`, `非法 intent：${String(item)}`);
      continue;
    }
    intents.push(item as AgentIntent);
  }

  return intents;
}

function validateHintArray(value: unknown, path: string, issues: AgentContractValidationIssue[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    pushIssue(issues, path, "必须是字符串数组");
    return undefined;
  }

  const hints: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || item.trim().length === 0) {
      pushIssue(issues, `${path}[${index}]`, "必须是非空字符串");
      continue;
    }
    hints.push(item);
  }
  return hints;
}

function validateStageRules(
  value: unknown,
  issues: AgentContractValidationIssue[],
  allowPartial: boolean,
): Partial<Record<AgentWorkflowStage, AgentContractStageRule>> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    pushIssue(issues, "stageRules", "必须是对象");
    return {};
  }

  const next: Partial<Record<AgentWorkflowStage, AgentContractStageRule>> = {};
  for (const [stage, rule] of Object.entries(value)) {
    if (!VALID_STAGES.includes(stage as AgentWorkflowStage)) {
      pushIssue(issues, `stageRules.${stage}`, "未知 stage");
      continue;
    }
    if (!isRecord(rule)) {
      pushIssue(issues, `stageRules.${stage}`, "必须是对象");
      continue;
    }
    validateUnknownKeys(rule, STAGE_RULE_KEYS, `stageRules.${stage}`, issues);

    const allowedIntents = rule.allowedIntents === undefined && allowPartial
      ? []
      : validateIntentArray(rule.allowedIntents, `stageRules.${stage}.allowedIntents`, issues);
    const requiredHints = validateHintArray(rule.requiredHints, `stageRules.${stage}.requiredHints`, issues);

    if (!allowedIntents) {
      continue;
    }

    next[stage as AgentWorkflowStage] = {
      allowedIntents,
      ...(requiredHints ? { requiredHints } : {}),
    };
  }

  return next;
}

function validateHardRules(
  value: unknown,
  issues: AgentContractValidationIssue[],
  allowPartial: boolean,
): Partial<AgentContractHardRules> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    pushIssue(issues, "hardRules", "必须是对象");
    return {};
  }

  const result: Partial<AgentContractHardRules> = {};
  validateUnknownKeys(value, HARD_RULE_KEYS, "hardRules", issues);
  const entries: Array<keyof AgentContractHardRules> = [...HARD_RULE_KEYS];
  for (const key of entries) {
    const raw = value[key];
    if (raw === undefined && allowPartial) {
      continue;
    }
    if (typeof raw !== "boolean") {
      pushIssue(issues, `hardRules.${key}`, "必须是 boolean");
      continue;
    }
    result[key] = raw;
  }

  return result;
}

export function validateAgentContractDocument(value: unknown): AgentContractValidationResult<AgentContractDocument> {
  const issues: AgentContractValidationIssue[] = [];
  if (!isRecord(value)) {
    pushIssue(issues, "$", "contract 必须是对象");
    return { ok: false, value: null, issues };
  }
  validateUnknownKeys(value, DOCUMENT_KEYS, "$", issues);

  if (value.version !== AGENT_CONTRACT_VERSION) {
    pushIssue(issues, "version", `当前仅支持 version=${AGENT_CONTRACT_VERSION}`);
  }
  if (value.scope !== "permissive" && value.scope !== "workflow") {
    pushIssue(issues, "scope", "必须是 permissive 或 workflow");
  }
  const allowedIntents = validateIntentArray(value.allowedIntents, "allowedIntents", issues);
  const stageRules = validateStageRules(value.stageRules, issues, false);
  const hardRules = validateHardRules(value.hardRules, issues, false);
  if (value.offtrackPolicy !== "clarify" && value.offtrackPolicy !== "reject" && value.offtrackPolicy !== "rewrite") {
    pushIssue(issues, "offtrackPolicy", "必须是 clarify / reject / rewrite");
  }

  if (issues.length > 0 || !allowedIntents) {
    return { ok: false, value: null, issues };
  }

  return {
    ok: true,
    value: {
      version: AGENT_CONTRACT_VERSION,
      scope: value.scope as AgentContractDocument["scope"],
      allowedIntents,
      stageRules,
      offtrackPolicy: value.offtrackPolicy as AgentContractDocument["offtrackPolicy"],
      hardRules: {
        requireRoundConfirmationInS1: hardRules.requireRoundConfirmationInS1 ?? false,
        requireInterviewNotesInS2: hardRules.requireInterviewNotesInS2 ?? false,
        forbidScoringByInterviewerSpeech: hardRules.forbidScoringByInterviewerSpeech ?? false,
      },
    },
    issues,
  };
}

export function validateAgentContractPatch(value: unknown): AgentContractValidationResult<AgentContractPatch> {
  const issues: AgentContractValidationIssue[] = [];
  if (!isRecord(value)) {
    pushIssue(issues, "$", "contract patch 必须是对象");
    return { ok: false, value: null, issues };
  }
  validateUnknownKeys(value, PATCH_KEYS, "$", issues);

  const next: AgentContractPatch = {};

  if (value.version !== undefined) {
    if (value.version !== AGENT_CONTRACT_VERSION) {
      pushIssue(issues, "version", `当前仅支持 version=${AGENT_CONTRACT_VERSION}`);
    } else {
      next.version = AGENT_CONTRACT_VERSION;
    }
  }
  if (value.scope !== undefined) {
    if (value.scope !== "permissive" && value.scope !== "workflow") {
      pushIssue(issues, "scope", "必须是 permissive 或 workflow");
    } else {
      next.scope = value.scope;
    }
  }
  if (value.allowedIntents !== undefined) {
    const intents = validateIntentArray(value.allowedIntents, "allowedIntents", issues);
    if (intents) {
      next.allowedIntents = intents;
    }
  }
  if (value.offtrackPolicy !== undefined) {
    if (value.offtrackPolicy !== "clarify" && value.offtrackPolicy !== "reject" && value.offtrackPolicy !== "rewrite") {
      pushIssue(issues, "offtrackPolicy", "必须是 clarify / reject / rewrite");
    } else {
      next.offtrackPolicy = value.offtrackPolicy;
    }
  }

  const stageRules = validateStageRules(value.stageRules, issues, true);
  if (Object.keys(stageRules).length > 0) {
    next.stageRules = stageRules;
  }

  const hardRules = validateHardRules(value.hardRules, issues, true);
  if (Object.keys(hardRules).length > 0) {
    next.hardRules = hardRules;
  }

  if (issues.length > 0) {
    return { ok: false, value: null, issues };
  }

  return { ok: true, value: next, issues };
}
