/**
 * 面试协调员 Agent (Swarm 模式)
 * 
 * 协调多个专业 Agent 完成面试流程
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
  agentHost,
  type AgentExecutionOptions,
  type IMSContext,
  type AgentManifest,
  type DelegationResult,
} from '../host';
import { getIMSContext } from '../context-bridge';

// ==================== 1. Manifest ====================

export const interviewCoordinatorManifest: AgentManifest = {
  id: 'interview-coordinator',
  name: '面试协调员',
  description: '协调多个专业 Agent 完成面试流程',
  capabilities: [
    'interview-coordination',
    'task-delegation',
    'result-aggregation',
  ],
  model: 'gpt-4o',
  category: 'builtin',
  permissions: ['candidate:read', 'interview:read', 'interview:write'],
  handoffTargets: ['tech-interviewer', 'hr-interviewer', 'salary-advisor'],
  ui: {
    icon: 'git-branch',
    color: '#ec4899',
  },
};

// ==================== 2. Tools ====================

/**
 * 工具：创建面试计划
 */
const createInterviewPlanTool = tool({
  description: '创建面试计划',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    position: z.string().describe('应聘职位'),
    interviewType: z.enum(['technical', 'hr', 'comprehensive']).describe('面试类型'),
    stages: z.array(z.object({
      stage: z.string().describe('面试阶段'),
      interviewer: z.enum(['tech-interviewer', 'hr-interviewer', 'salary-advisor']).describe('负责 Agent'),
      duration: z.number().describe('预计时长（分钟）'),
      objectives: z.array(z.string()).describe('面试目标'),
    })).describe('面试阶段'),
  }),
  execute: async ({ candidateId, position, interviewType, stages }: any, options: any) => {
    const ctx = getIMSContext(options);

    // TODO: 调用 API 创建面试计划
    // await api.interviews.createPlan({
    //   candidateId,
    //   position,
    //   interviewType,
    //   stages,
    //   createdBy: ctx.currentUser.id,
    // });

    return {
      success: true,
      message: '面试计划已创建',
      data: {
        planId: `plan-${Date.now()}`,
        candidateId,
        position,
        interviewType,
        stages,
        createdBy: ctx.currentUser.id,
        createdAt: new Date().toISOString(),
      },
    };
  },
});

/**
 * 工具：协调子 Agent
 */
const coordinateAgentsTool = tool({
  description: '协调子 Agent 执行任务',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    tasks: z.array(z.object({
      agentId: z.enum(['tech-interviewer', 'hr-interviewer', 'salary-advisor']).describe('Agent ID'),
      task: z.string().describe('任务描述'),
      priority: z.enum(['high', 'medium', 'low']).describe('优先级'),
    })).describe('任务列表'),
  }),
  execute: async (
    { candidateId, tasks }: {
      candidateId: string;
      tasks: Array<{
        agentId: 'tech-interviewer' | 'hr-interviewer' | 'salary-advisor';
        task: string;
        priority: 'high' | 'medium' | 'low';
      }>;
    },
    options: unknown,
  ) => {
    const runtime = getAgentRuntime(options);
    const ctx = getIMSContext(runtime);

    if (tasks.length === 0) {
      throw new Error('至少需要分配一个子任务');
    }

    const sortedTasks = [...tasks].sort((left, right) => priorityWeight[right.priority] - priorityWeight[left.priority]);
    const results: DelegationResult[] = [];

    for (const task of sortedTasks) {
      const startedAt = new Date().toISOString();

      try {
        const handoffChunk = await runtime.host.handoff(runtime.agentId, task.agentId, ctx, {
          reason: `协调员分配 ${task.priority} 优先级任务`,
          message: task.task,
          metadata: { candidateId, priority: task.priority },
        });
        runtime.emit?.(handoffChunk);

        const output = await runtime.host.executeAgent(
          task.agentId,
          buildDelegationPrompt(candidateId, task.task, task.priority, ctx),
          ctx,
        );

        results.push({
          agentId: task.agentId,
          task: task.task,
          priority: task.priority,
          success: true,
          output,
          startedAt,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        results.push({
          agentId: task.agentId,
          task: task.task,
          priority: task.priority,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          completedAt: new Date().toISOString(),
        });
      }
    }

    const aggregation = runtime.host.aggregateResults(results);

    return {
      success: aggregation.failureCount === 0,
      message: aggregation.failureCount === 0 ? '任务已完成分配并执行' : '任务分配完成，部分子 Agent 执行失败',
      data: {
        candidateId,
        tasks: results,
        aggregation,
      },
    };
  },
});

