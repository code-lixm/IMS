/**
 * 薪资顾问 Agent
 * 
 * 提供薪资建议、市场分析和 Offer 方案
 */

import { openai } from '@ai-sdk/openai';
import { tool } from 'ai';
import { z } from 'zod';
import { agentHost, type AgentManifest } from '../host';
import { getIMSContext } from '../context-bridge';

// ==================== 1. Manifest ====================

export const salaryAdvisorManifest: AgentManifest = {
  id: 'salary-advisor',
  name: '薪资顾问',
  description: '提供薪资建议、市场分析和 Offer 方案',
  capabilities: [
    'salary-analysis',
    'market-research',
    'offer-recommendation',
  ],
  model: openai('gpt-4o'),
  category: 'builtin',
  permissions: ['candidate:read', 'interview:read'],
  handoffTargets: ['interview-coordinator'],
  ui: {
    icon: 'dollar-sign',
    color: '#f59e0b',
  },
};

// ==================== 2. Tools ====================

/**
 * 工具：查询市场薪资数据
 */
const getMarketSalaryTool = tool({
  description: '查询市场薪资数据',
  inputSchema: z.object({
    jobTitle: z.string().describe('职位名称'),
    location: z.string().optional().describe('工作地点'),
    experience: z.number().optional().describe('工作年限'),
  }),
  execute: async ({ jobTitle, location, experience }: { jobTitle: string; location?: string; experience?: number }) => {
    // TODO: 调用 API 查询市场薪资数据
    // const marketData = await api.salary.getMarketData({ jobTitle, location, experience });

    // 模拟返回数据
    const baseSalary = 15000 + (experience || 0) * 2000;
    const locationMultiplier = location === '北京' || location === '上海' ? 1.3 : 1.0;

    return {
      success: true,
      data: {
        jobTitle,
        location,
        experience,
        salaryRange: {
          min: Math.round(baseSalary * locationMultiplier * 0.8),
          max: Math.round(baseSalary * locationMultiplier * 1.2),
          median: Math.round(baseSalary * locationMultiplier),
        },
        percentiles: {
          p25: Math.round(baseSalary * locationMultiplier * 0.85),
          p50: Math.round(baseSalary * locationMultiplier),
          p75: Math.round(baseSalary * locationMultiplier * 1.15),
          p90: Math.round(baseSalary * locationMultiplier * 1.3),
        },
      },
    };
  },
});

/**
 * 工具：生成薪资建议
 */
const generateSalaryRecommendationTool = tool({
  description: '生成薪资建议',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    jobTitle: z.string().describe('职位名称'),
    experience: z.number().describe('工作年限'),
    skills: z.array(z.string()).describe('技能列表'),
    currentSalary: z.number().optional().describe('当前薪资'),
    expectedSalary: z.number().optional().describe('期望薪资'),
  }),
  execute: async (params: any) => {
    // TODO: 调用 AI 生成薪资建议
    // const recommendation = await generateSalaryRecommendation(params);

    const { experience, currentSalary, expectedSalary } = params;
    const baseRecommendation = 15000 + experience * 2000;

    return {
      success: true,
      data: {
        candidateId: params.candidateId,
        recommendation: {
          suggestedRange: {
            min: Math.round(baseRecommendation * 0.9),
            max: Math.round(baseRecommendation * 1.1),
            recommended: baseRecommendation,
          },
          reasoning: [
            `候选人拥有 ${experience} 年工作经验`,
            `技能匹配度较高`,
            currentSalary ? `当前薪资 ${currentSalary}，建议涨幅 15-25%` : undefined,
            expectedSalary ? `期望薪资 ${expectedSalary}` : undefined,
          ].filter(Boolean),
          negotiationStrategy: [
            '强调公司发展前景和团队氛围',
            '提供有竞争力的福利待遇',
            '讨论职业发展机会',
          ],
        },
      },
    };
  },
});

/**
 * 工具：保存薪资建议
 */
const saveSalaryRecommendationTool = tool({
  description: '保存薪资建议',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    recommendation: z.object({
      suggestedSalary: z.number().describe('建议薪资'),
      reasoning: z.string().describe('建议理由'),
      riskLevel: z.enum(['low', 'medium', 'high']).describe('风险等级'),
      negotiationPoints: z.array(z.string()).describe('谈判要点'),
    }),
  }),
  execute: async ({ candidateId, recommendation }: { candidateId: string; recommendation: any }, options: any) => {
    const ctx = getIMSContext(options);

    // TODO: 调用 API 保存薪资建议
    // await api.salary.saveRecommendation(candidateId, {
    //   ...recommendation,
    //   recommendedBy: ctx.currentUser.id,
    //   recommendedAt: new Date().toISOString(),
    // });

    return {
      success: true,
      message: '薪资建议已保存',
      data: {
        candidateId,
        ...recommendation,
        recommendedBy: ctx.currentUser.id,
        recommendedAt: new Date().toISOString(),
      },
    };
  },
});

// ==================== 3. Factory ====================

export function createSalaryAdvisorAgent(): any {
  return {
    id: salaryAdvisorManifest.id,
    model: salaryAdvisorManifest.model,
    systemPrompt: `你是一位资深的薪资顾问，负责提供薪资建议和市场分析。

你的工作流程：
1. 分析候选人的技能、经验和市场价值
2. 查询相关职位的市场薪资数据
3. 考虑候选人的期望和当前薪资
4. 生成合理的薪资建议和谈判策略
5. 评估薪资风险和可行性

请使用提供的工具来完成任务。`,
    tools: {
      getMarketSalary: getMarketSalaryTool,
      generateSalaryRecommendation: generateSalaryRecommendationTool,
      saveSalaryRecommendation: saveSalaryRecommendationTool,
    },
  };
}

// ==================== 4. 注册 ====================

// 文件导入时自动注册
agentHost.register(salaryAdvisorManifest, createSalaryAdvisorAgent);