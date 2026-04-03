/**
 * AgentHost - Agent 注册管理中心
 * 
 * 文件位置: apps/web/src/agents/host.ts
 * 
 * 职责:
 * - Agent 注册与发现
 * - 统一执行入口(流式/非流式)
 * - Manifest 管理(用于 UI 展示)
 */

import { streamText, generateText, tool, stepCountIs } from 'ai';
import { getPreferredGatewayEndpointConfig } from '@/lib/ai-gateway-config';
import type { ZodSchema } from 'zod';
import { fileTools } from './tools/file-tools';

type AgentLanguageModel = Parameters<typeof streamText>[0]['model'];
type OpenAIProviderFactory = (modelId: string) => AgentLanguageModel;

interface OpenAIModuleShape {
  createOpenAI: (options: {
    apiKey: string;
    baseURL?: string;
  }) => OpenAIProviderFactory;
}

function isOpenAIModule(value: unknown): value is OpenAIModuleShape {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const createOpenAI = Reflect.get(value, 'createOpenAI');
  return typeof createOpenAI === 'function';
}

async function createModelProvider(): Promise<OpenAIProviderFactory> {
  const preferredEndpoint = getPreferredGatewayEndpointConfig();
  const module = await import(/* @vite-ignore */ '@ai-sdk/openai');

  if (!isOpenAIModule(module)) {
    throw new Error('Invalid @ai-sdk/openai module');
  }

  return module.createOpenAI({
    apiKey: preferredEndpoint?.apiKey || import.meta.env.VITE_OPENAI_API_KEY || '',
    baseURL: preferredEndpoint?.baseURL || import.meta.env.VITE_OPENAI_BASE_URL,
  });
}

/**
 * Agent 清单定义
 * 用于 UI 展示和权限管理
 */
export interface AgentManifest {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  model: string;
  category: 'builtin' | 'extension';
  permissions: AgentPermission[];
  handoffTargets?: string[]; // 可移交的目标 Agent ID
  ui?: {
    icon: string;
    color: string;
  };
}

/**
 * Agent 权限类型
 */
export type AgentPermission =
  | 'candidate:read'
  | 'candidate:write'
  | 'candidate:create'
  | 'candidate:delete'
  | 'interview:read'
  | 'interview:write'
  | 'interview:create'
  | 'resume:read'
  | 'resume:parse'
  | 'system:read'
  | 'system:settings'
  | 'system:extensions';

/**
 * Agent 工具定义
 */
export interface AgentTool {
  description: string;
  inputSchema: ZodSchema<Record<string, unknown>>;
  execute: (params: Record<string, unknown>, context: unknown) => Promise<unknown>;
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  systemPrompt: string;
  tools?: Record<string, AgentTool>;
  maxSteps?: number;
}

/**
 * Agent 工厂函数类型
 */
export type AgentFactory = () => AgentConfig;

/**
 * IMS 业务上下文
 * 
 * 这个接口定义了 Agent 可以访问的所有 IMS 业务状态
 * 通过 Context Bridge 自动从 Pinia Store 同步
 */
export interface IMSContext {
  currentConversationId?: string;

  /**
   * 当前选中的候选人
   */
  currentCandidate?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    resumeData: {
      rawText: string;
      parsedData?: Record<string, unknown>;
      fileUrl?: string;
    };
    status: 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };

  /**
   * 当前视图状态
   */
  view: {
    /** 当前路由路径 */
    route: string;
    /** 列表页选中的候选人 ID */
    selectedCandidateIds: string[];
    /** 当前筛选条件 */
    filters: {
      status?: string[];
      tags?: string[];
      dateRange?: [Date, Date];
      searchQuery?: string;
    };
    /** 排序配置 */
    sortBy?: {
      field: string;
      order: 'asc' | 'desc';
    };
  };

  /**
   * 当前用户
   */
  currentUser: {
    id: string;
    name: string;
    role: 'admin' | 'recruiter' | 'interviewer';
    preferences: {
      language: 'zh' | 'en';
      timezone: string;
      defaultModel: string;
    };
  };

  /**
   * 面试相关信息
   */
  interviewContext?: {
    currentInterviewId?: string;
    scheduledInterviews: Array<{
      id: string;
      candidateId: string;
      interviewerId: string;
      scheduledAt: string;
      status: 'scheduled' | 'completed' | 'cancelled';
    }>;
  };
}

/**
 * Swarm Chunk 类型
 */
