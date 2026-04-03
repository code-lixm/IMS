import { tool } from 'ai';
import { z } from 'zod';
import {
  agentHost,
  type AgentExecutionOptions,
  type AgentManifest,
  type IMSContext,
} from '../host';
import { getIMSContext } from '../context-bridge';

export const salaryAdvisorManifest: AgentManifest = {
  id: 'salary-advisor',
  name: '薪资顾问',
  description: '提供薪资建议、市场分析和 Offer 方案',
  capabilities: [
    'salary-analysis',
    'market-research',
    'offer-recommendation',
  ],
  model: 'gpt-4o',
  category: 'builtin',
  permissions: ['candidate:read', 'interview:read'],
  handoffTargets: ['interview-coordinator'],
  ui: {
    icon: 'dollar-sign',
    color: '#f59e0b',
  },
};

const locationMultiplierMap: Record<string, number> = {
  北京: 1.3,
  上海: 1.3,
  深圳: 1.25,
  杭州: 1.18,
  广州: 1.15,
  remote: 1.1,
};

const saveSalarySchema = z.object({
  suggestedSalary: z.number().describe('建议薪资'),
  reasoning: z.string().describe('建议理由'),
  riskLevel: z.enum(['low', 'medium', 'high']).describe('风险等级'),
  negotiationPoints: z.array(z.string()).min(1).describe('谈判要点'),
});

type SaveSalaryRecommendation = z.infer<typeof saveSalarySchema>;

const getMarketSalaryTool = tool({
  description: '基于职位、地点和经验给出市场薪资区间与分位值估算',
  inputSchema: z.object({
    jobTitle: z.string().describe('职位名称'),
    location: z.string().optional().describe('工作地点'),
    experience: z.number().optional().describe('工作年限'),
  }),
  execute: async ({ jobTitle, location, experience }: { jobTitle: string; location?: string; experience?: number }) => {
    try {
      const normalizedLocation = location?.trim() || '全国';
      const locationMultiplier = location ? (locationMultiplierMap[location] ?? 1) : 1;
      const experienceYears = experience ?? 3;
      const baseSalary = estimateBaseSalary(jobTitle, experienceYears);
      const median = Math.round(baseSalary * locationMultiplier);

      return {
        success: true,
        data: {
          jobTitle,
          location: normalizedLocation,
          experience: experienceYears,
          salaryRange: {
            min: Math.round(median * 0.82),
            max: Math.round(median * 1.2),
            median,
          },
          percentiles: {
            p25: Math.round(median * 0.88),
            p50: median,
            p75: Math.round(median * 1.12),
            p90: Math.round(median * 1.26),
          },
          marketNotes: [
            `${normalizedLocation} 对薪资存在 ${Math.round((locationMultiplier - 1) * 100)}% 左右浮动影响`,
            experienceYears >= 6 ? '资深岗位通常更关注业务复杂度和影响范围' : '中初级岗位通常更关注可培养性和技术契合度',
          ],
        },
      };
    } catch (error) {
      return createToolError('查询市场薪资失败', error);
    }
  },
});

const evaluateCompensationFactorsTool = tool({
  description: '结合候选人经验、技能和当前期望，分析薪资杠杆点与谈判风险',
  inputSchema: z.object({
    jobTitle: z.string().describe('职位名称'),
    experience: z.number().describe('工作年限'),
    skills: z.array(z.string()).min(1).describe('技能列表'),
    location: z.string().optional().describe('工作地点'),
    currentSalary: z.number().optional().describe('当前薪资'),
    expectedSalary: z.number().optional().describe('期望薪资'),
  }),
  execute: async (
    {
      jobTitle,
      experience,
      skills,
      location,
      currentSalary,
      expectedSalary,
    }: {
      jobTitle: string;
      experience: number;
      skills: string[];
      location?: string;
      currentSalary?: number;
      expectedSalary?: number;
    },
  ) => {
    try {
      const marketMedian = Math.round(estimateBaseSalary(jobTitle, experience) * (location ? (locationMultiplierMap[location] ?? 1) : 1));
      const scarceSkillCount = skills.filter(skill => /架构|AI|算法|云|分布式|Rust|Go|TypeScript/i.test(skill)).length;
      const leverageScore = Math.min(10, 4 + experience * 0.5 + scarceSkillCount);
      const riskSignals = [
        expectedSalary && expectedSalary > marketMedian * 1.2 ? '候选人期望明显高于市场中位数' : undefined,
        currentSalary && expectedSalary && expectedSalary < currentSalary ? '候选人期望低于当前薪资，需确认动机和真实性' : undefined,
        scarceSkillCount === 0 ? '技能稀缺性一般，谈判空间更依赖岗位紧迫度' : undefined,
      ].filter((item): item is string => Boolean(item));

      return {
        success: true,
        data: {
          jobTitle,
          marketMedian,
          leverageScore,
          scarceSkillCount,
          negotiationLevers: [
            experience >= 5 ? '复杂项目经验' : '成长速度与培养潜力',
            skills.slice(0, 3).join(' / '),
            location ? `${location} 市场供需情况` : '候选人与岗位的匹配速度',
          ],
          riskSignals,
        },
      };
    } catch (error) {
      return createToolError('分析薪资影响因素失败', error);
    }
  },
});

