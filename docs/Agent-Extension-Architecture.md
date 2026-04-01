# IMS Agent 扩展架构设计方案

> **文档版本**: 1.0  
> **日期**: 2026-04-01  
> **状态**: 设计稿  
> **目标读者**: 前端架构师、全栈工程师

---

## 1. 背景与目标

### 1.1 背景

IMS（Interview Manager System）当前已具备基础的 LUI（Language User Interface）AI 对话能力，通过 LUI AI Gateway 与 Vercel AI SDK 集成。随着业务复杂度提升，单一 AI 对话模式已无法满足以下需求：

- **专业化分工**: 简历解析、面试评估、薪资建议等不同场景需要不同专业能力的 Agent
- **多步骤协作**: 复杂任务（如"为这位候选人安排面试并生成评估报告"）需要多个 Agent 协同
- **第三方扩展**: 未来需要支持社区或第三方开发的 Agent 插件

### 1.2 设计目标

| 目标 | 说明 | 优先级 |
|------|------|--------|
| **多 Agent 协作** | 支持多个 Agent 之间任务移交（Handoff）和协作 | P0 |
| **业务状态桥接** | Agent 能读写 IMS 业务状态（候选人、面试等） | P0 |
| **流式响应** | 保持与现有 LUI 组件一致的流式对话体验 | P0 |
| **扩展性** | 支持第三方 Agent 插件，具备权限隔离 | P1 |
| **类型安全** | 全链路 TypeScript 类型支持 | P0 |

### 1.3 技术选型

**核心依赖**: `@deepagents/agent`

- **为什么选择 DeepAgents**:
  - 基于 Vercel AI SDK，与现有 LUI Gateway 技术栈一致
  - 内置 Agent 定义、Handoff 移交、Swarm 多 Agent 编排
  - TypeScript 原生支持，类型安全
  - 轻量级，无后端依赖，纯前端可运行

**对比其他方案**:

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 自研 Agent 框架 | 完全可控 | 开发成本高，维护负担重 | ❌ 不采用 |
| LangGraph.js | 功能强大 | 复杂度高，学习曲线陡峭 | ❌ 过重 |
| **DeepAgents** | 轻量、与现有栈兼容 | 社区较新 | ✅ **采用** |
| AutoGen | 微软背书 | 主要针对 Python，JS 支持弱 | ❌ 不适用 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Interface Layer                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   Chat View      │  │  Agent Selector  │  │   Handoff Visualizer     │  │
│  │   (LUI)          │  │   (Dropdown)     │  │   (Transfer Indicator)   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
└───────────┼─────────────────────┼─────────────────────────┼────────────────┘
            │                     │                         │
            └─────────────────────┼─────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Agent Orchestration Layer                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AgentHost (单例)                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │   │
│  │  │  Registry    │  │   Executor   │  │    Swarm Manager         │  │   │
│  │  │  (Agent Map) │  │ (stream/     │  │ (Multi-Agent Handoff)    │  │   │
│  │  │              │  │  generate)   │  │                          │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐
│  Built-in       │  │  Built-in       │  │  Extension Agents               │
│  Agents         │  │  Agents         │  │  (Dynamic Load)                 │
│                 │  │                 │  │                                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ ┌─────────────┐ │
│ │Resume       │ │  │ │Interview    │ │  │ │Custom       │ │Community    │ │
│ │Analyzer     │ │  │ │Coordinator  │ │  │ │Agent A      │ │Agent B       │ │
│ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ └─────────────┘ │
└─────────────────┘  └─────────────────┘  └─────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Context & State Bridge Layer                        │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌──────────────┐  │
│  │   IMS Context          │  │   Tool Context         │  │   Permissions │  │
│  │   (Pinia Store →       │  │   (toState() →         │  │   (ACL Check) │  │
│  │    Agent Context)      │  │    IMS Business        │  │               │  │
│  │                        │  │    State)              │  │               │  │
│  └────────────────────────┘  └────────────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Vercel AI SDK (LUI Gateway)                         │
│                    streamText / generateText / tool()                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 分层职责

| 层级 | 职责 | 核心模块 |
|------|------|----------|
| **UI Layer** | 渲染对话界面、Agent选择器、移交指示器 | `AgentChat.vue`, `AgentSelector.vue` |
| **Orchestration Layer** | Agent注册、发现、执行、多Agent编排 | `AgentHost`, `SwarmManager` |
| **Agent Layer** | 各Agent的定义、工具、Prompt | `builtin/*`, `extensions/*` |
| **Context Bridge Layer** | IMS业务状态与Agent上下文的映射 | `ContextBridge`, `ToolContext` |
| **AI SDK Layer** | 模型调用、流式处理、工具执行 | `useChat()`, `streamText()` |

---

## 3. 核心组件设计

### 3.1 AgentHost - Agent注册管理中心

**文件位置**: `apps/web/src/agents/host.ts`

**职责**:
- Agent 注册与发现
- 统一执行入口（流式/非流式）
- Swarm 多 Agent 编排
- Manifest 管理（用于 UI 展示）