export interface SwarmChunk {
  type: 'text' | 'tool-call' | 'tool-result' | 'handoff';
  content: unknown;
  activeAgentId?: string;
}

/**
 * AgentHost - 单例模式
 * 
 * 使用示例:
 * ```ts
 * agentHost.register(resumeAnalyzerManifest, createResumeAnalyzerAgent);
 * const stream = agentHost.stream('resume-analyzer', '分析这份简历', context);
 * ```
 */
export class AgentHost {
  private configs = new Map<string, AgentConfig>();
  private manifests = new Map<string, AgentManifest>();
  private factories = new Map<string, AgentFactory>();

  private buildTools(configTools: Record<string, AgentTool> | undefined, context: IMSContext) {
    const mergedTools = {
      ...fileTools,
      ...(configTools ?? {}),
    };

    return Object.fromEntries(
      Object.entries(mergedTools).map(([name, toolDef]) => [
        name,
        tool({
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
          execute: async (params: Record<string, unknown>) => {
            return toolDef.execute(params, context);
          },
        })
      ])
    );
  }

  /**
   * 注册 Agent
   * @param manifest - Agent 元数据
   * @param factory - Agent 工厂函数(延迟实例化)
   */
  register(manifest: AgentManifest, factory: AgentFactory): void {
    this.manifests.set(manifest.id, manifest);
    this.factories.set(manifest.id, factory);
    // 延迟实例化:第一次使用时才创建
  }

  /**
   * 获取 Agent 配置(按需实例化)
   */
  private getConfig(id: string): AgentConfig | undefined {
    if (!this.configs.has(id) && this.factories.has(id)) {
      const factory = this.factories.get(id)!;
      this.configs.set(id, factory());
    }
    return this.configs.get(id);
  }

  /**
   * 获取 Agent 清单(用于 UI 展示)
   */
  getManifest(id: string): AgentManifest | undefined {
    return this.manifests.get(id);
  }

  /**
   * 列出所有已注册的 Agent
   */
  list(): AgentManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * 按类别列出 Agent
   */
  listByCategory(category: 'builtin' | 'extension'): AgentManifest[] {
    return this.list().filter(m => m.category === category);
  }

  /**
   * 流式执行 Agent
   * 
   * @param agentId - Agent ID
   * @param message - 用户消息
   * @param context - IMS 业务上下文
   * @returns AsyncIterable<string> 流式响应
   */
  async *stream(
    agentId: string,
    message: string,
    context: IMSContext
  ): AsyncGenerator<string, void, unknown> {
    const config = this.getConfig(agentId);
    const manifest = this.getManifest(agentId);

    if (!config || !manifest) {
      throw new AgentNotFoundError(agentId);
    }

    // 创建 OpenAI 客户端
    const openai = await createModelProvider();

    const model = openai(manifest.model);

    // 转换工具定义
    const tools = this.buildTools(config.tools, context);

    // 流式生成
    const result = streamText({
      model,
      system: config.systemPrompt,
      prompt: message,
      tools,
      stopWhen: config.maxSteps ? stepCountIs(config.maxSteps) : undefined,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  /**
   * 非流式执行 Agent
   * 适用于后台任务或需要完整结果的场景
   */
  async generate(
    agentId: string,
    message: string,
    context: IMSContext
  ): Promise<string> {
    const config = this.getConfig(agentId);
    const manifest = this.getManifest(agentId);

    if (!config || !manifest) {
      throw new AgentNotFoundError(agentId);
    }

    // 创建 OpenAI 客户端
    const openai = await createModelProvider();

    const model = openai(manifest.model);

    // 转换工具定义
    const tools = this.buildTools(config.tools, context);

    // 非流式生成
    const result = await generateText({
      model,
      system: config.systemPrompt,
      prompt: message,
      tools,
      stopWhen: config.maxSteps ? stepCountIs(config.maxSteps) : undefined,
    });

    return result.text;
  }

  /**
   * 卸载 Agent(释放资源)
   */
  unload(id: string): void {
    this.configs.delete(id);
    this.factories.delete(id);
    this.manifests.delete(id);
  }

  /**
   * 清空所有 Agent
   */
  clear(): void {
    this.configs.clear();
    this.factories.clear();
    this.manifests.clear();
  }
}

// 单例导出
export const agentHost = new AgentHost();

/**
 * Agent 未找到错误
 */
export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent "${agentId}" not found. Did you forget to forget to register it?`);
    this.name = 'AgentNotFoundError';
  }
}
