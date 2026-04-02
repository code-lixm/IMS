# Phase 3: 多 Agent 架构重构 - 详细技术方案

> **目标**: 迁移到 LangGraph Supervisor 架构
> **工期**: 14 天
> **关键交付物**: 专业 Agent 协作系统

---

## 1. 架构设计

### 1.1 当前架构问题

**现状**:
- 单一 Agent 处理所有任务
- 无法分工协作，任务复杂时响应质量下降
- 无法针对特定场景优化（初筛、出题、评估）
- 所有逻辑集中在 host.ts，难以维护

**目标架构**: Supervisor + Worker 模式

```
┌─────────────────────────────────────────────────────────┐
│                    用户界面层                            │
│           (AgentChat.vue / FileResourceList.vue)        │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                 Supervisor Agent                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │  职责：                                          │   │
│  │  - 理解用户意图                                  │   │
│  │  - 选择合适 Worker 处理任务                      │   │
│  │  - 汇总 Worker 结果                              │   │
│  │  - 协调多轮对话                                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
│ Screening Agent │ │ Question      │ │ Assessment      │
│ (初筛专家)       │ │ Agent         │ │ Agent           │
│                 │ │ (出题专家)     │ │ (评估专家)       │
├─────────────────┤ ├───────────────┤ ├─────────────────┤
│ 职责：          │ │ 职责：        │ │ 职责：          │
│ - 简历解析      │ │ - 技术题目    │ │ - 面试记录分析  │
│ - 技能匹配      │ │ - 情景题      │ │ - 能力评分      │
│ - 初步评估      │ │ - 难度评估    │ │ - 综合评价      │
└─────────────────┘ └───────────────┘ └─────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
│  Memory Store   │ │  File Store   │ │  External APIs  │
│  (记忆系统)      │ │  (文件系统)    │ │  (外部服务)      │
└─────────────────┘ └───────────────┘ └─────────────────┘
```

### 1.2 LangGraph 核心概念

```typescript
// LangGraph 架构核心

// 1. State - 共享状态
interface AgentState {
  messages: Message[];
  currentTask: string;
  activeWorker: string | null;
  context: {
    candidateId?: string;
    resumeContent?: string;
    interviewRound?: number;
  };
  results: Record<string, unknown>;
}

// 2. Nodes - 处理节点
type NodeFunction = (state: AgentState) => Promise<Partial<AgentState>>;

// 3. Edges - 流转边
type EdgeFunction = (state: AgentState) => string; // 返回下一个节点名称

// 4. Graph - 图结构
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: { value: (x, y) => x.concat(y) },
    currentTask: { value: (x, y) => y ?? x },
    // ...
  },
});

// 添加节点
workflow.addNode("supervisor", supervisorNode);
workflow.addNode("screening", screeningNode);
workflow.addNode("question", questionNode);
workflow.addNode("assessment", assessmentNode);

// 添加边
workflow.addEdge("supervisor", "screening");
workflow.addEdge("supervisor", "question");
workflow.addEdge("supervisor", "assessment");

// 条件边
workflow.addConditionalEdges(
  "supervisor",
  (state) => state.activeWorker ?? "__end__"
);

// 编译
const app = workflow.compile();
```

---

## 2. Agent 角色定义

### 2.1 Supervisor Agent

```typescript
// apps/web/src/agents/supervisor.ts

import { z } from 'zod';

export interface SupervisorConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Worker 定义
export interface WorkerDefinition {
  id: string;
  name: string;
  description: string;
  skills: string[];
  systemPrompt: string;
  tools: string[];
}

// Supervisor System Prompt
export const SUPERVISOR_SYSTEM_PROMPT = `你是面试助手系统的总调度员。你的职责是：

1. 理解用户的意图和需求
2. 将任务分配给最合适的专业 Agent
3. 汇总各专业 Agent 的结果
4. 以统一、专业的方式回复用户