```typescript
import { agent, execute, swarm, type Agent } from '@deepagents/agent';
import type { LanguageModel } from 'ai';

/**
 * Agent 清单定义
 * 用于 UI 展示和权限管理
 */
interface AgentManifest {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  model: LanguageModel;
  category: 'builtin' | 'extension';
  permissions: AgentPermission[];
  handoffTargets?: string[]; // 可移交的目标 Agent ID
  ui?: {
    icon: string;
    color: string;
  };
}

type AgentPermission = 
  | 'candidate:read' 
  | 'candidate:write' 
  | 'interview:read' 
  | 'interview:write'
  | 'resume:read'
  | 'system:read';

/**
 * Agent 工厂函数类型
 */
type AgentFactory = () => Agent;

/**
 * AgentHost - 单例模式
 * 
 * 使用示例:
 * ```ts
 * agentHost.register(resumeAnalyzerManifest, createResumeAnalyzerAgent);
 * const stream = agentHost.stream('resume-analyzer', '分析这份简历', context);
 * ```
 */
class AgentHost {
  private agents = new Map<string, Agent>();
  private manifests = new Map<string, AgentManifest>();
  private factories = new Map<string, AgentFactory>();
  
  /**
   * 注册 Agent
   * @param manifest - Agent 元数据
   * @param factory - Agent 工厂函数（延迟实例化）
   */
  register(manifest: AgentManifest, factory: AgentFactory): void {
    this.manifests.set(manifest.id, manifest);
    this.factories.set(manifest.id, factory);
    // 延迟实例化：第一次使用时才创建
  }
  
  /**
   * 获取 Agent 实例（按需实例化）
   */
  get(id: string): Agent | undefined {
    if (!this.agents.has(id) && this.factories.has(id)) {
      const factory = this.factories.get(id)!;
      this.agents.set(id, factory());
    }
    return this.agents.get(id);
  }
  
  /**
   * 获取 Agent 清单（用于 UI 展示）
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
    const targetAgent = this.get(agentId);
    if (!targetAgent) {
      throw new AgentNotFoundError(agentId);
    }
    
    const result = execute(targetAgent, message, context);
    
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
    const targetAgent = this.get(agentId);
    if (!targetAgent) {
      throw new AgentNotFoundError(agentId);
    }
    
    const result = await generate(targetAgent, message, context);
    return result.text;
  }
  
  /**
   * Swarm 多 Agent 协作
   * 
   * DeepAgents 的 swarm 会自动处理 Agent 之间的 Handoff
   * 无需手动管理移交逻辑
   * 
   * @param entryAgentId - 入口 Agent ID
   * @param message - 初始消息
   * @param context - IMS 业务上下文
   */
  async *swarm(
    entryAgentId: string,
    message: string,
    context: IMSContext
  ): AsyncGenerator<SwarmChunk, void, unknown> {
    const entryAgent = this.get(entryAgentId);
    if (!entryAgent) {
      throw new AgentNotFoundError(entryAgentId);
    }
    
    const result = swarm(entryAgent, message, context);
    
    // Swarm 会返回元数据，包括当前活跃的 Agent
    for await (const chunk of result.fullStream) {
      yield {
        type: chunk.type,
        content: chunk.type === 'text' ? chunk.text : chunk,
        activeAgent: await result.agent, // 当前正在执行的 Agent
      };
    }
  }
  
  /**
   * 卸载 Agent（释放资源）
   */
  unload(id: string): void {
    this.agents.delete(id);
  }
  
  /**
   * 清空所有 Agent
   */
  clear(): void {
    this.agents.clear();
    this.factories.clear();
    this.manifests.clear();
  }
}

// 单例导出
export const agentHost = new AgentHost();

// 错误定义
class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent "${agentId}" not found. Did you forget to register it?`);
    this.name = 'AgentNotFoundError';
  }
}

interface SwarmChunk {
  type: 'text' | 'tool-call' | 'tool-result' | 'handoff';
  content: unknown;
  activeAgent: Agent;
}
```

### 3.2 IMS Context Bridge - 业务状态桥接

**文件位置**: `apps/web/src/agents/context-bridge.ts`

**职责**:
- 定义 IMS 业务上下文类型
- 提供工具中访问 IMS 状态的辅助函数
- Vue Composable 用于响应式上下文同步

```typescript
import { toState } from '@deepagents/agent';
import type { ToolCallOptions } from 'ai';

/**
 * IMS 业务上下文
 * 
 * 这个接口定义了 Agent 可以访问的所有 IMS 业务状态
 * 通过 Context Bridge 自动从 Pinia Store 同步
 */
