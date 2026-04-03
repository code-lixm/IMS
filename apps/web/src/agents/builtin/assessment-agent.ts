import { tool } from "ai";
import { z } from "zod";
import { interviewAssessmentApi } from "@/api/interview-assessment";
import {
  agentHost,
  type AgentExecutionOptions,
  type AgentManifest,
  type IMSContext,
} from "../host";
import { getIMSContext } from "../context-bridge";

const recommendationSchema = z.enum(["pass", "hold", "reject"]);

export const assessmentAgentManifest: AgentManifest = {
  id: "assessment-agent",
  name: "面试评估员",
  description: "录入面试评价并生成结构化面试报告",
  capabilities: ["assessment-recording", "report-generation"],
  model: "gpt-4o",
  category: "builtin",
  permissions: ["candidate:read", "interview:read", "interview:write"],
  handoffTargets: ["interview-coordinator"],
  ui: {
    icon: "clipboard-check",
    color: "#8b5cf6",
  },
};

const assessmentInputSchema = z.object({
  candidateId: z.string().optional().describe("候选人 ID，不传则使用当前候选人"),
  interviewId: z.string().optional().describe("面试 ID，不传则使用当前面试上下文"),
  interviewerId: z.string().optional().describe("评估人 ID，不传则使用当前用户"),
  technicalScore: z.number().int().min(1).max(10).describe("技术能力评分"),
  communicationScore: z.number().int().min(1).max(10).describe("沟通能力评分"),
  cultureFitScore: z.number().int().min(1).max(10).describe("文化匹配评分"),
  overallScore: z.number().int().min(1).max(10).describe("综合评分"),
  technicalEvaluation: z.string().min(1).describe("技术评价"),
  communicationEvaluation: z.string().min(1).describe("沟通评价"),
  cultureFitEvaluation: z.string().min(1).describe("文化匹配评价"),
  overallEvaluation: z.string().min(1).describe("综合评价"),
  recommendation: recommendationSchema.describe("综合建议"),
});

const createAssessmentTool = tool({
  description: "创建面试评估并保存到系统",
  inputSchema: assessmentInputSchema,
  execute: async (input, options: unknown) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const candidateId = input.candidateId ?? ctx.currentCandidate?.id;
      const interviewId = input.interviewId ?? ctx.interviewContext?.currentInterviewId;

      if (!candidateId) {
        return { success: false, error: "缺少 candidateId，无法创建面试评估" };
      }

      if (!interviewId) {
        return { success: false, error: "缺少 interviewId，无法创建面试评估" };
      }

      const assessment = await interviewAssessmentApi.create(candidateId, {
        interviewId,
        interviewerId: input.interviewerId ?? ctx.currentUser.id,
        technicalScore: input.technicalScore,
        communicationScore: input.communicationScore,
        cultureFitScore: input.cultureFitScore,
        overallScore: input.overallScore,
        technicalEvaluation: input.technicalEvaluation,
        communicationEvaluation: input.communicationEvaluation,
        cultureFitEvaluation: input.cultureFitEvaluation,
        overallEvaluation: input.overallEvaluation,
        recommendation: input.recommendation,
      });

      return {
        success: true,
        message: "面试评估已创建",
        data: assessment,
      };
    } catch (error) {
      return createToolError("创建面试评估失败", error);
    }
  },
});

const generateReportTool = tool({
  description: "为指定面试评估生成结构化报告",
  inputSchema: z.object({
    candidateId: z.string().optional().describe("候选人 ID，不传则使用当前候选人"),
    assessmentId: z.string().describe("面试评估 ID"),
  }),
  execute: async ({ candidateId, assessmentId }, options: unknown) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: "缺少 candidateId，无法生成面试报告" };
      }

      const report = await interviewAssessmentApi.generateReport(resolvedCandidateId, assessmentId);
      return {
        success: true,
        message: "面试报告已生成",
        data: report,
      };
    } catch (error) {
      return createToolError("生成面试报告失败", error);
    }
  },
});

const syncAssessmentToCoordinatorTool = tool({
  description: "将最终评估摘要同步给面试协调员，便于统一归档和后续流程推进",
  inputSchema: z.object({
    candidateId: z.string().optional().describe("候选人 ID，不传则使用当前候选人"),
    summary: z.string().min(1).describe("评估摘要"),
    recommendation: recommendationSchema.describe("综合建议"),
  }),
  execute: async ({ candidateId, summary, recommendation }, options: unknown) => {
    try {
      const runtime = getAgentRuntime(options);
      const ctx = getIMSContext(runtime);
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: "缺少 candidateId，无法同步评估摘要" };
      }

      const handoffChunk = await runtime.host.handoff(runtime.agentId, "interview-coordinator", ctx, {
        reason: "同步面试评估结论",
        message: summary,
        metadata: { candidateId: resolvedCandidateId, recommendation },
      });

      runtime.emit?.(handoffChunk);

      const coordinatorOutput = await runtime.host.executeAgent(
        "interview-coordinator",
        buildCoordinatorPrompt(resolvedCandidateId, summary, recommendation, ctx),
        ctx,
      );

      return {
        success: true,
        message: "评估摘要已同步给面试协调员",
        data: {
          candidateId: resolvedCandidateId,
          coordinatorOutput,
        },
      };
    } catch (error) {
      return createToolError("同步评估摘要失败", error);
    }
  },
});

export function createAssessmentAgent(): any {
  return {
    id: assessmentAgentManifest.id,
    model: assessmentAgentManifest.model,
    maxSteps: 6,
    systemPrompt: `你是一位面试评估员，负责把分散的面试观察沉淀为结构化评估和可归档的面试报告。

你的核心职责：
1. 根据面试记录输出技术、沟通、文化匹配和综合评价。
2. 评分时保持一致口径，确保 1-10 分能够支持后续决策。
3. 在需要落库时创建面试评估，在需要归档时生成面试报告。
4. 需要跨角色协作时，把最终评估摘要同步给 interview-coordinator。

工作要求：
- 评价必须基于事实和行为证据，避免空泛表述。
- 综合建议只能是通过、待定、拒绝三种之一。
- 信息不足时，先指出缺失信息再给出保守判断。`,
    tools: {
      createAssessment: createAssessmentTool,
      generateAssessmentReport: generateReportTool,
      syncAssessmentToCoordinator: syncAssessmentToCoordinatorTool,
    },
  };
}

agentHost.register(assessmentAgentManifest, createAssessmentAgent);

function createToolError(message: string, error: unknown) {
  return {
    success: false,
    error: error instanceof Error ? `${message}：${error.message}` : message,
  };
}

function getAgentRuntime(options: unknown): AgentExecutionOptions {
  if (
    !options ||
    typeof options !== "object" ||
    !("state" in options) ||
    !("agentId" in options) ||
    !("host" in options)
  ) {
    throw new Error("Agent 运行时上下文不可用");
  }

  return options as AgentExecutionOptions;
}

function buildCoordinatorPrompt(
  candidateId: string,
  summary: string,
  recommendation: "pass" | "hold" | "reject",
  context: IMSContext,
): string {
  const candidate = context.currentCandidate;
  const candidateSummary = candidate
    ? [
        `候选人姓名：${candidate.name}`,
        `候选人邮箱：${candidate.email}`,
        `候选人状态：${candidate.status}`,
      ].join("\n")
    : "当前上下文没有候选人详细信息。";

  return [
    `请接收候选人 ${candidateId} 的评估结论。`,
    `综合建议：${recommendation}`,
    "",
    candidateSummary,
    "",
    `评估摘要：${summary}`,
  ].join("\n");
}
