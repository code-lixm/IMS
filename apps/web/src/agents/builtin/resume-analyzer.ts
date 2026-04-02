/**
 * 简历分析助手 Agent
 * 
 * 分析候选人简历，提取关键技能、工作经验，并给出匹配度评估
 */

import { tool } from 'ai';
import { z } from 'zod';
import { agentHost, type AgentManifest } from '../host';
import { getIMSContext } from '../context-bridge';

// ==================== 1. Manifest ====================

export const resumeAnalyzerManifest: AgentManifest = {
  id: 'resume-analyzer',
  name: '简历分析助手',
  description: '分析候选人简历，提取关键技能、工作经验，并给出匹配度评估',
  capabilities: [
    'resume-parsing',
    'skill-extraction',
    'experience-analysis',
    'job-matching',
  ],
  model: 'gpt-4o',
  category: 'builtin',
  permissions: ['candidate:read', 'resume:read'],
  handoffTargets: ['interview-coordinator', 'salary-advisor'],
  ui: {
    icon: 'file-text',
    color: '#3b82f6',
  },
};

// ==================== 2. Tools ====================

/**
 * 工具：获取当前候选人的简历
 */
const getResumeTool = tool({
  description: '获取当前正在查看的候选人的简历数据',
  inputSchema: z.object({
    includeParsed: z.boolean().optional().describe('是否包含解析后的结构化数据'),
  }),
  execute: async ({ includeParsed }: { includeParsed?: boolean }, options: any) => {
    const ctx = getIMSContext(options);
    const candidate = ctx.currentCandidate;

    if (!candidate) {
      return {
        success: false,
        error: '当前没有选中的候选人，请先在列表中选择一个候选人',
      };
    }

    return {
      success: true,
      data: {
        candidateId: candidate.id,
        name: candidate.name,
        rawText: candidate.resumeData?.rawText || '',
        parsedData: includeParsed ? candidate.resumeData?.parsedData : undefined,
      },
    };
  },
});

/**
 * 工具：保存分析结果到候选人档案
 */
const saveAnalysisTool = tool({
  description: '将简历分析结果保存到候选人档案中',
  inputSchema: z.object({
    summary: z.string().describe('综合分析摘要'),
    skills: z.array(z.object({
      name: z.string(),
      level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
      category: z.enum(['technical', 'soft', 'domain']),
    })).describe('提取的技能列表'),
    experience: z.object({
      totalYears: z.number(),
      relevantYears: z.number(),
      highlights: z.array(z.string()),
    }).describe('工作经验分析'),
    matchScore: z.number().min(0).max(100).describe('与目标岗位的匹配度评分'),
    recommendations: z.array(z.string()).describe('面试建议和关注点'),
  }),
  execute: async (data: any, options: any) => {
    const ctx = getIMSContext(options);
    const candidateId = ctx.currentCandidate?.id;

    if (!candidateId) {
      return { success: false, error: '没有选中的候选人' };
    }

    // TODO: 调用 API 保存分析结果
    // await api.candidates.updateAnalysis(candidateId, {
    //   ...data,
    //   analyzedAt: new Date().toISOString(),
    //   analyzedBy: ctx.currentUser.id,
    // });

    return { 
      success: true, 
      message: '分析结果已保存',
      data: {
        candidateId,
        ...data,
        analyzedAt: new Date().toISOString(),
      }
    };
  },
});

/**
 * 工具：查询岗位要求（用于匹配度评估）
 */
const searchJobRequirementsTool = tool({
  description: '查询当前招聘的岗位要求',
  inputSchema: z.object({
    jobTitle: z.string().optional().describe('职位名称，不传则返回所有在招职位'),
  }),
  execute: async ({ jobTitle }: { jobTitle?: string }) => {
    // TODO: 调用 API 查询岗位信息
    // const jobs = await api.jobs.list({ active: true, title: jobTitle });
    
    // 模拟返回数据
    return {
      success: true,
      data: [
        {
          id: 'job-1',
          title: jobTitle || '高级前端工程师',
          department: '技术部',
          requirements: '5年以上前端开发经验，熟悉 React/Vue',
          requiredSkills: ['React', 'TypeScript', 'Node.js'],
          minExperience: 5,
        }
      ],
    };
  },
});

// ==================== 3. Factory ====================

export function createResumeAnalyzerAgent(): any {
  return {
    id: resumeAnalyzerManifest.id,
    model: resumeAnalyzerManifest.model,
    systemPrompt: `你是一个专业的简历分析助手，擅长从简历中提取关键信息并给出专业评估。

你的工作流程：
1. 读取候选人简历内容
2. 提取关键技能（技术栈、软技能）
3. 分析工作经历（公司背景、项目经验、职责范围）
4. 评估教育背景与岗位的匹配度
5. 生成结构化的分析报告
6. 给出面试建议和关注点

请使用提供的工具来完成任务。`,
    tools: {
      getResume: getResumeTool,
      saveAnalysis: saveAnalysisTool,
      searchJobRequirements: searchJobRequirementsTool,
    },
  };
}

// ==================== 4. 注册 ====================

// 文件导入时自动注册
agentHost.register(resumeAnalyzerManifest, createResumeAnalyzerAgent);