interface IMSContext {
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
 * 在工具函数中获取 IMS 上下文
 * 
 * 使用示例:
 * ```ts
 * const getResumeTool = tool({
 *   description: '获取当前候选人的简历',
 *   parameters: z.object({}),
 *   execute: async (_, options) => {
 *     const ctx = getIMSContext(options);
 *     return ctx.currentCandidate?.resumeData || null;
 *   },
 * });
 * ```
 */
export function getIMSContext(options: ToolCallOptions): IMSContext {
  return toState<IMSContext>(options);
}

/**
 * Vue Composable - 将 Pinia 状态转换为 Agent 上下文
 * 
 * 在 Vue 组件中使用，会自动保持响应式同步
 * 
 * 使用示例:
 * ```vue
 * <script setup>
 * const agentContext = useAgentContext();
 * 
 * // agentContext 是 ComputedRef<IMSContext>
 * // 当 Pinia store 更新时，会自动触发 Agent 上下文更新
 * </script>
 * ```
 */
export function useAgentContext() {
  const candidateStore = useCandidateStore();
  const viewStore = useViewStore();
  const userStore = useUserStore();
  const interviewStore = useInterviewStore();
  
  return computed<IMSContext>(() => ({
    currentCandidate: candidateStore.current ? {
      id: candidateStore.current.id,
      name: candidateStore.current.name,
      email: candidateStore.current.email,
      phone: candidateStore.current.phone,
      resumeData: candidateStore.current.resumeData,
      status: candidateStore.current.status,
      tags: candidateStore.current.tags,
      createdAt: candidateStore.current.createdAt,
      updatedAt: candidateStore.current.updatedAt,
    } : undefined,
    
    view: {
      route: viewStore.currentRoute,
      selectedCandidateIds: viewStore.selectedIds,
      filters: viewStore.filters,
      sortBy: viewStore.sortBy,
    },
    
    currentUser: {
      id: userStore.id,
      name: userStore.name,
      role: userStore.role,
      preferences: userStore.preferences,
    },
    
    interviewContext: interviewStore.currentInterviewId ? {
      currentInterviewId: interviewStore.currentInterviewId,
      scheduledInterviews: interviewStore.scheduled,
    } : undefined,
  }));
}

/**
 * 创建静态上下文（用于非 Vue 环境或测试）
 */
export function createStaticContext(partial: Partial<IMSContext> = {}): IMSContext {
  return {
    view: {
      route: '/',
      selectedCandidateIds: [],
      filters: {},
    },
    currentUser: {
      id: 'anonymous',
      name: 'Anonymous',
      role: 'recruiter',
      preferences: {
        language: 'zh',
        timezone: 'Asia/Shanghai',
        defaultModel: 'gpt-4o',
      },
    },
    ...partial,
  };
}
```

### 3.3 Agent 定义规范

**文件位置**: `apps/web/src/agents/builtin/*.ts`

**职责**:
- 每个 Agent 独立文件定义
- 包含 Manifest、Factory、Tools
- 遵循统一的命名和结构规范

```typescript
/**
 * Agent 文件模板
 * 
 * 每个 Agent 文件应包含：
 * 1. Manifest 定义（元数据）
 * 2. Factory 函数（创建 Agent 实例）
 * 3. Tools 定义（工具函数）
 * 4. 注册逻辑（文件末尾自动注册）
 */

// ==================== 1. Manifest ====================

import type { AgentManifest } from '../host';

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
  model: openai('gpt-4o'), // 默认模型，可被覆盖
  category: 'builtin',
  permissions: ['candidate:read', 'resume:read'],
  handoffTargets: ['interview-coordinator', 'salary-advisor'],
  ui: {
    icon: 'file-text',
    color: '#3b82f6',
  },
};

// ==================== 2. Factory ====================

import { agent, instructions } from '@deepagents/agent';
import { openai } from '@ai-sdk/openai';
import { agentHost } from '../host';

export function createResumeAnalyzerAgent() {
  return agent({
    name: resumeAnalyzerManifest.id,
    model: resumeAnalyzerManifest.model,
    
    // 使用 instructions 创建结构化 Prompt
    prompt: instructions({
      purpose: [
        '你是一个专业的简历分析助手',
        '擅长从简历中提取关键信息并给出专业评估',
      ],
      routine: [
        '读取候选人简历内容',
        '提取关键技能（技术栈、软技能）',
        '分析工作经历（公司背景、项目经验、职责范围）',
        '评估教育背景与岗位的匹配度',
        '生成结构化的分析报告',
        '给出面试建议和关注点',
      ],
    }),
    
    // 工具定义
    tools: {
      getResume: getResumeTool,
      saveAnalysis: saveAnalysisTool,
      searchJobRequirements: searchJobRequirementsTool,
    },
    
    // 可移交的 Agent（用于 Swarm 模式）
    handoffs: [], // 在注册时动态绑定
  });
}

// ==================== 3. Tools ====================

import { tool } from 'ai';
import { z } from 'zod';
import { getIMSContext } from '../context-bridge';
import { api } from '@/lib/api';

/**
 * 工具：获取当前候选人的简历
 */
const getResumeTool = tool({
  description: '获取当前正在查看的候选人的简历数据',
  parameters: z.object({
    includeParsed: z.boolean().optional().describe('是否包含解析后的结构化数据'),
  }),
  execute: async ({ includeParsed }, options) => {
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
        rawText: candidate.resumeData.rawText,
        parsedData: includeParsed ? candidate.resumeData.parsedData : undefined,
      },
    };
  },
});

/**
 * 工具：保存分析结果到候选人档案
 */
