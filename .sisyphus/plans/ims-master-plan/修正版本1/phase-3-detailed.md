# Phase 3: 多 Agent 架构重构 - 详细技术方案（修正版 v2）

> **目标**: 基于 DeepAgents 实现多 Agent 协作
> **工期**: 14 天（修正：使用现有 DeepAgents 架构）
> **关键交付物**: 专业 Agent 协作系统

---

## 0. 技术选型说明

### 0.1 架构决策依据

根据 `docs/Agent-Extension-Architecture.md`：

| 方案 | 结论 |
|------|------|
| 自研 Agent 框架 | ❌ 不采用 - 开发成本高 |
| LangGraph.js | ❌ 过重 - 复杂度高，学习曲线陡峭 |
| **DeepAgents** | ✅ **采用** - 轻量、与现有栈兼容、内置 Swarm |

**核心依赖**: `@deepagents/agent`

### 0.2 现有架构

根据 `apps/web/src/agents/host.ts`：

```typescript
// 现有 AgentHost 已支持
export class AgentHost {
  async *stream(agentId: string, message: string, context: IMSContext)
  async generate(agentId: string, message: string, context: IMSContext)
  register(manifest: AgentManifest, factory: AgentFactory)
}
```

---

## 1. DeepAgents 架构设计

### 1.1 目标架构

```
┌─────────────────────────────────────────┐
│         AgentHost (现有，扩展)           │
│  ┌─────────────────────────────────┐   │
│  │    Supervisor Layer (基于 Swarm)    │   │
│  │    - 意图分析                     │   │
│  │    - Agent 移交 (Handoff)         │   │
│  │    - 结果汇总                     │   │
│  └─────────────────────────────────┘   │
│                  │                     │
│  ┌───────────────┼───────────────┐     │
│  │               │               │     │
│  ▼               ▼               ▼     │
│ Agent-A      Agent-B       Agent-C      │
│ (Screening)  (Question)    (Assessment) │
└─────────────────────────────────────────┘
```

### 1.2 DeepAgents Swarm 模式

```typescript
// apps/web/src/agents/swarm-workflow.ts 新增

import { Agent, handoff, generateText } from '@deepagents/agent';
import { agentHost } from './host';
import type { IMSContext } from './host';

/**
 * Supervisor Agent 定义
 */
const supervisorAgent = new Agent({
  name: 'supervisor',
  description: '总调度员，理解用户意图并分配任务',
  system: `你是面试助手系统的总调度员。你的职责是：
1. 理解用户的意图和需求
2. 将任务分配给最合适的专业 Agent
3. 汇总各专业 Agent 的结果

可用 Agent：
- screening: 初筛专家，擅长简历解析
- question: 出题专家，擅长设计面试题
- assessment: 评估专家，擅长面试评分
- email: 邮件专家，擅长撰写邮件`,
  tools: {
    screening: handoff(screeningAgent),
    question: handoff(questionAgent),
    assessment: handoff(assessmentAgent),
    email: handoff(emailAgent),
  },
});

/**
 * 初筛专家 Agent
 */
const screeningAgent = new Agent({
  name: 'screening',
  description: '初筛专家',
  system: `你是专业的简历初筛专家。
分析简历，评估候选人与岗位的匹配度。`,
  tools: {
    readFile: async ({ fileId }) => {
      const { fileService } = await import('@/services/file-service');
      return fileService.readFile(fileId);
    },
  },
});

/**
 * 出题专家 Agent
 */
const questionAgent = new Agent({
  name: 'question',
  description: '出题专家',
  system: `你是专业的面试题目设计专家。
根据候选人和岗位设计面试题。`,
});

/**
 * 评估专家 Agent
 */
const assessmentAgent = new Agent({
  name: 'assessment',
  description: '评估专家',
  system: `你是专业的面试评估专家。
分析面试表现，生成评估报告。`,
});
```

### 1.3 Swarm 工作流实现

```typescript
// apps/web/src/agents/swarm-executor.ts 新增

import { swarm } from '@deepagents/agent';
import { supervisorAgent, screeningAgent, questionAgent, assessmentAgent } from './swarm-workflow';
import type { IMSContext } from './host';

/**
 * 多 Agent 协作工作流
 */
export async function runSwarmWorkflow(
  message: string,
  context: IMSContext,
  options?: {
    modelId?: string;
    temperature?: number;
  }
) {
  // 创建 Swarm 实例
  const swarmInstance = swarm(supervisorAgent, {
    agents: [screeningAgent, questionAgent, assessmentAgent],
  });

  // 执行工作流
  const result = await generateText({
    agent: swarmInstance,
    prompt: message,
    model: options?.modelId || 'gpt-4',
    temperature: options?.temperature || 0.7,
  });

  return {
    response: result.text,
    agent: result.agent?.name,
  };
}

/**
 * 流式执行
 */
export async function *streamSwarmWorkflow(
  message: string,
  context: IMSContext
): AsyncGenerator<string, void, unknown> {
  const result = await runSwarmWorkflow(message, context);
  
  // 模拟流式输出
  for (let i = 0; i < result.response.length; i += 5) {
    yield result.response.slice(i, i + 5);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
```

---

## 2. AgentHost 集成

### 2.1 扩展现有 AgentHost

