import type { ToolContext } from "./lui-tools";

export type WorkflowStage = "S0" | "S1" | "S2" | "completed";
export type WorkflowRuntimeEngine = "builtin" | "deepagents";

export type WorkflowHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export interface WorkflowPromptAssets {
  candidateSummary: string | null;
  jobDescription: string | null;
  evaluationCriteria: string | null;
  customContext: Record<string, string>;
}

export interface PreparedWorkflowExecutionRequest {
  conversationId: string;
  candidateId: string;
  candidateName: string;
  workflowId: string;
  workflowStage: WorkflowStage;
  workflowStageIndex: number;
  systemPrompt: string;
  promptAssets: WorkflowPromptAssets;
  historyMessages: WorkflowHistoryMessage[];
  modelProvider: string | null;
  runtimeModelName: string;
  endpointBaseURL: string;
  endpointApiKey: string;
  temperature: number;
  allowedToolNames?: string[];
  toolContext: ToolContext;
}

const DEFAULT_WORKFLOW_BASE_PROMPT = [
  "你是 Interview Manager 的面试工作流智能体。",
  "你负责围绕候选人的完整面试链路工作，并且必须尊重当前工作流阶段与已有文档产物。",
  "优先输出结构化、专业、可执行的结果；信息不足时明确指出缺失项，不要暴露底层运行时实现。",
].join("\n");

const INTERVIEW_SCENE_INSTRUCTION = [
  "当前会话运行于 LUI interview workflow 场景。",
  "workflow stage 状态由服务端 authoritative workflow service 管理；你只能消费当前阶段上下文，不能自行重定义阶段。",
  "如果当前阶段尚未具备前置产物，先指出缺失并回到正确阶段任务。",
].join("\n");

const STAGE_INSTRUCTIONS: Record<WorkflowStage, string> = {
  S0: [
    "你处于 S0（初筛）阶段。",
    "任务：分析候选人简历与基础信息，生成结构化初筛结论，并给出明确建议（通过/待定/淘汰）。",
    "优先关注候选人摘要、履历证据、岗位匹配度与风险点。",
  ].join("\n"),
  S1: [
    "你处于 S1（出题/提问设计）阶段。",
    "任务：基于 S0 结果确定面试轮次与重点，生成结构化问题清单和评估点。",
    "如果 S0 产物缺失，应先提示无法进入出题阶段。",
  ].join("\n"),
  S2: [
    "你处于 S2（评估）阶段。",
    "任务：基于面试记录、前序产物与评估标准，生成综合评估、强弱项和下一步建议。",
    "如果面试记录不足，应先提示需要补充记录或回到上一阶段。",
  ].join("\n"),
  completed: [
    "当前 workflow 已完成。",
    "你可以回答关于候选人和历史产物的问题，并支持后续跟进建议。",
  ].join("\n"),
};

function buildImportedAssetsSection(promptAssets: WorkflowPromptAssets): string {
  const sections: string[] = [];

  if (promptAssets.candidateSummary) {
    sections.push(`### Candidate Summary\n${promptAssets.candidateSummary}`);
  }
  if (promptAssets.jobDescription) {
    sections.push(`### Job Description\n${promptAssets.jobDescription}`);
  }
  if (promptAssets.evaluationCriteria) {
    sections.push(`### Evaluation Criteria\n${promptAssets.evaluationCriteria}`);
  }

  for (const [key, value] of Object.entries(promptAssets.customContext)) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    sections.push(`### ${key}\n${trimmed}`);
  }

  return sections.join("\n\n");
}

export function getWorkflowStageIndex(stage: WorkflowStage): number {
  const stageOrder: WorkflowStage[] = ["S0", "S1", "S2", "completed"];
  return Math.max(stageOrder.indexOf(stage), 0);
}

export function composeWorkflowSystemPrompt(input: {
  basePrompt?: string | null;
  workflowStage: WorkflowStage;
  workflowStageIndex: number;
  promptAssets: WorkflowPromptAssets;
  allowedToolNames?: string[];
  resumeSyncNote?: string | null;
  workflowDocumentNote?: string | null;
  stageInstructions?: string | null;
}): string {
  const toolConstraint = input.allowedToolNames
    ? input.allowedToolNames.length > 0
      ? `## Tool Constraints\nYou may only use these tools for this agent: ${input.allowedToolNames.join(", ")}. Do not invoke any other tools.`
      : "## Tool Constraints\nThis agent has no tools enabled. Answer without calling tools."
    : null;

  const workflowStateSegments = [
    `Current Stage: ${input.workflowStage}`,
    `Stage Index: ${input.workflowStageIndex}`,
    input.stageInstructions?.trim() || STAGE_INSTRUCTIONS[input.workflowStage],
    input.resumeSyncNote?.trim() || null,
    input.workflowDocumentNote?.trim() || null,
    toolConstraint,
  ].filter((segment): segment is string => Boolean(segment && segment.trim()));

  const importedAssetsSection = buildImportedAssetsSection(input.promptAssets);

  return [
    `## Global Base Prompt\n${(input.basePrompt?.trim() || DEFAULT_WORKFLOW_BASE_PROMPT)}`,
    `## Scene Instruction\n${INTERVIEW_SCENE_INSTRUCTION}`,
    workflowStateSegments.length > 0
      ? `## Workflow State\n${workflowStateSegments.join("\n\n")}`
      : null,
    importedAssetsSection ? `## Imported Assets\n${importedAssetsSection}` : null,
  ]
    .filter((segment): segment is string => Boolean(segment && segment.trim()))
    .join("\n\n");
}
