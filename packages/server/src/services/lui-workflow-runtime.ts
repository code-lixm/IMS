import type { ToolContext } from "./lui-tools";
import { buildStructuredInterviewAssessmentInstruction } from "./document-templates";

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
  candidatePosition: string | null;
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
  "整个面试 workflow 不是一次性线性流程；S1（出题）与 S2（评估）之间允许按轮次循环，直到用户确认完成整个候选人流程。",
  "优先输出结构化、专业、可执行的结果；信息不足时明确指出缺失项，不要暴露底层运行时实现。",
  "当你生成正式阶段文档时，只输出完整 Markdown 正文；不要把“当前阶段 / 推荐下一阶段 / 推荐动作”这类流程控制文字写进文档正文，界面会单独承载这些信息。",
  "只有在不是正式阶段文档、而是在做澄清或补充提示时，才可以用自然语言解释当前阶段和下一步。",
  "当系统需要用户确认轮次、推进阶段或完成流程时，请在正文末尾单独追加一个精确 marker，用来触发界面中的确认卡片，不要再手写一遍流程口令。",
  "marker 只能使用这三个之一：<!-- workflow-action:confirm-round -->、<!-- workflow-action:advance-stage -->、<!-- workflow-action:complete-workflow -->。",
  "除这三个 marker 外，不要输出任何其他 workflow-action 标记。",
].join("\n");

const INTERVIEW_SCENE_INSTRUCTION = [
  "当前会话运行于 LUI interview workflow 场景。",
  "workflow stage 状态由服务端 authoritative workflow service 管理；你只能消费当前阶段上下文，不能自行重定义阶段。",
  "如果当前阶段尚未具备前置产物，先指出缺失并回到正确阶段任务。",
  "外部 .opencode 文档里提到的 interview_ensureWorkspace、interview-records、meta.json 等概念，在 IMS 中由服务端 workflow service 与持久化层承担。",
  "除当前系统显式开放的 tools 外，不要假设这些外部 custom tools 可以直接调用；把它们视为流程契约、命名规范和输出约束。",
].join("\n");