const generateSalaryRecommendationTool = tool({
  description: '根据职位、经验和技能生成建议薪资区间、理由和谈判策略',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    jobTitle: z.string().describe('职位名称'),
    experience: z.number().describe('工作年限'),
    skills: z.array(z.string()).min(1).describe('技能列表'),
    location: z.string().optional().describe('工作地点'),
    currentSalary: z.number().optional().describe('当前薪资'),
    expectedSalary: z.number().optional().describe('期望薪资'),
  }),
  execute: async (
    params: {
      candidateId: string;
      jobTitle: string;
      experience: number;
      skills: string[];
      location?: string;
      currentSalary?: number;
      expectedSalary?: number;
    },
  ) => {
    try {
      const locationMultiplier = params.location ? (locationMultiplierMap[params.location] ?? 1) : 1;
      const baseRecommendation = Math.round(estimateBaseSalary(params.jobTitle, params.experience) * locationMultiplier);
      const skillPremium = Math.min(0.12, params.skills.length * 0.015);
      const recommended = Math.round(baseRecommendation * (1 + skillPremium));
      const min = Math.round(recommended * 0.92);
      const max = Math.round(recommended * 1.1);
      const expectedGap = params.expectedSalary ? params.expectedSalary - recommended : 0;

      return {
        success: true,
        data: {
          candidateId: params.candidateId,
          recommendation: {
            suggestedRange: {
              min,
              max,
              recommended,
            },
            reasoning: [
              `候选人拥有 ${params.experience} 年相关经验`,
              `核心技能为 ${params.skills.slice(0, 4).join('、')}`,
              params.currentSalary ? `当前薪资为 ${params.currentSalary}，建议控制涨幅在合理区间内` : undefined,
              params.expectedSalary ? `候选人期望为 ${params.expectedSalary}，与建议值差异为 ${expectedGap}` : undefined,
            ].filter((item): item is string => Boolean(item)),
            riskLevel: expectedGap > max * 0.08 ? 'high' : expectedGap > 0 ? 'medium' : 'low',
            negotiationStrategy: [
              '先用市场区间和岗位影响范围校准预期',
              '将固定薪资与成长路径、奖金、福利组合打包讨论',
              expectedGap > 0 ? '若预算不足，优先谈签字奖金或试用期调薪节点' : '以决策效率和入职节奏提升接受概率',
            ],
          },
        },
      };
    } catch (error) {
      return createToolError('生成薪资建议失败', error);
    }
  },
});