const saveAnalysisTool = tool({
  description: '将简历分析结果保存到候选人档案中',
  parameters: z.object({
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
  execute: async (data, options) => {
    const ctx = getIMSContext(options);
    const candidateId = ctx.currentCandidate?.id;
    
    if (!candidateId) {
      return { success: false, error: '没有选中的候选人' };
    }
    
    try {
      await api.candidates.updateAnalysis(candidateId, {
        ...data,
        analyzedAt: new Date().toISOString(),
        analyzedBy: ctx.currentUser.id,
      });
      return { success: true, message: '分析结果已保存' };
    } catch (error) {
      return { 
        success: false, 
        error: `保存失败: ${error instanceof Error ? error.message : '未知错误'}` 
      };
    }
  },
});

/**
 * 工具：查询岗位要求（用于匹配度评估）
 */
const searchJobRequirementsTool = tool({
  description: '查询当前招聘的岗位要求',
  parameters: z.object({
    jobTitle: z.string().optional().describe('职位名称，不传则返回所有在招职位'),
  }),
  execute: async ({ jobTitle }) => {
    try {
      const jobs = await api.jobs.list({ active: true, title: jobTitle });
      return {
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          title: job.title,
          department: job.department,
          requirements: job.requirements,
          requiredSkills: job.requiredSkills,
          minExperience: job.minExperience,
        })),
      };
    } catch (error) {
      return { success: false, error: '查询岗位信息失败' };
    }
  },
});

// ==================== 4. 注册 ====================

// 文件导入时自动注册
agentHost.register(resumeAnalyzerManifest, createResumeAnalyzerAgent);
```

### 3.4 Swarm 多 Agent 协作示例

**文件位置**: `apps/web/src/agents/builtin/interview-coordinator.ts`

```typescript
/**
 * 面试协调员 Agent
 * 
 * 这是一个典型的 Swarm 协调者 Agent，负责任务分解和分配
 * 它会根据任务类型将工作移交给不同的专业 Agent
 */

import { agent, instructions } from '@deepagents/agent';
import { openai } from '@ai-sdk/openai';
import { agentHost } from '../host';

// 子 Agent：技术面试官
const techInterviewer = agent({
  name: 'tech-interviewer',
  model: openai('gpt-4o'),
  prompt: instructions({
    purpose: ['你是一位资深技术面试官', '负责深入评估候选人的技术能力'],
    routine: [
      '根据简历中的技术栈设计针对性问题',
      '深入考察候选人的技术深度和广度',
      '评估解决问题的能力和思维方式',
      '给出客观的技术能力评分（1-10分）',
      '列出需要进一步验证的技术点',
    ],
  }),
  handoffDescription: '当需要评估候选人技术能力时使用',
});

// 子 Agent：HR 面试官
const hrInterviewer = agent({
  name: 'hr-interviewer',
  model: openai('gpt-4o'),
  prompt: instructions({
    purpose: ['你是一位资深 HR 面试官', '负责评估候选人的软技能和文化契合度'],
    routine: [
      '了解候选人的职业规划和发展期望',
      '评估沟通能力和团队协作能力',
      '考察文化契合度和价值观匹配',
      '讨论薪资期望和到岗时间',
      '给出综合的软技能评估',
    ],
  }),
  handoffDescription: '当需要评估软技能、文化契合度或讨论薪资时使用',
});

// 子 Agent：薪资顾问
const salaryAdvisor = agent({
  name: 'salary-advisor',
  model: openai('gpt-4o'),
  prompt: instructions({
    purpose: ['你是一位薪资顾问', '负责提供薪资建议和市场分析'],
    routine: [
      '分析候选人的经验、技能和市场价值',
      '查询同行业同岗位的薪资水平',
      '结合公司预算给出薪资建议范围',
      '提供有竞争力的 offer 方案',
    ],
  }),
  handoffDescription: '当需要薪资建议或 offer 方案时使用',
});

// 协调者 Agent
export const interviewCoordinatorManifest = {
  id: 'interview-coordinator',
  name: '面试协调员',
  description: '统筹面试全流程，协调各专业面试官，生成综合评估报告',
  capabilities: [
    'interview-orchestration',
    'multi-dimensional-eval',
    'report-generation',
    'decision-support',
  ],
  model: openai('gpt-4o'),
  category: 'builtin',
  permissions: ['candidate:read', 'candidate:write', 'interview:read', 'interview:write'],
};

export function createInterviewCoordinatorAgent() {
  return agent({
    name: interviewCoordinatorManifest.id,
    model: interviewCoordinatorManifest.model,
    prompt: instructions({
      purpose: [
        '你是面试流程的总协调员',
        '负责统筹多维度面试评估，确保全面、客观地评价候选人',
      ],
      routine: [
        '分析候选人简历和岗位要求',
        '判断需要评估的维度和重点',
        '协调技术面试官进行技术评估',
        '协调 HR 面试官进行软技能评估',
        '如有需要，协调薪资顾问提供 offer 建议',
        '汇总各维度评估结果',
        '生成综合面试报告和录用建议',
      ],
    }),
    // 定义可移交的子 Agent
    handoffs: [techInterviewer, hrInterviewer, salaryAdvisor],
  });
}