可用专业 Agent：
- screening: 初筛专家，擅长简历解析和初步评估
- question: 出题专家，擅长设计面试题目
- assessment: 评估专家，擅长面试结果分析和评分
- email: 邮件专家，擅长撰写和发送面试邮件

决策规则：
- 简历分析、候选人筛选 → screening
- 生成面试题、设计题目 → question
- 面试评价、综合评分 → assessment
- 发送邮件、通知候选人 → email
- 其他一般性问题 → 直接回答

输出格式（JSON）：
{
  "thought": "分析用户意图的思考过程",
  "action": "route|respond",
  "worker": "screening|question|assessment|email|null",
  "message": "如果是 respond，直接回复内容"
}`;

// 路由决策 Schema
export const RoutingDecisionSchema = z.object({
  thought: z.string().describe('分析用户意图的思考过程'),
  action: z.enum(['route', 'respond']).describe('选择路由到 Worker 或直接回复'),
  worker: z.enum(['screening', 'question', 'assessment', 'email']).optional().describe('目标 Worker'),
  message: z.string().optional().describe('直接回复的消息内容'),
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

// Worker 注册表
export const WORKERS: WorkerDefinition[] = [
  {
    id: 'screening',
    name: '初筛专家',
    description: '擅长简历解析、技能匹配、初步评估',
    skills: ['resume-parsing', 'skill-matching', 'screening'],
    systemPrompt: `你是专业的简历初筛专家。你的职责：

1. 解析候选人简历，提取关键信息
2. 评估技能与岗位的匹配度
3. 识别亮点和疑点
4. 给出初步筛选建议

分析维度：
- 教育背景
- 工作经验（年限、行业、岗位）
- 技术栈匹配度
- 项目经历亮点
- 潜在风险点

输出格式：
{
  "summary": "候选人整体印象",
  "strengths": ["优势1", "优势2"],
  "concerns": ["疑虑1", "疑虑2"],
  "match_score": 85,
  "recommendation": "建议面试/待定/不推荐",
  "suggested_questions": ["建议面试问题1", "建议面试问题2"]
}`,
    tools: ['readFile', 'writeFile'],
  },
  {
    id: 'question',
    name: '出题专家',
    description: '擅长设计面试题目、评估题目难度',
    skills: ['question-design', 'difficulty-assessment', 'technical-interview'],
    systemPrompt: `你是专业的面试题目设计专家。你的职责：

1. 根据岗位要求和候选人背景设计面试题
2. 控制题目难度和范围
3. 提供参考答案和评分标准
4. 设计追问问题

题目类型：
- 技术基础题（考察基本功）
- 项目经验题（考察实战能力）
- 场景设计题（考察架构能力）
- 算法题（可选）
- 行为面试题（考察软实力）

输出格式：
{
  "questions": [
    {
      "id": "q1",
      "type": "technical|project|scenario|algorithm|behavioral",
      "difficulty": "easy|medium|hard",
      "question": "题目内容",
      "reference_answer": "参考答案",
      "evaluation_criteria": ["评分点1", "评分点2"],
      "follow_ups": ["追问1", "追问2"]
    }
  ]
}`,
    tools: ['readFile', 'writeFile'],
  },
  {
    id: 'assessment',
    name: '评估专家',
    description: '擅长面试结果分析、综合评分、报告生成',
    skills: ['interview-analysis', 'scoring', 'report-generation'],
    systemPrompt: `你是专业的面试评估专家。你的职责：

1. 分析面试过程中的表现
2. 按维度进行评分
3. 给出综合评价和建议
4. 生成面试报告

评估维度：
- 技术能力（0-100）
- 沟通能力（0-100）
- 问题解决能力（0-100）
- 文化匹配度（0-100）
- 潜力评估（0-100）

评分等级：
- 90-100: 优秀
- 80-89: 良好
- 70-79: 合格
- 60-69: 待观察
- <60: 不合格