const coordinateCompensationDecisionTool = tool({
  description: '将薪资建议同步给 interview-coordinator，便于综合做 offer 决策',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    summary: z.string().min(1).describe('薪资建议摘要'),
    suggestedSalary: z.number().describe('建议薪资'),
    riskLevel: z.enum(['low', 'medium', 'high']).describe('风险等级'),
    negotiationPoints: z.array(z.string()).min(1).describe('谈判要点'),
  }),
  execute: async (
    {
      candidateId,
      summary,
      suggestedSalary,
      riskLevel,
      negotiationPoints,
    }: {
      candidateId?: string;
      summary: string;
      suggestedSalary: number;
      riskLevel: 'low' | 'medium' | 'high';
      negotiationPoints: string[];
    },
    options: unknown,
  ) => {
    try {
      const runtime = getAgentRuntime(options);
      const ctx = getIMSContext(runtime);
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '缺少 candidateId，无法同步薪资建议' };
      }

      const handoffChunk = await runtime.host.handoff(runtime.agentId, 'interview-coordinator', ctx, {
        reason: '同步薪资建议并请求综合 offer 决策',
        message: summary,
        metadata: {
          candidateId: resolvedCandidateId,
          suggestedSalary,
          riskLevel,
        },
      });
      runtime.emit?.(handoffChunk);

      const coordinatorOutput = await runtime.host.executeAgent(
        'interview-coordinator',
        buildCoordinatorPrompt(resolvedCandidateId, summary, suggestedSalary, riskLevel, negotiationPoints, ctx),
        ctx,
      );

      return {
        success: true,
        message: '薪资建议已同步给面试协调员',
        data: {
          candidateId: resolvedCandidateId,
          coordinatorOutput,
        },
      };
    } catch (error) {
      return createToolError('同步薪资建议失败', error);
    }
  },
});

const saveSalaryRecommendationTool = tool({
  description: '保存薪资建议',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    recommendation: saveSalarySchema,
  }),
  execute: async (
    { candidateId, recommendation }: { candidateId?: string; recommendation: SaveSalaryRecommendation },
    options: unknown,
  ) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '缺少 candidateId，无法保存薪资建议' };
      }

      return {
        success: true,
        message: '薪资建议已保存',
        data: {
          candidateId: resolvedCandidateId,
          ...recommendation,
          recommendedBy: ctx.currentUser.id,
          recommendedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return createToolError('保存薪资建议失败', error);
    }
  },
});

export function createSalaryAdvisorAgent(): any {
  return {
    id: salaryAdvisorManifest.id,
    model: salaryAdvisorManifest.model,
    maxSteps: 6,
    systemPrompt: `你是一位偏招聘决策场景的薪资顾问，擅长把候选人价值、市场区间和预算风险讲清楚。

你的职责：
1. 结合岗位、经验、城市和技能稀缺度判断市场薪资区间。
2. 产出可执行的建议薪资、风险等级和谈判策略。
3. 明确指出候选人预期与公司预算之间的差距和缓冲方案。
4. 需要综合决策时，主动把薪资建议同步给 interview-coordinator。

工作要求：
- 给出数字区间时必须附带依据。
- 兼顾候选人吸引力与组织成本控制。
- 输出要便于后续生成 offer 或综合评审。`,
    tools: {
      getMarketSalary: getMarketSalaryTool,
      evaluateCompensationFactors: evaluateCompensationFactorsTool,
      generateSalaryRecommendation: generateSalaryRecommendationTool,
      coordinateCompensationDecision: coordinateCompensationDecisionTool,
      saveSalaryRecommendation: saveSalaryRecommendationTool,
    },
  };
}

agentHost.register(salaryAdvisorManifest, createSalaryAdvisorAgent);

function estimateBaseSalary(jobTitle: string, experience: number): number {
  const title = jobTitle.toLowerCase();
  const titleMultiplier = /架构|principal|staff|专家/i.test(title)
    ? 1.5
    : /前端|后端|全栈|工程师|developer|engineer/i.test(title)
      ? 1.2
      : 1;

  return Math.round((12000 + experience * 1800) * titleMultiplier);
}

function createToolError(message: string, error: unknown) {
  return {
    success: false,
    error: error instanceof Error ? `${message}：${error.message}` : message,
  };
}

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

function buildCoordinatorPrompt(
  candidateId: string,
  summary: string,
  suggestedSalary: number,
  riskLevel: 'low' | 'medium' | 'high',
  negotiationPoints: string[],
  context: IMSContext,
): string {
  const candidateName = context.currentCandidate?.name ?? '未知候选人';

  return [
    `请接收来自 salary-advisor 的薪资建议，并用于候选人 ${candidateId} 的综合决策。`,
    `候选人姓名：${candidateName}`,
    `薪资摘要：${summary}`,
    `建议薪资：${suggestedSalary}`,
    `风险等级：${riskLevel}`,
    `谈判要点：${negotiationPoints.join('；')}`,
    '请给出是否进入 offer 流程、还需补充哪些输入，以及如何向招聘团队汇总。',
  ].join('\n');
}
