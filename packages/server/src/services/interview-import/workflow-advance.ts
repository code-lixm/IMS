import type { InterviewImportWorkflowAdvanceResult } from "@ims/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { conversations } from "../../schema";
import {
  advanceStage,
  getOrCreateWorkflow,
  updateWorkflow,
  type WorkflowStage,
} from "../lui-workflow";
import type { InterviewImportPipelineRoundPersistenceResult } from "./pipeline";

const INTERVIEW_IMPORT_CONVERSATION_TITLE = "历史面试导入";

export interface InterviewImportWorkflowAdvanceAuditInput {
  batchId: string;
  importSource: string;
}

export interface InterviewImportWorkflowAdvanceInput extends InterviewImportWorkflowAdvanceAuditInput {
  candidateId: string;
  roundPersistence: InterviewImportPipelineRoundPersistenceResult | null;
}

export interface InterviewImportWorkflowAdvanceServiceResult extends InterviewImportWorkflowAdvanceResult {
  targetStage: WorkflowStage;
  reasonSummary: string;
  evidenceFields: string[];
  errorMessage?: string;
}

interface WorkflowAdvanceDecision {
  targetStage: WorkflowStage;
  reasonSummary: string;
  evidenceFields: string[];
  maxAdvancedRound: number | null;
}

export async function ensureInterviewImportConversation(candidateId: string): Promise<string> {
  const [existingConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.candidateId, candidateId),
        eq(conversations.title, INTERVIEW_IMPORT_CONVERSATION_TITLE),
      ),
    )
    .limit(1);

  if (existingConversation) {
    return existingConversation.id;
  }

  const conversationId = `conv_${crypto.randomUUID()}`;
  const now = new Date();
  await db.insert(conversations).values({
    id: conversationId,
    title: INTERVIEW_IMPORT_CONVERSATION_TITLE,
    candidateId,
    createdAt: now,
    updatedAt: now,
  });

  return conversationId;
}

export async function advanceInterviewImportWorkflow(
  input: InterviewImportWorkflowAdvanceInput,
): Promise<InterviewImportWorkflowAdvanceServiceResult> {
  try {
    const conversationId = await ensureInterviewImportConversation(input.candidateId);
    const workflow = await getOrCreateWorkflow(input.candidateId, conversationId);
    const decision = decideWorkflowAdvance(workflow.currentStage, input.roundPersistence);

    await updateWorkflow(workflow.id, {
      stageData: {
        ...workflow.stageData,
        interviewImportAudit: {
          batchId: input.batchId,
          importSource: input.importSource,
          reasonSummary: decision.reasonSummary,
          evidenceFields: decision.evidenceFields,
          maxAdvancedRound: decision.maxAdvancedRound,
          conversationId,
          updatedAt: new Date().toISOString(),
        },
      },
      conversationId,
    });

    let finalStage = workflow.currentStage;
    if (decision.targetStage !== workflow.currentStage) {
      finalStage = await moveWorkflowToTargetStage(workflow.id, workflow.currentStage, decision.targetStage);
    }

    return {
      fromStage: workflow.currentStage,
      toStage: finalStage,
      targetStage: decision.targetStage,
      maxAdvancedRound: decision.maxAdvancedRound,
      advanced: finalStage !== workflow.currentStage,
      reasonSummary: decision.reasonSummary,
      evidenceFields: decision.evidenceFields,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "未知错误");
    return {
      fromStage: "unknown",
      toStage: "unknown",
      targetStage: "S0",
      maxAdvancedRound: null,
      advanced: false,
      reasonSummary: "面试导入工作流推进失败，已保留已导入的面试数据。",
      evidenceFields: [],
      errorMessage: message,
    };
  }
}

function decideWorkflowAdvance(
  currentStage: WorkflowStage,
  roundPersistence: InterviewImportPipelineRoundPersistenceResult | null,
): WorkflowAdvanceDecision {
  const appendedRounds = roundPersistence?.summary.appendedRounds ?? [];
  const appendedCount = appendedRounds.length;
  const normalizedRounds = roundPersistence?.normalizedRounds ?? [];
  const maxAdvancedRound = appendedRounds.reduce<number | null>((max, round) => {
    if (typeof max !== "number") {
      return round.roundNumber;
    }
    return Math.max(max, round.roundNumber);
  }, null);

  if (currentStage === "S2") {
    return {
      targetStage: "S2",
      reasonSummary: "当前 workflow 已处于 S2，本次导入不再继续推进。",
      evidenceFields: ["currentStage:S2"],
      maxAdvancedRound,
    };
  }

  if (appendedCount === 0) {
    return {
      targetStage: currentStage,
      reasonSummary: "本次导入没有新增面试轮次，保持当前 workflow 阶段不变。",
      evidenceFields: ["appendedRounds:0"],
      maxAdvancedRound,
    };
  }

  const strongImportedEvaluation = normalizedRounds.some((round) => {
    return round.recommendation === "pass" && round.evaluationText.trim().length >= 12;
  });

  const appendedRoundNumbers = appendedRounds.map((round) => round.roundNumber).sort((left, right) => left - right);
  const evidenceFields = [
    `appendedRounds:${appendedCount}`,
    `appendedRoundNumbers:${appendedRoundNumbers.join(",") || "none"}`,
    `strongImportedEvaluation:${strongImportedEvaluation ? "yes" : "no"}`,
  ];

  if (appendedCount >= 2 || strongImportedEvaluation) {
    return {
      targetStage: "S2",
      reasonSummary: strongImportedEvaluation
        ? "本次导入新增轮次且包含较强评估信号，workflow 最高推进到 S2。"
        : "本次导入新增两轮及以上面试记录，workflow 最高推进到 S2。",
      evidenceFields,
      maxAdvancedRound,
    };
  }

  return {
    targetStage: currentStage === "S0" ? "S1" : currentStage,
    reasonSummary: currentStage === "S0"
      ? "本次导入新增面试轮次，workflow 从 S0 推进到 S1。"
      : "本次导入仅补充单轮面试记录，保持当前 workflow 阶段。",
    evidenceFields,
    maxAdvancedRound,
  };
}

async function moveWorkflowToTargetStage(
  workflowId: string,
  currentStage: WorkflowStage,
  targetStage: WorkflowStage,
): Promise<WorkflowStage> {
  if (currentStage === targetStage) {
    return currentStage;
  }

  if (currentStage === "S0" && targetStage === "S2") {
    await advanceStage(workflowId, "S1");
    return advanceStage(workflowId, "S2");
  }

  return advanceStage(workflowId, targetStage);
}