输出格式：
{
  "scores": {
    "technical": 85,
    "communication": 80,
    "problem_solving": 82,
    "culture_fit": 85,
    "potential": 80
  },
  "overall_score": 82,
  "level": "良好",
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["不足1", "不足2"],
  "recommendation": "建议录用/待定/不录用",
  "reasoning": "综合判断理由"
}`,
    tools: ['readFile', 'writeFile'],
  },
  {
    id: 'email',
    name: '邮件专家',
    description: '擅长撰写面试邮件、管理邮件模板',
    skills: ['email-writing', 'template-management'],
    systemPrompt: `你是专业的邮件撰写专家。你的职责：

1. 根据场景撰写专业的面试相关邮件
2. 使用合适的语气和格式
3. 确保信息完整准确

邮件类型：
- 面试邀请
- 面试提醒
- 结果通知（通过/拒绝）
- 感谢信

注意事项：
- 保持专业礼貌
- 信息清晰完整
- 适当个性化

输出格式：
{
  "subject": "邮件主题",
  "body": "邮件正文（支持 HTML 格式）",
  "type": "invitation|reminder|result|thanks"
}`,
    tools: ['writeFile'],
  },
];

// Supervisor 类
export class SupervisorAgent {
  private model: any; // LLM 模型
  private workers: Map<string, WorkerDefinition>;
  
  constructor(config: SupervisorConfig) {
    // 初始化模型
    this.workers = new Map(WORKERS.map(w => [w.id, w]));
  }
  
  /**
   * 路由决策
   */
  async route(
    messages: Message[],
    context: { candidateId?: string; sessionId: string }
  ): Promise<RoutingDecision> {
    // 构建 Prompt
    const prompt = this.buildRoutingPrompt(messages, context);
    
    // 调用 LLM
    const response = await this.model.generate(prompt);
    
    // 解析决策
    const decision = this.parseDecision(response);
    
    return decision;
  }
  
  private buildRoutingPrompt(messages: Message[], context: any): string {
    const history = messages.slice(-5).map(m => 
      `${m.role}: ${m.content}`
    ).join('\n');
    
    return `${SUPERVISOR_SYSTEM_PROMPT}

对话历史：
${history}

上下文信息：
${JSON.stringify(context, null, 2)}

请分析用户需求，决定如何处理。只输出 JSON 格式的决策。`;
  }
  
  private parseDecision(response: string): RoutingDecision {
    try {
      // 提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('未找到 JSON');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return RoutingDecisionSchema.parse(parsed);
    } catch (error) {
      // 降级处理：直接回复
      return {
        thought: '解析失败，直接回复',
        action: 'respond',
        message: response,
      };
    }
  }
  
  /**
   * 获取 Worker
   */
  getWorker(workerId: string): WorkerDefinition | undefined {
    return this.workers.get(workerId);
  }
  
  /**
   * 汇总 Worker 结果
   */
  async synthesize(
    workerResults: Record<string, unknown>,
    originalQuery: string
  ): Promise<string> {
    // 构建汇总 Prompt
    const prompt = `请将各专业 Agent 的处理结果汇总，以统一的方式回复用户。

用户原问题：${originalQuery}

各 Agent 结果：
${JSON.stringify(workerResults, null, 2)}

请综合以上信息，给出清晰、专业的回复。`;
    
    const response = await this.model.generate(prompt);
    return response;
  }
}
```

### 2.2 LangGraph 工作流实现