agentHost.register(interviewCoordinatorManifest, createInterviewCoordinatorAgent);
```

---

## 4. 与现有系统集成

### 4.1 与 LUI 组件集成

**文件位置**: `apps/web/src/components/lui/AgentChat.vue`

```vue
<template>
  <div class="agent-chat">
    <!-- Agent 选择器 -->
    <div class="agent-toolbar">
      <AgentSelector
        v-model="currentAgentId"
        :agents="availableAgents"
        :disabled="isStreaming"
      />
      
      <LuiToggle
        v-model="isSwarmMode"
        label="多 Agent 协作"
        :disabled="isStreaming"
        tooltip="启用后，Agent 可根据任务需要自动移交给其他专业 Agent"
      />
      
      <ActiveAgentIndicator
        v-if="activeSwarmAgent"
        :agent="activeSwarmAgent"
      />
    </div>
    
    <!-- 消息列表 -->
    <LuiMessageList
      :messages="messages"
      :streaming-content="streamingContent"
      :is-streaming="isStreaming"
    >
      <!-- Handoff 指示器 -->
      <template #message-before="{ message }">
        <HandoffBanner
          v-if="message.handoffInfo"
          :from="message.handoffInfo.from"
          :to="message.handoffInfo.to"
          :reason="message.handoffInfo.reason"
        />
      </template>
    </LuiMessageList>
    
    <!-- 输入框 -->
    <LuiInput
      v-model="inputMessage"
      :disabled="isStreaming"
      :placeholder="inputPlaceholder"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { agentHost } from '@/agents/host';
import { useAgentContext } from '@/agents/context-bridge';
import type { AgentManifest } from '@/agents/host';

// ==================== State ====================

const messages = ref<Array<{
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  handoffInfo?: {
    from: string;
    to: string;
    reason: string;
  };
}>>([]);

const inputMessage = ref('');
const streamingContent = ref('');
const isStreaming = ref(false);
const currentAgentId = ref('resume-analyzer');
const isSwarmMode = ref(false);
const activeSwarmAgent = ref<AgentManifest | null>(null);

// 用于中断流式响应
const abortController = ref<AbortController | null>(null);

// ==================== Computed ====================

const availableAgents = computed(() => agentHost.list());

const currentAgent = computed(() => 
  agentHost.getManifest(currentAgentId.value)
);

const inputPlaceholder = computed(() => {
  if (currentAgent.value) {
    return `给 ${currentAgent.value.name} 发送消息...`;
  }
  return '输入消息...';
});

// ==================== Context ====================

// 自动同步 IMS 状态到 Agent 上下文
const agentContext = useAgentContext();

// ==================== Methods ====================

async function handleSend() {
  if (!inputMessage.value.trim() || isStreaming.value) return;
  
  const userMessage = inputMessage.value;
  inputMessage.value = '';
  
  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: userMessage,
  });
  
  // 开始流式响应
  isStreaming.value = true;
  streamingContent.value = '';
  abortController.value = new AbortController();
  
  try {
    if (isSwarmMode.value) {
      await runSwarm(userMessage);
    } else {
      await runSingleAgent(userMessage);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // 用户主动中断
      messages.value.push({
        role: 'assistant',
        content: streamingContent.value + '\n\n[已中断]',
        agentId: currentAgentId.value,
      });
    } else {
      messages.value.push({
        role: 'system',
        content: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
      });
    }
  } finally {
    isStreaming.value = false;
    streamingContent.value = '';
    abortController.value = null;
    activeSwarmAgent.value = null;
  }
}

async function runSingleAgent(message: string) {
  const stream = agentHost.stream(
    currentAgentId.value,
    message,
    agentContext.value
  );
  
  for await (const chunk of stream) {
    if (abortController.value?.signal.aborted) {
      throw new Error('AbortError');
    }
    streamingContent.value += chunk;
  }
  
  // 完成，保存消息
  messages.value.push({
    role: 'assistant',
    content: streamingContent.value,
    agentId: currentAgentId.value,
  });
}

async function runSwarm(message: string) {
  const stream = agentHost.swarm(
    currentAgentId.value,
    message,
    agentContext.value
  );
  
  let currentAgentName = currentAgentId.value;
  
  for await (const chunk of stream) {
    if (abortController.value?.signal.aborted) {
      throw new Error('AbortError');
    }
    
    // 更新当前活跃的 Agent（用于 UI 展示）
    if (chunk.activeAgent) {
      const manifest = agentHost.list().find(
        a => a.id === chunk.activeAgent.name
      );
      if (manifest && manifest.id !== currentAgentName) {
        // 记录 Handoff
        messages.value.push({
          role: 'assistant',
          content: streamingContent.value,
          agentId: currentAgentName,
        });
        streamingContent.value = '';
        
        messages.value.push({
          role: 'system',
          content: '',
          handoffInfo: {
            from: currentAgentName,
            to: manifest.id,
            reason: '任务移交',
          },
        });
        
        currentAgentName = manifest.id;
      }
      activeSwarmAgent.value = manifest || null;
    }
    
    if (chunk.type === 'text' && typeof chunk.content === 'string') {
      streamingContent.value += chunk.content;
    }
  }
  
  // 保存最后一段消息
  messages.value.push({
    role: 'assistant',
    content: streamingContent.value,
    agentId: currentAgentName,
  });
}

function handleStop() {
  abortController.value?.abort();
}

// ==================== 监听候选人变化 ====================

// 当切换候选人时，自动添加系统上下文
watch(() => agentContext.value.currentCandidate, (candidate) => {
  if (candidate && messages.value.length > 0) {
    messages.value.push({
      role: 'system',
      content: `已切换到候选人: ${candidate.name}`,
    });
  }
}, { immediate: true });
</script>
```

### 4.2 与 Pinia Store 集成

```typescript
// apps/web/src/stores/agent.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { agentHost } from '@/agents/host';
import type { AgentManifest } from '@/agents/host';

/**
 * Agent Store
 * 
 * 管理 Agent 相关的 UI 状态
 * 实际 Agent 实例由 AgentHost 管理
 */