/**
 * 工具：汇总面试结果
 */
const aggregateResultsTool = tool({
  description: '汇总面试结果',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    results: z.array(z.object({
      agentId: z.string().describe('Agent ID'),
      score: z.number().describe('评分'),
      summary: z.string().describe('总结'),
      recommendations: z.array(z.string()).describe('建议'),
    })).describe('各 Agent 的评估结果'),
  }),
  execute: async (
    {
      candidateId,
      results,
    }: {
      candidateId: string;
      results: Array<{
        agentId: string;
        score: number;
        summary: string;
        recommendations: string[];
      }>;
    },
    options: unknown,
  ) => {
    const runtime = getAgentRuntime(options);
    const ctx = getIMSContext(runtime);

    if (results.length === 0) {
      throw new Error('至少需要一个评估结果才能汇总');
    }

    // 计算综合评分
    const overallScore = results.reduce((sum: number, r: any) => sum + r.score, 0) / results.length;

    // 生成综合建议
    const allRecommendations = Array.from(new Set(results.flatMap(result => result.recommendations)));
    const aggregation = runtime.host.aggregateResults(
      results.map(result => ({
        agentId: result.agentId,
        task: `汇总 ${result.agentId} 评估结果`,
        success: true,
        output: `${result.summary}\n建议：${result.recommendations.join('；')}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      })),
    );

    // TODO: 调用 API 保存汇总结果
    // await api.interviews.saveAggregatedResults({
    //   candidateId,
    //   results,
    //   overallScore,
    //   allRecommendations,
    //   aggregatedBy: ctx.currentUser.id,
    // });

    return {
      success: true,
      message: '面试结果已汇总',
      data: {
        candidateId,
        results,
        overallScore: Math.round(overallScore * 10) / 10,
        allRecommendations,
        summary: aggregation.summary,
        successCount: aggregation.successCount,
        aggregatedBy: ctx.currentUser.id,
        aggregatedAt: new Date().toISOString(),
      },
    };
  },
});

// ==================== 3. Factory ====================

export function createInterviewCoordinatorAgent(): any {
  return {
    id: interviewCoordinatorManifest.id,
    model: interviewCoordinatorManifest.model,
    systemPrompt: `你是一个面试协调员，负责协调多个专业 Agent 完成面试流程。

你的工作流程：
1. 根据候选人情况制定面试计划
2. 分配任务给专业的子 Agent（技术面试官、HR 面试官、薪资顾问）
3. 监控各 Agent 的执行进度
4. 汇总各 Agent 的评估结果
5. 生成综合评估报告

你可以将任务移交给以下专业 Agent：
- tech-interviewer: 技术面试官，评估技术能力
- hr-interviewer: HR 面试官，评估软技能和文化契合度
- salary-advisor: 薪资顾问，提供薪资建议

请使用提供的工具来完成任务。`,
    tools: {
      createInterviewPlan: createInterviewPlanTool,
      coordinateAgents: coordinateAgentsTool,
      aggregateResults: aggregateResultsTool,
    },
  };
}

// ==================== 4. 注册 ====================

// 文件导入时自动注册
agentHost.register(interviewCoordinatorManifest, createInterviewCoordinatorAgent);

const priorityWeight: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function getAgentRuntime(options: unknown): AgentExecutionOptions {
  if (
    !options ||
    typeof options !== 'object' ||
    !('state' in options) ||
    !('agentId' in options) ||
    !('host' in options)
  ) {
    throw new Error('Agent 运行时上下文不可用');
  }

  return options as AgentExecutionOptions;
}

function buildDelegationPrompt(
  candidateId: string,
  task: string,
  priority: 'high' | 'medium' | 'low',
  context: IMSContext,
): string {
  const candidate = context.currentCandidate;
  const candidateSummary = candidate
    ? [
        `候选人姓名：${candidate.name}`,
        `候选人邮箱：${candidate.email}`,
        `候选人状态：${candidate.status}`,
        candidate.tags.length > 0 ? `候选人标签：${candidate.tags.join('、')}` : undefined,
        candidate.resumeData.rawText
          ? `简历摘要：${candidate.resumeData.rawText.slice(0, 800)}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n')
    : '当前上下文没有候选人详细信息，请基于任务本身给出结论。';

  return [
    `请处理候选人 ${candidateId} 的子任务。`,
    `任务优先级：${priority}`,
    `任务说明：${task}`,
    '',
    candidateSummary,
    '',
    '请输出结构化、可执行的专业结论，便于协调员后续聚合。',
  ].join('\n');
}