```typescript
// apps/web/src/agents/workflow.ts

import { StateGraph, END } from '@langchain/langgraph';
import { SupervisorAgent, WORKERS } from './supervisor';
import { WorkerAgent } from './worker';
import type { Message } from '@ims/shared';

// 定义状态
interface InterviewAgentState {
  messages: Message[];
  currentTask: string;
  activeWorker: string | null;
  workerResults: Record<string, unknown>;
  context: {
    sessionId: string;
    candidateId?: string;
    conversationId: string;
  };
  finalResponse: string | null;
  shouldEnd: boolean;
}

// 初始状态
const initialState: InterviewAgentState = {
  messages: [],
  currentTask: '',
  activeWorker: null,
  workerResults: {},
  context: {
    sessionId: '',
    conversationId: '',
  },
  finalResponse: null,
  shouldEnd: false,
};

// 创建 Supervisor 实例
const supervisor = new SupervisorAgent({
  model: 'gpt-4',
  temperature: 0.3,
});

// Worker 实例缓存
const workerInstances = new Map<string, WorkerAgent>();

function getWorker(workerId: string): WorkerAgent {
  if (!workerInstances.has(workerId)) {
    const definition = WORKERS.find(w => w.id === workerId);
    if (!definition) {
      throw new Error(`Unknown worker: ${workerId}`);
    }
    workerInstances.set(workerId, new WorkerAgent(definition));
  }
  return workerInstances.get(workerId)!;
}

// Supervisor 节点
async function supervisorNode(state: InterviewAgentState): Promise<Partial<InterviewAgentState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  
  // 如果是系统消息或 Worker 结果，继续处理
  if (lastMessage.role === 'assistant' && lastMessage.agentId?.startsWith('worker-')) {
    // 汇总 Worker 结果
    const response = await supervisor.synthesize(
      state.workerResults,
      state.currentTask
    );
    
    return {
      finalResponse: response,
      shouldEnd: true,
    };
  }
  
  // 路由决策
  const decision = await supervisor.route(state.messages, state.context);
  
  if (decision.action === 'respond') {
    // 直接回复
    return {
      finalResponse: decision.message || '抱歉，我无法理解您的需求。',
      shouldEnd: true,
    };
  }
  
  if (decision.action === 'route' && decision.worker) {
    // 路由到 Worker
    return {
      activeWorker: decision.worker,
      currentTask: lastMessage.content,
    };
  }
  
  return { shouldEnd: true };
}

// Worker 节点工厂
function createWorkerNode(workerId: string) {
  return async function workerNode(state: InterviewAgentState): Promise<Partial<InterviewAgentState>> {
    const worker = getWorker(workerId);
    
    // 执行 Worker 任务
    const result = await worker.execute({
      task: state.currentTask,
      messages: state.messages,
      context: state.context,
    });
    
    // 保存结果
    const newResults = {
      ...state.workerResults,
      [workerId]: result,
    };
    
    // 添加 Worker 响应到消息
    const workerMessage: Message = {
      id: crypto.randomUUID(),
      conversationId: state.context.conversationId,
      role: 'assistant',
      content: JSON.stringify(result),
      agentId: `worker-${workerId}`,
      status: 'complete',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    return {
      workerResults: newResults,
      messages: [...state.messages, workerMessage],
      activeWorker: null, // 返回 Supervisor
    };
  };
}

// 构建工作流
const workflow = new StateGraph<InterviewAgentState>({
  channels: {
    messages: {
      value: (x: Message[], y: Message[]) => x.concat(y),
      default: () => [],
    },
    currentTask: {
      value: (x: string, y: string) => y ?? x,
      default: () => '',
    },
    activeWorker: {
      value: (x: string | null, y: string | null) => y ?? x,
      default: () => null,
    },
    workerResults: {
      value: (x: Record<string, unknown>, y: Record<string, unknown>) => ({ ...x, ...y }),
      default: () => ({}),
    },
    finalResponse: {
      value: (x: string | null, y: string | null) => y ?? x,
      default: () => null,
    },
    shouldEnd: {
      value: (x: boolean, y: boolean) => y ?? x,
      default: () => false,
    },
  },
});

// 添加节点
workflow.addNode('supervisor', supervisorNode);

// 为每个 Worker 添加节点
WORKERS.forEach(worker => {
  workflow.addNode(worker.id, createWorkerNode(worker.id));
});

// 设置入口
workflow.setEntryPoint('supervisor');

// Supervisor 的条件边
workflow.addConditionalEdges('supervisor', (state) => {
  if (state.shouldEnd) {
    return END;
  }
  if (state.activeWorker) {
    return state.activeWorker;
  }
  return END;
});

// Worker 的边（都返回 Supervisor）
WORKERS.forEach(worker => {
  workflow.addEdge(worker.id, 'supervisor');
});

// 编译工作流
export const interviewWorkflow = workflow.compile();

// 运行工作流
export async function runInterviewAgent(
  input: {
    message: string;
    sessionId: string;
    conversationId: string;
    candidateId?: string;
    history?: Message[];
  }
): Promise<{ response: string; messages: Message[] }> {
  const userMessage: Message = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    role: 'user',
    content: input.message,
    status: 'complete',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  const result = await interviewWorkflow.invoke({
    ...initialState,
    messages: [...(input.history || []), userMessage],
    context: {
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      candidateId: input.candidateId,
    },
  });
  
  return {
    response: result.finalResponse || '处理完成',
    messages: result.messages,
  };
}
```

