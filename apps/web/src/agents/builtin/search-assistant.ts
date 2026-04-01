/**
 * 搜索助手 Agent
 * 
 * 帮助用户搜索、筛选和排序候选人
 */

import { openai } from '@ai-sdk/openai';
import { tool } from 'ai';
import { z } from 'zod';
import { agentHost, type AgentManifest } from '../host';
import { getIMSContext } from '../context-bridge';

// ==================== 1. Manifest ====================

export const searchAssistantManifest: AgentManifest = {
  id: 'search-assistant',
  name: '搜索助手',
  description: '帮助用户搜索、筛选和排序候选人',
  capabilities: [
    'candidate-search',
    'filter-building',
    'result-sorting',
  ],
  model: openai('gpt-4o'),
  category: 'builtin',
  permissions: ['candidate:read'],
  handoffTargets: [],
  ui: {
    icon: 'search',
    color: '#06b6d4',
  },
};

// ==================== 2. Tools ====================

/**
 * 工具：搜索候选人
 */
const searchCandidatesTool = tool({
  description: '搜索候选人',
  inputSchema: z.object({
    query: z.string().optional().describe('搜索关键词'),
    filters: z.object({
      status: z.array(z.string()).optional().describe('候选人状态'),
      skills: z.array(z.string()).optional().describe('技能要求'),
      experience: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional().describe('工作年限范围'),
      location: z.array(z.string()).optional().describe('工作地点'),
      education: z.array(z.string()).optional().describe('学历要求'),
    }).optional().describe('筛选条件'),
    sortBy: z.enum(['relevance', 'date', 'score']).optional().describe('排序方式'),
    limit: z.number().optional().describe('返回数量限制'),
  }),
  execute: async ({ query, filters, sortBy }: any) => {
    // TODO: 调用 API 搜索候选人
    // const candidates = await api.candidates.search({ query, filters, sortBy, limit });

    // 模拟返回数据
    return {
      success: true,
      data: {
        query,
        filters,
        sortBy: sortBy || 'relevance',
        total: 10,
        candidates: [
          {
            id: 'candidate-1',
            name: '张三',
            status: 'new',
            skills: ['React', 'TypeScript'],
            experience: 5,
            location: '北京',
            matchScore: 95,
          },
          {
            id: 'candidate-2',
            name: '李四',
            status: 'interviewing',
            skills: ['Vue', 'Node.js'],
            experience: 3,
            location: '上海',
            matchScore: 88,
          },
        ],
      },
    };
  },
});

/**
 * 工具：保存搜索条件
 */
const saveSearchFilterTool = tool({
  description: '保存搜索条件',
  inputSchema: z.object({
    name: z.string().describe('筛选器名称'),
    filters: z.object({
      status: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
      experience: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional(),
      location: z.array(z.string()).optional(),
      education: z.array(z.string()).optional(),
    }).describe('筛选条件'),
  }),
  execute: async ({ name, filters }: { name: string; filters: any }, options: any) => {
    const ctx = getIMSContext(options);

    // TODO: 调用 API 保存搜索条件
    // await api.filters.save({
    //   name,
    //   filters,
    //   createdBy: ctx.currentUser.id,
    // });

    return {
      success: true,
      message: '搜索条件已保存',
      data: {
        id: `filter-${Date.now()}`,
        name,
        filters,
        createdBy: ctx.currentUser.id,
        createdAt: new Date().toISOString(),
      },
    };
  },
});

/**
 * 工具：获取推荐的候选人
 */
const getRecommendedCandidatesTool = tool({
  description: '获取推荐的候选人',
  inputSchema: z.object({
    jobId: z.string().optional().describe('职位 ID'),
    limit: z.number().optional().describe('返回数量'),
  }),
  execute: async ({ jobId }: { jobId?: string; limit?: number }) => {
    // TODO: 调用 API 获取推荐候选人
    // const recommendations = await api.candidates.getRecommendations({ jobId, limit });

    return {
      success: true,
      data: {
        jobId,
        recommendations: [
          {
            candidateId: 'candidate-1',
            name: '张三',
            matchScore: 95,
            reason: '技能匹配度高，经验丰富',
          },
          {
            candidateId: 'candidate-2',
            name: '李四',
            matchScore: 88,
            reason: '技术栈符合要求',
          },
        ],
      },
    };
  },
});

// ==================== 3. Factory ====================

export function createSearchAssistantAgent(): any {
  return {
    id: searchAssistantManifest.id,
    model: searchAssistantManifest.model,
    systemPrompt: `你是一个智能搜索助手，帮助用户快速找到合适的候选人。

你的工作流程：
1. 理解用户的搜索意图
2. 构建合适的搜索条件和筛选器
3. 执行搜索并返回结果
4. 根据用户反馈优化搜索
5. 提供候选人推荐

请使用提供的工具来完成任务。`,
    tools: {
      searchCandidates: searchCandidatesTool,
      saveSearchFilter: saveSearchFilterTool,
      getRecommendedCandidates: getRecommendedCandidatesTool,
    },
  };
}

// ==================== 4. 注册 ====================

// 文件导入时自动注册
agentHost.register(searchAssistantManifest, createSearchAssistantAgent);