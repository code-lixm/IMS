/**
 * HR 面试官 Agent
 * 
 * 评估候选人的软技能、文化契合度和职业规划
 */

import { tool } from 'ai';
import { z } from 'zod';
import { agentHost, type AgentManifest } from '../host';
import { getIMSContext } from '../context-bridge';

// ==================== 1. Manifest ====================

export const hrInterviewerManifest: AgentManifest = {
  id: 'hr-interviewer',
  name: 'HR 面试官',
  description: '评估候选人的软技能、文化契合度和职业规划',
  capabilities: [
    'soft-skills-evaluation',
    'culture-fit-assessment',
    'career-planning',
  ],
  model: 'gpt-4o',
  category: 'builtin',
  permissions: ['candidate:read', 'interview:write'],
  handoffTargets: ['interview-coordinator'],
  ui: {
    icon: 'users',
    color: '#8b5cf6',
  },
};

// ==================== 2. Tools ====================

/**
 * 工具：生成 HR 面试问题
 */
const getHRQuestionsTool = tool({
  description: '生成 HR 面试问题',
  inputSchema: z.object({
    focusArea: z.enum(['soft-skills', 'culture-fit', 'career-planning', 'general']).describe('关注领域'),
    candidateLevel: z.enum(['junior', 'mid', 'senior']).describe('候选人级别'),
  }),
  execute: async ({ focusArea, candidateLevel }: { focusArea: string; candidateLevel: string }) => {
    const questionBank: Record<string, string[]> = {
      'soft-skills': [
        '请描述一次你成功解决团队冲突的经历',
        '你如何处理工作中的压力和挑战？',
        '请分享一次你主动承担责任并超出预期的经历',
      ],
      'culture-fit': [
        '你理想的工作环境是什么样的？',
        '你如何看待工作与生活的平衡？',
        '请描述一次你在团队中发挥关键作用的经历',
      ],
      'career-planning': [
        '你未来 3-5 年的职业规划是什么？',
        '你为什么选择这个职位？',
        '你希望从这份工作中获得什么？',
      ],
      'general': [
        '请做一个自我介绍',
        '你的优势和劣势是什么？',
        '你有什么问题想问我们吗？',
      ],
    };

    const questions = questionBank[focusArea] || questionBank['general'];

    return {
      success: true,
      data: {
        focusArea,
        candidateLevel,
        questions,
      },
    };
  },
});

/**
 * 工具：保存 HR 评估结果
 */
const saveHRAssessmentTool = tool({
  description: '保存 HR 评估结果',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    assessment: z.object({
      softSkillsScore: z.number().min(1).max(10).describe('软技能评分'),
      cultureFitScore: z.number().min(1).max(10).describe('文化契合度评分'),
      communicationScore: z.number().min(1).max(10).describe('沟通能力评分'),
      strengths: z.array(z.string()).describe('优势'),
      concerns: z.array(z.string()).describe('关注点'),
      careerGoals: z.string().describe('职业目标'),
      overallRecommendation: z.enum(['strongly-recommend', 'recommend', 'neutral', 'not-recommend']).describe('整体推荐'),
      notes: z.string().optional().describe('备注'),
    }),
  }),
  execute: async ({ candidateId, assessment }: { candidateId: string; assessment: any }, options: any) => {
    const ctx = getIMSContext(options);

    // TODO: 调用 API 保存评估结果
    // await api.interviews.saveHRAssessment(candidateId, {
    //   ...assessment,
    //   assessedBy: ctx.currentUser.id,
    //   assessedAt: new Date().toISOString(),
    // });

    return {
      success: true,
      message: 'HR 评估已保存',
      data: {
        candidateId,
        ...assessment,
        assessedBy: ctx.currentUser.id,
        assessedAt: new Date().toISOString(),
      },
    };
  },
});

// ==================== 3. Factory ====================

export function createHRInterviewerAgent(): any {
  return {
    id: hrInterviewerManifest.id,
    model: hrInterviewerManifest.model,
    systemPrompt: `你是一位资深的 HR 面试官，负责评估候选人的软技能和文化契合度。

你的工作流程：
1. 根据候选人背景设计针对性问题
2. 评估沟通能力、团队协作、问题解决等软技能
3. 判断候选人与公司文化的契合度
4. 了解候选人的职业规划和期望
5. 给出客观的评估和建议

请使用提供的工具来完成任务。`,
    tools: {
      getHRQuestions: getHRQuestionsTool,
      saveHRAssessment: saveHRAssessmentTool,
    },
  };
}

// ==================== 4. 注册 ====================

// 文件导入时自动注册
agentHost.register(hrInterviewerManifest, createHRInterviewerAgent);