### 2.3 Worker Agent 实现

```typescript
// apps/web/src/agents/worker.ts

import type { WorkerDefinition } from './supervisor';
import type { Message } from '@ims/shared';

export interface WorkerExecuteParams {
  task: string;
  messages: Message[];
  context: {
    sessionId: string;
    conversationId: string;
    candidateId?: string;
  };
}

export class WorkerAgent {
  private definition: WorkerDefinition;
  private model: any;
  
  constructor(definition: WorkerDefinition) {
    this.definition = definition;
    // 初始化模型
  }
  
  /**
   * 执行 Worker 任务
   */
  async execute(params: WorkerExecuteParams): Promise<unknown> {
    // 构建 Prompt
    const prompt = this.buildPrompt(params);
    
    // 调用 LLM
    const response = await this.model.generate(prompt, {
      system: this.definition.systemPrompt,
      tools: this.definition.tools,
    });
    
    // 解析结果
    return this.parseResult(response);
  }
  
  private buildPrompt(params: WorkerExecuteParams): string {
    const recentMessages = params.messages.slice(-3).map(m => 
      `${m.role}: ${m.content}`
    ).join('\n');
    
    return `任务：${params.task}

对话上下文：
${recentMessages}

会话信息：
${JSON.stringify(params.context, null, 2)}

请按照系统指令处理此任务，输出 JSON 格式的结果。`;
  }
  
  private parseResult(response: string): unknown {
    try {
      // 尝试解析 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { result: response };
    } catch {
      return { result: response };
    }
  }
  
  /**
   * 获取 Worker 信息
   */
  getInfo(): WorkerDefinition {
    return this.definition;
  }
}
```

---

## 3. 集成到现有系统

### 3.1 AgentHost 适配

```typescript
// apps/web/src/agents/host.ts

import { runInterviewAgent } from './workflow';
import { useMessageStore } from '@/stores/message';

export class AgentHost {
  private currentWorkflow: any = null;
  
  /**
   * 流式调用（新架构）
   */
  async *stream(
    agentId: string,
    message: string,
    context: {
      conversationId: string;
      candidateId?: string;
      sessionId: string;
    }
  ): AsyncGenerator<string, void, unknown> {
    // 运行工作流
    const result = await runInterviewAgent({
      message,
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      candidateId: context.candidateId,
    });
    
    // 模拟流式输出
    const response = result.response;
    const chunks = this.splitIntoChunks(response, 10);
    
    for (const chunk of chunks) {
      yield chunk;
      await this.delay(50);
    }
  }
  
  /**
   * 非流式调用
   */
  async chat(
    agentId: string,
    message: string,
    context: {
      conversationId: string;
      candidateId?: string;
      sessionId: string;
    }
  ): Promise<string> {
    const result = await runInterviewAgent({
      message,
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      candidateId: context.candidateId,
    });
    
    return result.response;
  }
  
  private splitIntoChunks(text: string, chunkCount: number): string[] {
    const chunkSize = Math.ceil(text.length / chunkCount);
    const chunks: string[] = [];
    
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    
    return chunks;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例
export const agentHost = new AgentHost();
```

### 3.2 移除旧 UI 元素