const STAGE_INSTRUCTIONS: Record<WorkflowStage, string> = {
  S0: [
    "你处于 S0（初筛）阶段。",
    "任务：分析候选人简历与基础信息，生成结构化初筛结论，并给出明确建议（通过/待定/淘汰）。",
    "输出语义尽量对齐 interview-screening：先做红线风险核查，再做完整的六维度评分，最后才给筛选结论。",
    "六维度至少覆盖：教育与资质、经历匹配度、项目产出与业务价值、岗位核心能力、协作与领导、稳定性与合规风险。",
    "不要只给总分或只给一句结论；必须同时写出维度证据、待核验项和建议面试考察维度。",
    "未知信息按“待核验项”处理，不要直接按 0 分处理。",
    "优先关注候选人摘要、履历证据、岗位匹配度与风险点。",
    "如果初筛结论为通过，必须在正文结尾追加单独一行：<!-- workflow-action:advance-stage -->。",
    "如果结论为待定或淘汰，则不要追加任何推进 marker。",
  ].join("\n"),
  S1: [
    "你处于 S1（出题/提问设计）阶段。",
    "任务：基于 S0 结果确定面试轮次、对应面试角色与重点，生成结构化问题清单和评估点。",
    "若 workspace skills 中存在 interview-questioning 的模板或 reference 文件，必须优先按其结构、题型和约束生成题目。",
    "输出风格必须对齐 interview-questioning/question_templates.md：像可直接拿去面试的现场提纲，不要写成评估报告或流程总结。",
    "文档结构必须贴近以下顺序：标题、面试信息、候选人简历分析、面试题目。",
    "标题使用“姓名 - 职位 - X年”样式；如果职位或年限缺失，可写“未知职位”或“年限待确认”，不要改成其他标题风格。",
    "“面试信息”里只保留：面试轮次与角色、目标职级、预计时长、题目数量。",
    "“候选人简历分析”里只保留：基本信息、技术亮点、项目经验；不要扩展出评估结论型章节。",
    "“面试题目”中每道题都要包含：场景引入、主问题、L1-L3 追问层级、追问策略、参考答案要点、评分标准。",
    "第1轮默认对应技术专家面试，重点验证技术真实性、项目细节、方案取舍、复杂问题排查与性能稳定性意识。",
    "第2轮默认对应主管面试，重点验证协作推进、ownership、冲突处理、优先级判断，以及技术与业务的平衡能力。",
    "第3轮默认对应总监面试，重点验证全局判断、架构视野、业务对齐、资源取舍与组织影响力。",
    "第4轮默认对应 HR 面试，重点验证动机、稳定性、沟通成熟度、自我认知与文化匹配度，避免继续深挖技术细节。",
    "禁止输出这些额外章节或小节：评估汇总表、评分汇总表、面试官备注、面试官评语、综合评估、录用建议。",
    "最后一道题结束后就停止正文，不要再追加任何附录、补充说明或使用指南。",
    "禁止追加这些尾部说明：面试官使用说明、时间控制、追问深度、评分时机、重点关注、使用建议、执行提示。",
    "默认只生成 6 道主问题；除非用户明确要求更多或更少，否则不要输出超过 6 道题。",
    "整轮面试总时长必须控制在 45 分钟内；请为每道题标注建议时长，并确保总时长不超过 45 分钟。",
    "题目数量与时长必须匹配真实面试执行场景，避免生成 8-10 道无法在 45 分钟内完成的问题清单。",
    "如果 S0 产物缺失，应先提示无法进入出题阶段。",
    "进入 S1 时必须先确认面试轮次；若轮次未明确，应把推荐下一阶段标记为 ask_user。",
    "如果轮次未确认，请在正文结尾追加一行：<!-- workflow-action:confirm-round -->，并提示用户选择技术专家 / 主管 / 总监 / HR 对应轮次。",
    "如果轮次已确认且你建议进入下一阶段，请在正文结尾追加一行：<!-- workflow-action:advance-stage -->",
  ].join("\n"),
  S2: [
    "你处于 S2（评估）阶段。",
    "任务：基于面试记录、前序产物与评估标准，直接输出符合 interview-assessment 约束的评分报告正文。",
    "评分证据只允许来自候选人回答内容；面试官提问、提示、评价、引导语只能作为上下文，不得直接计入评分。",
    "只要拿到了 interview_notes，就必须先给出本轮评分结论，不要先追问或等待二次确认。",
    "面试轮次必须写清楚：正文至少在 `## 二、题目对照评分（第X轮）` 中体现轮次；若轮次缺失，按第 1 轮处理并显式标注。",
    "正文不要写一级标题，也不要写“当前阶段 / 推荐下一阶段 / 推荐动作”这些流程控制字段。",
    "正文结构严格对齐：`## 一、分析结论` → `## 二、题目对照评分（第X轮）` → `## 三、加分与扣分（平衡）` → `## 四、系统结论 vs 面试官反馈（差异分析）` → 非淘汰时才允许 `## 五、下一轮建议（第X+1轮）`。",
    "微信可复制块必须使用严格逐行模板：第一行“姓名 职位缩写 年限”，随后依次为“面试轮次：”“面试评价：”“推荐职级：”“面试总结：”，禁止写成标题+段落摘要体。",
    "面试总结必须只保留 3 个最重要的正向场景；每个场景固定三行：场景、表现、评价，禁止把多个信息挤在同一超长行。",
    "评级口径固定为 A+/A/B+/B/C；推荐职级仅允许 P5- 到 P8+，或“不推荐”。若输出 B，请使用完整文案 `B（非必要不推荐）`。",
    "若面试评价为 B 或 C，或结论含“淘汰/不合格”，则必须判为不推荐流：其中 B=非必要不推荐、C=淘汰；推荐职级固定为“不推荐”，禁止输出下一轮建议、禁止输出 next round focus、也不要使用 `advance-stage` marker。",
    "若证据不足、题目缺失或信息有分歧，可以保守降档并明确写出影响，但不要回避本轮结论。",
    buildStructuredInterviewAssessmentInstruction(),
    "只有在非淘汰且明确建议继续后续轮次时，才允许在正文结尾追加 `<!-- workflow-action:advance-stage -->`。",
    "若本轮已可结束或为淘汰流，请在正文结尾追加 `<!-- workflow-action:complete-workflow -->`。",
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