```typescript
// apps/web/src/agents/host.ts 扩展

import { runSwarmWorkflow, streamSwarmWorkflow } from './swarm-executor';

export class AgentHost {
  // ... existing code

  /**
   * 多 Agent 流式执行（新增）
   */
  async *swarmStream(
    message: string,
    context: IMSContext
  ): AsyncGenerator<string, void, unknown> {
    const useSwarm = localStorage.getItem('ims_swarm_enabled') === 'true';

    if (!useSwarm) {
      // 回退到单 Agent
      yield* this.stream('interview-orchestrator', message, context);
      return;
    }

    yield* streamSwarmWorkflow(message, context);
  }

  /**
   * 多 Agent 非流式执行（新增）
   */
  async swarmGenerate(
    message: string,
    context: IMSContext
  ): Promise<string> {
    const useSwarm = localStorage.getItem('ims_swarm_enabled') === 'true';

    if (!useSwarm) {
      return this.generate('interview-orchestrator', message, context);
    }

    const result = await runSwarmWorkflow(message, context);
    return result.response;
  }
}
```

### 2.2 Worker Agent 注册

```typescript
// apps/web/src/agents/builtin/swarm-agents.ts 新增

import { Agent } from '@deepagents/agent';
import { agentHost } from '../host';

/**
 * 注册 Swarm Agents
 */
export function registerSwarmAgents(): void {
  // Screening Agent
  agentHost.register(
    {
      id: 'screening',
      name: '初筛专家',
      description: '擅长简历解析、技能匹配、初步评估',
      capabilities: ['resume-parsing', 'skill-matching', 'screening'],
      model: 'gpt-4',
      category: 'builtin',
      permissions: ['candidate:read', 'resume:read'],
    },
    () => ({
      systemPrompt: `你是专业的简历初筛专家��
分析简历，评估候选人与岗位的匹配度。
输出 JSON 格式：{ summary, match_score, recommendation }`,
      tools: {
        readFile: {
          description: '读取文件',
          inputSchema: z.object({ fileId: z.string() }),
          execute: async (params) => {
            const { fileService } = await import('@/services/file-service');
            return fileService.readFile(params.fileId);
          },
        },
      },
      maxSteps: 5,
    })
  );

  // Question Agent
  agentHost.register(
    {
      id: 'question',
      name: '出题专家',
      description: '擅长设计面试题目、评估题目难度',
      capabilities: ['question-design', 'difficulty-assessment'],
      model: 'gpt-4',
      category: 'builtin',
      permissions: ['candidate:read'],
    },
    () => ({
      systemPrompt: `你是专业的面试题目设计专家。
根据岗位要求和候选人背景设计面试题。
输出 JSON 格式：{ questions: [...] }`,
      maxSteps: 5,
    })
  );

  // Assessment Agent
  agentHost.register(
    {
      id: 'assessment',
      name: '评估专家',
      description: '擅长面试结果分析、综合评分、报告生成',
      capabilities: ['interview-analysis', 'scoring', 'report-generation'],
      model: 'gpt-4',
      category: 'builtin',
      permissions: ['candidate:read'],
    },
    () => ({
      systemPrompt: `你是专业的面试评估专家。
分析面试表现，生成评估报告。
输出 JSON 格式：{ scores, overall_score, recommendation }`,
      maxSteps: 5,
    })
  );
}
```

---

## 3. 迁移策略

### 3.1 Feature Flag

```typescript
// apps/web/src/composables/useSwarm.ts

import { ref } from 'vue';

export function useSwarm() {
  const enabled = ref(
    localStorage.getItem('ims_swarm_enabled') === 'true'
  );

  function toggle() {
    enabled.value = !enabled.value;
    localStorage.setItem('ims_swarm_enabled', String(enabled.value));
  }

  return { enabled, toggle };
}
```

### 3.2 回退方案

```typescript
// 在 AgentHost.swarmStream 中保留回退

async *swarmStream(message: string, context: IMSContext) {
  try {
    yield* streamSwarmWorkflow(message, context);
  } catch (error) {
    console.error('Swarm 失败，回退到单 Agent:', error);
    yield* this.stream('interview-orchestrator', message, context);
  }
}
```

---

## 4. 任务清单（修正）

| ID | 任务 | 工期 | 依赖 | 优先级 | 修正说明 |
|----|------|------|------|--------|----------|
| P3-T1 | 分析现有 AgentHost 架构 | 1d | P2-T10 | 高 | 确认 DeepAgents 方案 |
| P3-T2 | 安装 @deepagents/agent | 0.5d | - | 高 | 依赖安装 |
| P3-T3 | 设计 Swarm Supervisor | 2d | T1 | 高 | 基于 DeepAgents |
| P3-T4 | 实现 Swarm 工作流 | 2.5d | T2, T3 | 高 | handoff 模式 |
| P3-T5 | 集成到 AgentHost | 1.5d | T4 | 高 | 扩展现有 host.ts |
| P3-T6 | 注册 Worker Agents | 2.5d | T5 | 高 | Screening/Question/Assessment |
| P3-T7 | 实现流式输出 | 1d | T4, T5 | 中 | 模拟流式 |
| P3-T8 | 渐进式迁移方案 | 1d | T5 | 中 | feature flag |
| P3-T9 | 集成测试 | 2d | 以上全部 | 高 | - |

**Phase 3 总工期**: 14 天

---

**文档完成** ✅