export const useAgentStore = defineStore('agent', () => {
  // ==================== State ====================
  
  /** 当前选中的 Agent ID */
  const currentAgentId = ref<string>('resume-analyzer');
  
  /** 是否启用 Swarm 模式 */
  const isSwarmMode = ref(false);
  
  /** 最近使用的 Agent ID 列表（用于快捷选择） */
  const recentAgents = ref<string[]>([]);
  
  /** 用户收藏的 Agent */
  const favoriteAgents = ref<string[]>([]);
  
  // ==================== Getters ====================
  
  /** 所有可用 Agent */
  const allAgents = computed(() => agentHost.list());
  
  /** 当前 Agent 配置 */
  const currentAgent = computed(() => 
    agentHost.getManifest(currentAgentId.value)
  );
  
  /** 内置 Agent */
  const builtinAgents = computed(() => 
    agentHost.listByCategory('builtin')
  );
  
  /** 扩展 Agent */
  const extensionAgents = computed(() => 
    agentHost.listByCategory('extension')
  );
  
  /** 最近使用的 Agent 详情 */
  const recentAgentDetails = computed(() => 
    recentAgents.value
      .map(id => agentHost.getManifest(id))
      .filter((m): m is AgentManifest => m !== undefined)
  );
  
  // ==================== Actions ====================
  
  function setCurrentAgent(id: string) {
    // 记录到最近使用
    if (currentAgentId.value !== id) {
      recentAgents.value = [
        id,
        ...recentAgents.value.filter(a => a !== id),
      ].slice(0, 5);
    }
    currentAgentId.value = id;
  }
  
  function toggleFavorite(id: string) {
    const index = favoriteAgents.value.indexOf(id);
    if (index === -1) {
      favoriteAgents.value.push(id);
    } else {
      favoriteAgents.value.splice(index, 1);
    }
  }
  
  function toggleSwarmMode() {
    isSwarmMode.value = !isSwarmMode.value;
  }
  
  return {
    // State
    currentAgentId,
    isSwarmMode,
    recentAgents,
    favoriteAgents,
    
    // Getters
    allAgents,
    currentAgent,
    builtinAgents,
    extensionAgents,
    recentAgentDetails,
    
    // Actions
    setCurrentAgent,
    toggleFavorite,
    toggleSwarmMode,
  };
});
```

---

## 5. 扩展机制设计

### 5.1 Agent 插件系统

**文件位置**: `apps/web/src/agents/extensions/loader.ts`

```typescript
/**
 * Agent 扩展加载器
 * 
 * 支持从以下来源加载第三方 Agent：
 * 1. 本地文件（开发调试）
 * 2. 远程 URL（ESM 模块）
 * 3. npm 包（已安装依赖）
 */

import { agentHost, type AgentManifest } from '../host';
import type { Agent } from '@deepagents/agent';

interface AgentExtension {
  manifest: AgentManifest;
  factory: () => Agent;
  
  // 可选的 UI 扩展
  ui?: {
    // 设置面板组件（动态导入）
    settingsComponent?: () => Promise<Component>;
    // 自定义消息渲染组件
    messageRenderer?: () => Promise<Component>;
  };
}

interface LoadOptions {
  /** 权限白名单，为空则使用 manifest 声明的权限 */
  allowedPermissions?: string[];
  
  /** 是否沙箱运行（iframe 隔离） */
  sandbox?: boolean;
  
  /** 超时时间 */
  timeout?: number;
}

class AgentExtensionLoader {
  private loadedExtensions = new Map<string, AgentExtension>();
  
