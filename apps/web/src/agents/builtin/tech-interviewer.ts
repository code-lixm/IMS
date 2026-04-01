/**
 * 技术面试官 Agent
 * 
 * 深入评估候选人的技术能力和解决问题的能力
 */

import { openai } from '@ai-sdk/openai';
import { tool } from 'ai';
import { z } from 'zod';
import { agentHost, type AgentManifest } from '../host';
import { getIMSContext } from '../context-bridge';

// ==================== 1. Manifest ====================

export const techInterviewerManifest: AgentManifest = {
  id: 'tech-interviewer',
  name: '技术面试官',
  description: '深入评估候选人的技术能力和解决问题的能力',
  capabilities: [
    'technical-evaluation',
    'coding-assessment',
    'system-design',
  ],
  model: openai('gpt-4o'),
  category: 'builtin',
  permissions: ['candidate:read', 'interview:write'],
  handoffTargets: ['interview-coordinator'],
  ui: {
    icon: 'code',
    color: '#10b981',
  },
};

// ==================== 2. Tools ====================

/**
 * 工具：根据技术栈生成面试问题
 */
const getTechnicalQuestionsTool = tool({
  description: '根据技术栈生成面试问题',
  inputSchema: z.object({
    techStack: z.array(z.string()).describe('技术栈列表'),
    level: z.enum(['junior', 'mid', 'senior']).describe('候选人级别'),
  }),
  execute: async ({ techStack, level }: { techStack: string[]; level: 'junior' | 'mid' | 'senior' }) => {
    // TODO: 实现问题生成逻辑
    // 可以调用 AI 生成针对性问题，或从题库中筛选
    
    const questions = techStack.map(tech => ({
      technology: tech,
      questions: [
        `请介绍一下你在 ${tech} 方面的项目经验`,
        `在 ${tech} 开发中遇到过哪些挑战？如何解决的？`,
        level === 'senior' ? `如何优化 ${tech} 应用的性能？` : undefined,
      ].filter(Boolean),
    }));

    return {
      success: true,
      data: questions,
    };
  },
});

/**
 * 工具：保存技术评估结果
 */
const saveTechnicalAssessmentTool = tool({
  description: '保存技术评估结果',
  inputSchema: z.object({
    candidateId: z.string().describe('候选人 ID'),
    assessment: z.object({
      technicalScore: z.number().min(1).max(10).describe('技术能力评分'),
      strengths: z.array(z.string()).describe('技术优势'),
      weaknesses: z.array(z.string()).describe('需要提升的方面'),
      recommendedQuestions: z.array(z.string()).describe('建议进一步验证的问题'),
      overallImpression: z.string().describe('整体印象'),
    }),
  }),
  execute: async ({ candidateId, assessment }: { candidateId: string; assessment: any }, options: any) => {
    const ctx = getIMSContext(options);
    
    // TODO: 调用 API 保存评估结果
    // await api.interviews.saveTechnicalAssessment(candidateId, {
    //   ...assessment,
    //   assessedBy: ctx.currentUser.id,
    //   assessedAt: new Date().toISOString(),
    // });

    return {
      success: true,
      message: '技术评估已保存',
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

export function createTechInterviewerAgent(): any {
  return {
    id: techInterviewerManifest.id,
    model: techInterviewerManifest.model,
    systemPrompt: `你是一位资深技术面试官，负责深入评估候选人的技术能力。

你的工作流程：
1. 根据简历中的技术栈设计针对性问题
2. 深入考察候选人的技术深度和广度
3. 评估解决问题的能力和思维方式
4. 给出客观的技术能力评分（1-10分）
5. 列出需要进一步验证的技术点

请使用提供的工具来完成任务。`,
    tools: {
      getTechnicalQuestions: getTechnicalQuestionsTool,
      saveTechnicalAssessment: saveTechnicalAssessmentTool,
    },
  };
}

// ==================== 4. 注册 ====================

// 文件导入时自动注册
agentHost.register(techInterviewerManifest, createTechInterviewerAgent);