```vue
<!-- apps/web/src/components/lui/AgentChat.vue -->

<template>
  <div class="agent-chat">
    <!-- 移除：右上角的按钮（初筛，出题，评估，完成） -->
    <!-- 移除：左侧的面试流程 -->
    
    <!-- 保留：简洁的对话界面 -->
    <div class="messages-container">
      <!-- 消息列表 -->
    </div>
    
    <!-- 保留：文件资源列表 -->
    <FileResourceList :conversation-id="conversationId" />
    
    <!-- 保留：输入框 -->
    <div class="input-area">
      <!-- 输入框 -->
    </div>
  </div>
</template>

<script setup>
// 移除：手动阶段切换逻辑
// 移除：面试流程状态管理

// 保留：消息持久化
// 保留：Agent 调用
</script>
```

---

## 4. 任务清单

| ID | 任务 | 工期 | 依赖 | 优先级 | 验收标准 |
|----|------|------|------|--------|----------|
| P3-T1 | 设计多 Agent 架构 | 1d | - | 高 | 架构文档完成 |
| P3-T2 | 安装 LangGraph 依赖 | 0.5d | - | 高 | 依赖安装成功 |
| P3-T3 | 实现 Supervisor Agent | 2d | T1, T2 | 高 | 路由决策正确 |
| P3-T4 | 实现 Worker Agent 基类 | 1d | T2 | 高 | Worker 可执行 |
| P3-T5 | 实现 Screening Worker | 1.5d | T4 | 高 | 简历解析正确 |
| P3-T6 | 实现 Question Worker | 1.5d | T4 | 高 | 题目生成正确 |
| P3-T7 | 实现 Assessment Worker | 1.5d | T4 | 高 | 评估逻辑正确 |
| P3-T8 | 实现 LangGraph 工作流 | 2d | T3, T5, T6, T7 | 高 | 工作流运行正常 |
| P3-T9 | 集成到 AgentHost | 1d | T8 | 高 | 可调用新架构 |
| P3-T10 | 移除旧 UI 元素 | 1d | - | 中 | 界面简洁化 |
| P3-T11 | 集成测试 | 1d | 以上全部 | 高 | 所有功能测试通过 |

**Phase 3 总工期**: 14 天

---

## 5. 依赖关系图

```
Phase 3 任务依赖
├── P3-T1 (架构设计)
├── P3-T2 (安装依赖)
├── P3-T3 (Supervisor)
│   └── P3-T8 (工作流)
├── P3-T4 (Worker 基类)
│   ├── P3-T5 (Screening)
│   ├── P3-T6 (Question)
│   └── P3-T7 (Assessment)
│       └── P3-T8 (工作流)
├── P3-T9 (集成到 Host)
│   └── P3-T11 (集成测试)
├── P3-T10 (移除旧 UI)
│   └── P3-T11 (集成测试)
└── P3-T8, T9, T10
    └── P3-T11 (集成测试)

关键路径: T1 → T2 → T4 → T5/T6/T7 → T8 → T9 → T11 = 11d
并行 Worker 开发可节省时间
```

---

## 6. 迁移策略

### 6.1 渐进式迁移

```
阶段 1：并排运行（1 周）
- 新架构作为影子系统运行
- 对比新旧架构输出
- 收集问题和改进点

阶段 2：灰度切换（3 天）
- 部分用户使用新架构
- 监控错误率和性能
- 快速修复问题

阶段 3：全面切换（2 天）
- 所有用户使用新架构
- 保留旧代码 1 周作为回退
```

### 6.2 回退方案

```typescript
// 在 AgentHost 中保留旧逻辑作为回退

async stream(agentId: string, message: string, context: any) {
  try {
    // 尝试新架构
    if (this.useNewArchitecture) {
      yield* this.newStream(agentId, message, context);
    } else {
      yield* this.oldStream(agentId, message, context);
    }
  } catch (error) {
    console.error('新架构失败，回退到旧架构:', error);
    yield* this.oldStream(agentId, message, context);
  }
}
```

---

**文档完成** ✅