  /**
   * 从远程 URL 加载 ESM 模块
   * 
   * 安全要求：
   * 1. 必须通过 HTTPS 加载
   * 2. 必须声明所需权限
   * 3. 可选沙箱隔离
   */
  async loadFromURL(url: string, options: LoadOptions = {}): Promise<AgentExtension> {
    // 安全检查
    if (!url.startsWith('https://')) {
      throw new Error('Agent extension must be loaded via HTTPS');
    }
    
    // 设置超时
    const timeout = options.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // 动态导入 ESM 模块
      const module = await import(/* @vite-ignore */ url);
      clearTimeout(timeoutId);
      
      const extension = module.default as AgentExtension;
      
      // 验证 manifest
      this.validateManifest(extension.manifest);
      
      // 验证权限
      this.validatePermissions(extension.manifest, options.allowedPermissions);
      
      // 标记为扩展类型
      extension.manifest.category = 'extension';
      
      // 注册到 AgentHost
      agentHost.register(extension.manifest, extension.factory);
      
      this.loadedExtensions.set(extension.manifest.id, extension);
      
      return extension;
    } catch (error) {
      clearTimeout(timeoutId);
      throw new Error(`Failed to load agent extension from ${url}: ${error}`);
    }
  }
  
  /**
   * 从本地文件加载（开发调试用）
   */
  async loadFromFile(file: File): Promise<AgentExtension> {
    const text = await file.text();
    
    // 创建 Blob URL
    const blob = new Blob([text], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    
    try {
      return await this.loadFromURL(url, { sandbox: true });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  
  /**
   * 卸载扩展
   */
  unload(extensionId: string): void {
    agentHost.unload(extensionId);
    this.loadedExtensions.delete(extensionId);
  }
  
  /**
   * 列出已加载的扩展
   */
  listLoaded(): AgentExtension[] {
    return Array.from(this.loadedExtensions.values());
  }
  
  // ==================== 私有方法 ====================
  
  private validateManifest(manifest: AgentManifest): void {
    const required = ['id', 'name', 'description', 'model'];
    for (const field of required) {
      if (!(field in manifest)) {
        throw new Error(`Agent manifest missing required field: ${field}`);
      }
    }
    
    // ID 格式校验
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error('Agent ID must be lowercase alphanumeric with hyphens only');
    }
    
    // 检查 ID 冲突
    if (agentHost.getManifest(manifest.id)) {
      throw new Error(`Agent with ID "${manifest.id}" already exists`);
    }
  }
  
  private validatePermissions(
    manifest: AgentManifest, 
    allowedPermissions?: string[]
  ): void {
    if (!allowedPermissions) {
      // 未指定白名单时，使用 manifest 声明的权限
      // 但仍需确保权限在系统允许的范围内
      const systemPermissions = [
        'candidate:read', 'candidate:write',
        'interview:read', 'interview:write',
        'resume:read', 'system:read',
      ];
      
      const invalid = manifest.permissions?.filter(
        p => !systemPermissions.includes(p)
      );
      
      if (invalid?.length) {
        throw new Error(`Invalid permissions: ${invalid.join(', ')}`);
      }
      
      return;
    }
    
    // 检查是否超出白名单
    const requested = manifest.permissions || [];
    const unauthorized = requested.filter(
      p => !allowedPermissions.includes(p)
    );
    
    if (unauthorized.length) {
      throw new Error(
        `Agent requests unauthorized permissions: ${unauthorized.join(', ')}`
      );
    }
  }
}

export const extensionLoader = new AgentExtensionLoader();
```

### 5.2 权限系统设计

```typescript
// apps/web/src/agents/permissions.ts

/**
 * Agent 权限系统
 * 
 * 实现基于 ACL（访问控制列表）的权限管理
 * 每个 Agent 必须声明所需权限，运行时进行校验
 */

import type { IMSContext } from './context-bridge';

export type AgentPermission =
  // 候选人相关
  | 'candidate:read'      // 读取候选人信息
  | 'candidate:write'     // 修改候选人信息
  | 'candidate:create'    // 创建候选人
  | 'candidate:delete'    // 删除候选人
  
  // 面试相关
  | 'interview:read'      // 读取面试安排
  | 'interview:write'     // 修改面试安排
  | 'interview:create'    // 创建面试
  
  // 简历相关
  | 'resume:read'         // 读取简历内容
  | 'resume:parse'        // 解析简历
  
  // 系统相关
  | 'system:read'         // 读取系统配置
  | 'system:settings'     // 修改系统设置
  | 'system:extensions';  // 加载扩展

/**
 * 权限校验器
 */
export class PermissionChecker {
  private grantedPermissions: Set<AgentPermission>;
  
  constructor(permissions: AgentPermission[]) {
    this.grantedPermissions = new Set(permissions);
  }
  
  /**
   * 检查是否拥有指定权限
   */
  has(permission: AgentPermission): boolean {
    return this.grantedPermissions.has(permission);
  }
  
  /**
   * 检查是否拥有所有指定权限
   */
  hasAll(permissions: AgentPermission[]): boolean {
    return permissions.every(p => this.grantedPermissions.has(p));
  }
  
  /**
   * 检查是否拥有任一指定权限
   */
  hasAny(permissions: AgentPermission[]): boolean {
    return permissions.some(p => this.grantedPermissions.has(p));
  }
  
  /**
   * 校验权限，无权限时抛出错误
   */
  check(permission: AgentPermission, operation: string): void {
    if (!this.has(permission)) {
      throw new PermissionDeniedError(permission, operation);
    }
  }
}

/**
 * 权限拒绝错误
 */
export class PermissionDeniedError extends Error {
  constructor(
    public readonly permission: AgentPermission,
    public readonly operation: string
  ) {
    super(
      `Permission denied: "${permission}" is required for "${operation}"`
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * 工具权限装饰器
 * 
 * 使用示例:
 * ```ts
 * const saveCandidateTool = withPermission(
 *   'candidate:write',
 *   tool({
 *     description: '保存候选人信息',
 *     parameters: z.object({...}),
 *     execute: async (params, options) => { ... }
 *   })
 * );
 * ```
 */
export function withPermission<P extends Record<string, unknown>, R>(
  permission: AgentPermission,
  toolConfig: {
    description: string;
    parameters: z.ZodSchema<P>;
    execute: (params: P, options: ToolCallOptions) => Promise<R>;
  }
) {
  return {
    ...toolConfig,
    execute: async (params: P, options: ToolCallOptions) => {
      // 从 context 获取权限检查器
      const ctx = options.state as IMSContext & { 
        _permissionChecker?: PermissionChecker 
      };
      
      const checker = ctx._permissionChecker;
      if (!checker) {
        throw new Error('Permission checker not initialized');
      }
      
      checker.check(permission, toolConfig.description);
      
      return toolConfig.execute(params, options);
    },
  };
}
```

---

## 6. 项目结构

```
apps/web/src/
├── agents/
│   ├── index.ts                 # 统一导出
│   ├── host.ts                  # AgentHost 单例
│   ├── context-bridge.ts        # IMS 上下文桥接
│   ├── permissions.ts           # 权限系统
│   ├── builtin/                 # 内置 Agent
│   │   ├── index.ts             # 自动导入所有内置 Agent
│   │   ├── resume-analyzer.ts   # 简历分析
│   │   ├── interview-coordinator.ts  # 面试协调
│   │   ├── salary-advisor.ts    # 薪资顾问
│   │   └── search-assistant.ts  # 搜索助手
│   └── extensions/              # 扩展 Agent
│       ├── loader.ts            # 扩展加载器
│       └── registry.ts          # 扩展注册表
├── components/
│   └── lui/
│       ├── AgentChat.vue        # Agent 对话主组件
│       ├── AgentSelector.vue    # Agent 选择器
│       ├── HandoffBanner.vue    # Handoff 指示器
│       └── ActiveAgentIndicator.vue  # 活跃 Agent 指示器
├── stores/
│   └── agent.ts                 # Agent Store (Pinia)
└── composables/
    └── useAgent.ts              # Agent 相关 Composables
```

---

## 7. 实施计划

### 7.1 阶段划分

#### Phase 1: 基础框架（1-2 周）

**目标**: 搭建 AgentHost 和 Context Bridge，实现第一个内置 Agent

**任务清单**:

- [ ] 安装依赖 `@deepagents/agent`, `@ai-sdk/openai`
- [ ] 实现 `AgentHost` 核心类
- [ ] 实现 `ContextBridge` 和 `useAgentContext`
- [ ] 实现 `ResumeAnalyzer` Agent（简历分析）
- [ ] 集成到 LUI 组件，实现流式对话

**验收标准**:
- 可以在 LUI 界面选择 ResumeAnalyzer Agent
- 能读取当前候选人简历并给出分析
- 流式响应正常，支持中断

#### Phase 2: 多 Agent 协作（1 周）

**目标**: 实现 Swarm 多 Agent 协作

**任务清单**:

- [ ] 实现 `InterviewCoordinator` Agent
- [ ] 实现 `TechInterviewer` 和 `HRInterviewer` 子 Agent
- [ ] 实现 Swarm 执行模式
- [ ] 添加 Handoff 可视化指示器

**验收标准**:
- 启用 Swarm 模式后，Agent 可自动移交任务
- Handoff 过程在 UI 上有明确指示
- 可以追踪当前活跃的是哪个 Agent

#### Phase 3: 扩展系统（1-2 周）

**目标**: 实现第三方 Agent 扩展能力

**任务清单**:

- [ ] 实现 `AgentExtensionLoader`
- [ ] 实现权限系统
- [ ] 实现扩展管理界面（加载/卸载/配置）
- [ ] 编写扩展开发文档和示例

**验收标准**:
- 可以从 URL 加载第三方 Agent 扩展
- 扩展权限被正确限制
- 扩展可以在 UI 中配置

#### Phase 4: 完善与优化（持续）

**任务清单**:

- [ ] 性能优化（Agent 懒加载、缓存）
- [ ] 错误处理增强
- [ ] 更多内置 Agent（搜索、报表、薪资等）
- [ ] Agent 市场/商店（可选）

### 7.2 依赖安装

```bash
# 核心依赖
pnpm add @deepagents/agent ai zod

# AI SDK 提供商（根据需求选择）
pnpm add @ai-sdk/openai
# pnpm add @ai-sdk/anthropic
# pnpm add @ai-sdk/google
```

### 7.3 关键配置

```typescript
// apps/web/vite.config.ts
export default defineConfig({
  // 支持动态导入第三方扩展
  optimizeDeps: {
    exclude: ['@deepagents/agent'],
  },
  
  // 如果加载远程扩展，需要配置 CSP
  server: {
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' https:",
        "connect-src 'self' https:",
      ].join('; '),
    },
  },
});
```

---

## 8. 风险与应对

| 风险 | 影响 | 可能性 | 应对策略 |
|------|------|--------|----------|
| DeepAgents 库不稳定 | 高 | 中 | 封装抽象层，便于替换实现 |
| 扩展安全性问题 | 高 | 中 | 强制 HTTPS、权限白名单、沙箱隔离 |
| 性能问题（大量 Agent） | 中 | 低 | 懒加载、缓存、Worker 隔离 |
| 类型安全维护成本 | 中 | 中 | 严格的 TS 配置、自动化类型检查 |

---

## 9. 参考资料

- [DeepAgents Documentation](https://docs.langchain.com/oss/javascript/deepagents)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

## 10. 附录

### 10.1 术语表

| 术语 | 说明 |
|------|------|
| Agent | 智能代理，具有特定能力的大模型应用 |
| Handoff | Agent 之间任务移交的机制 |
| Swarm | 多 Agent 协作模式 |
| Manifest | Agent 元数据声明 |
| Context Bridge | IMS 业务状态与 Agent 上下文的桥接层 |

### 10.2 快速开始

```typescript
// 1. 注册 Agent
import '@/agents/builtin/resume-analyzer';

// 2. 在组件中使用
const agentContext = useAgentContext();
const stream = agentHost.stream('resume-analyzer', '分析简历', agentContext.value);

// 3. 流式输出
for await (const chunk of stream) {
  console.log(chunk);
}
```
