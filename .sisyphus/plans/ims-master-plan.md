# IMS 智能面试系统 - 总体规划

> **版本**: v1.0  
> **制定时间**: 2026-04-02  
> **预计工期**: 6-8 周  
> **负责人**: [待指定]  

---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [执行策略](#2-执行策略)
3. [Phase 1: Agent 基础能力](#3-phase-1-agent-基础能力)
4. [Phase 2: Agent 增强](#4-phase-2-agent-增强)
5. [Phase 3: 多 Agent 架构重构](#5-phase-3-多-agent-架构重构)
6. [Phase 4: 业务功能闭环](#6-phase-4-业务功能闭环)
7. [Phase 5: 交互体验优化](#7-phase-5-交互体验优化)
8. [技术规范](#8-技术规范)
9. [风险管控](#9-风险管控)
10. [附录](#10-附录)

---

## 1. 项目概述

### 1.1 背景与目标

IMS 系统当前存在以下核心问题：
- 🔴 **数据丢失风险**: 对话消息仅存储在内存，刷新即丢失
- 🔴 **用户体验问题**: 重复会话、UI 状态异常
- 🟡 **业务闭环缺失**: 无法发送面试邮件、无法填报面试结果
- 🟡 **Agent 能力受限**: 无记忆、无法操作文件、多 Agent 协作未实现

### 1.2 核心目标

构建一个**完整的 AI 面试助手系统**，具备：
- ✅ 完整的消息持久化和会话管理
- ✅ 专业 Agent 可读写文件、具备记忆能力
- ✅ 多 Agent 协作架构（初筛/出题/评估/邮件）
- ✅ 业务闭环（邮件通知、结果填报）
- ✅ 优秀的交互体验

### 1.3 范围界定

**IN SCOPE（本计划内）**:
- 消息持久化系统
- UI Bug 修复
- Agent 文件操作工具
- Agent 记忆系统（全局 + 会话）
- 多 Agent 架构重构（LangGraph）
- 邮件发送功能
- 面试结果填报
- 监听功能键盘化
- 引导页面优化

**OUT OF SCOPE（本计划外）**:
- 移动端适配
- 远程系统对接（已有接口，仅使用）
- 性能优化（除非成为阻塞点）
- 测试基础设施搭建

---

## 2. 执行策略

### 2.1 总体时间表

```
Week 1-2:  Phase 1 (基础能力)
Week 3-4:  Phase 2 (Agent 增强)
Week 5-6:  Phase 3 (架构重构)
Week 7-8:  Phase 4-6 (业务功能 + 优化)
```

### 2.2 依赖关系图

```
Phase 1: 基础能力
├── 1.1 消息持久化
│   ├── 依赖: db-schema.ts (已存在 Message 接口)
│   └── 阻塞: 所有会话相关功能
├── 1.2 UI Bug 修复
│   ├── 1.2.1 重复会话问题
│   ├── 1.2.2 思考阶段展开/收起
│   └── 1.2.3 候选人选择显示
└── 1.3 Agent 说明简化

Phase 2: Agent 增强
├── 依赖: Phase 1 完成
├── 2.1 Agent 工具系统 (read/write)
│   └── 阻塞: 文件资源管理
├── 2.2 全局记忆系统
│   └── 阻塞: 智能体学习
└── 2.3 会话记忆系统

Phase 3: 架构重构
├── 依赖: Phase 2 完成
├── 3.1 LangGraph 基础设施
├── 3.2 专业 Agent 拆分
│   ├── 初筛 Agent
│   ├── 出题 Agent
│   ├── 评估 Agent
│   └── 邮件 Agent
└── 3.3 Supervisor 协调器

Phase 4: 业务功能
├── 依赖: Phase 3 完成
├── 4.1 邮件功能
│   ├── SMTP 配置
│   ├── 邮件模板
│   └── 发送服务
└── 4.2 面试结果填报

Phase 5-6: 优化
└── 可并行执行
```

### 2.3 并行化策略

**可以并行的任务**:
- UI Bug 修复（3个 Bug 可并行）
- Phase 5 和 Phase 6 可与 Phase 4 部分并行

**必须串行的任务**:
- Phase 1 → Phase 2 → Phase 3 → Phase 4
- 每个 Phase 内部的核心任务

---

## 3. Phase 1: Agent 基础能力

**目标**: 解决数据丢失和基础体验问题  
**工期**: 1-2 周  
**关键交付物**: 消息可持久化、无 UI 异常

---

### 3.1 消息持久化系统

#### 3.1.1 现状分析

**问题**: `AgentChat.vue:152` 的 `messages` 仅使用 `ref` 存储，刷新页面即丢失

**影响**: 
- 用户对话历史无法恢复
- 无法支持跨会话的智能体记忆
- 不符合生产环境要求

#### 3.1.2 技术方案

**后端 API 设计**:

```typescript
// GET /api/conversations/:id/messages
// 获取会话消息列表
interface GetMessagesResponse {
  messages: Message[];
  total: number;
}

// POST /api/conversations/:id/messages
// 发送消息并保存
interface SendMessageRequest {
  content: string;
  role: 'user' | 'assistant';
  agentId?: string;
}

// PUT /api/conversations/:id/messages/:messageId
// 更新消息（用于流式追加内容）
interface UpdateMessageRequest {
  content?: string;
  reasoning?: string;
  status?: MessageStatus;
}

// DELETE /api/conversations/:id/messages/:messageId
// 删除单条消息
```

**数据库操作**:

```typescript
// packages/server/src/services/message.ts

import { db } from '../db';
import { messages } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

export class MessageService {
  // 获取会话消息
  async getMessagesByConversationId(
    conversationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]> {
    return db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [desc(messages.createdAt)],
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  // 创建消息
  async createMessage(data: {
    conversationId: string;
    role: MessageRole;
    content: string;
    reasoning?: string;
    agentId?: string;
  }): Promise<Message> {
    const [message] = await db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      reasoning: data.reasoning ?? null,
      toolsJson: null,
      status: 'streaming',
      createdAt: Date.now(),
    }).returning();
    return message;
  }

  // 更新消息内容（流式追加）
  async appendMessageContent(
    messageId: string,
    contentDelta: string
  ): Promise<void> {
    await db.update(messages)
      .set({
        content: sql`${messages.content} || ${contentDelta}`,
      })
      .where(eq(messages.id, messageId));
  }

  // 完成消息
  async completeMessage(messageId: string): Promise<void> {
    await db.update(messages)
      .set({ status: 'complete' })
      .where(eq(messages.id, messageId));
  }

  // 删除会话的所有消息
  async deleteMessagesByConversationId(conversationId: string): Promise<void> {
    await db.delete(messages)
      .where(eq(messages.conversationId, conversationId));
  }
}
```

**前端集成**:

```typescript
// apps/web/src/stores/lui/messages.ts

import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { messageApi } from '@/api/message';

export const useMessageStore = defineStore('message', () => {
  // State
  const messages = ref<Record<string, Message[]>>({}); // conversationId -> messages
  const currentConversationId = ref<string | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const currentMessages = computed(() => {
    if (!currentConversationId.value) return [];
    return messages.value[currentConversationId.value] ?? [];
  });

  // Actions
  async function loadMessages(conversationId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await messageApi.getMessages(conversationId);
      messages.value[conversationId] = data.messages;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function sendMessage(conversationId: string, content: string) {
    // 1. 乐观更新 UI
    const tempUserMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content,
      createdAt: new Date(),
    };
    
    if (!messages.value[conversationId]) {
      messages.value[conversationId] = [];
    }
    messages.value[conversationId].push(tempUserMessage);

    // 2. 调用 API
    const response = await messageApi.sendMessage(conversationId, { content });
    
    // 3. 替换临时消息，添加 AI 响应占位
    const index = messages.value[conversationId].findIndex(
      m => m.id === tempUserMessage.id
    );
    if (index !== -1) {
      messages.value[conversationId][index] = response.userMessage;
    }
    messages.value[conversationId].push(response.assistantMessage);

    return response.assistantMessage;
  }

  async function streamMessage(
    conversationId: string,
    messageId: string,
    stream: AsyncIterable<string>
  ) {
    const conversationMessages = messages.value[conversationId];
    const message = conversationMessages?.find(m => m.id === messageId);
    if (!message) return;

    message.status = 'streaming';
    
    for await (const chunk of stream) {
      message.content += chunk;
      // 可选：节流保存到后端
    }

    message.status = 'complete';
    
    // 最终保存
    await messageApi.completeMessage(conversationId, messageId);
  }

  return {
    messages,
    currentMessages,
    isLoading,
    error,
    loadMessages,
    sendMessage,
    streamMessage,
  };
});
```

**AgentChat.vue 修改**:

```vue
<script setup lang="ts">
// ... 现有导入
import { useMessageStore } from '@/stores/lui/messages';

const messageStore = useMessageStore();

// 替换原有的 messages ref
// const messages = ref<Message[]>([]); // 删除这行

// 使用 store 中的消息
const messages = computed(() => messageStore.currentMessages);

// 初始化时加载历史消息
onMounted(async () => {
  if (props.conversationId) {
    await messageStore.loadMessages(props.conversationId);
  }
});

// 发送消息
async function handleSend() {
  if (!inputMessage.value.trim() || !props.conversationId) return;
  
  const content = inputMessage.value;
  inputMessage.value = '';
  
  try {
    // 发送并获取 AI 消息占位
    const assistantMessage = await messageStore.sendMessage(
      props.conversationId,
      content
    );
    
    // 开始流式响应
    const stream = agentHost.stream(
      currentAgentId.value,
      content,
      agentContext.value
    );
    
    // 流式更新
    await messageStore.streamMessage(
      props.conversationId,
      assistantMessage.id,
      stream
    );
    
  } catch (error) {
    // 错误处理...
  }
}
</script>
```

#### 3.1.3 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新增 | `packages/server/src/services/message.ts` | 消息服务层 |
| 新增 | `packages/server/src/routes/messages.ts` | 消息 API 路由 |
| 新增 | `apps/web/src/api/message.ts` | 前端消息 API 客户端 |
| 新增 | `apps/web/src/stores/lui/messages.ts` | Pinia 消息状态管理 |
| 修改 | `apps/web/src/components/lui/AgentChat.vue` | 集成持久化逻辑 |
| 修改 | `packages/server/src/routes.ts` | 注册消息路由 |

#### 3.1.4 验收标准

- [ ] 刷新页面后历史消息可恢复
- [ ] 发送消息后实时显示在列表中
- [ ] 流式响应内容实时更新并保存
- [ ] 删除会话时关联消息被清理
- [ ] 支持消息分页加载（可选）

---

### 3.2 UI Bug 修复

#### 3.2.1 重复会话问题

**问题描述**: 用户创建会话时出现重复条目

**根因分析**: 创建会话时未检查重复，或前端状态未正确更新

**修复方案**:

```typescript
// apps/web/src/stores/lui/conversations.ts

async function createConversation(data: {
  title: string;
  candidateId?: string;
}) {
  // 检查是否已存在相同候选人的活跃会话
  const existingConversation = conversations.value.find(
    c => c.candidateId === data.candidateId && !c.isArchived
  );
  
  if (existingConversation) {
    // 复用现有会话
    await selectConversation(existingConversation.id);
    return existingConversation;
  }
  
  // 创建新会话
  const conversation = await conversationApi.create(data);
  conversations.value.unshift(conversation);
  return conversation;
}
```

**文件**: `apps/web/src/stores/lui/conversations.ts`

---

#### 3.2.2 思考阶段展开/收起

**问题描述**: 思考阶段（reasoning）展开/收起状态失效

**根因分析**: 状态管理问题，可能在流式响应过程中状态被重置

**修复方案**:

```vue
<!-- apps/web/src/components/lui/AgentChat.vue -->

<template>
  <!-- 消息列表中显示思考过程 -->
  <div
    v-for="message in messages"
    :key="message.id"
    class="message"
  >
    <!-- 思考过程折叠面板 -->
    <Collapsible
      v-if="message.reasoning"
      v-model:open="reasoningOpenStates[message.id]"
    >
      <CollapsibleTrigger class="reasoning-trigger">
        <Brain class="h-4 w-4" />
        <span>思考过程</span>
        <ChevronDown
          class="h-4 w-4 transition-transform"
          :class="{ 'rotate-180': reasoningOpenStates[message.id] }"
        />
      </CollapsibleTrigger>
      <CollapsibleContent class="reasoning-content">
        <pre>{{ message.reasoning }}</pre>
      </CollapsibleContent>
    </Collapsible>
    
    <!-- 消息内容 -->
    <div class="message-content">{{ message.content }}</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

// 思考过程展开状态
const reasoningOpenStates = ref<Record<string, boolean>>({});

// 自动展开正在流式传输的消息的思考过程
watch(() => messages.value, (newMessages) => {
  newMessages.forEach(msg => {
    if (msg.status === 'streaming' && msg.reasoning) {
      reasoningOpenStates.value[msg.id] = true;
    }
  });
}, { deep: true, immediate: true });
</script>
```

**文件**: `apps/web/src/components/lui/AgentChat.vue`

---

#### 3.2.3 候选人选择显示

**问题描述**: 候选人点击选择时未显示候选人姓名

**根因分析**: `candidate-selector.vue` 组件数据绑定或显示逻辑问题

**修复方案**:

```vue
<!-- apps/web/src/components/lui/candidate-selector.vue -->

<template>
  <div class="candidate-selector">
    <Select v-model="selectedCandidateId">
      <SelectTrigger>
        <SelectValue :placeholder="placeholder">
          <!-- 修复：正确显示选中的候选人姓名 -->
          <template v-if="selectedCandidate">
            <span class="font-medium">{{ selectedCandidate.name }}</span>
            <span class="text-muted-foreground text-sm ml-2">
              {{ selectedCandidate.position }}
            </span>
          </template>
          <template v-else>
            {{ placeholder }}
          </template>
        </SelectValue>
      </SelectTrigger>
      
      <SelectContent>
        <SelectItem
          v-for="candidate in candidates"
          :key="candidate.id"
          :value="candidate.id"
        >
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ candidate.name }}</span>
            <Badge v-if="candidate.position" variant="secondary">
              {{ candidate.position }}
            </Badge>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps<{
  candidates: Candidate[];
  modelValue?: string | null;
}>();

const selectedCandidateId = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

// 修复：正确计算选中的候选人
const selectedCandidate = computed(() => {
  if (!selectedCandidateId.value) return null;
  return props.candidates.find(c => c.id === selectedCandidateId.value);
});
</script>
```

**文件**: `apps/web/src/components/lui/candidate-selector.vue`

---

### 3.3 Agent 说明简化

**问题描述**: 面试专家 Agent 的说明过于复杂，用户难以理解

**当前问题代码**:

```typescript
// apps/web/src/components/lui/agent-selector.vue:121-129
const INTERVIEW_AGENT_PROFILE: AgentProfileView = {
  title: "面试专家 Agent",
  subtitle: "主调度 · 初筛 → 出题 → 评估",
  description: "围绕候选人简历、面试流程和评估结论统一编排，负责把每一轮输入收束成可执行的面试工作流。",
  skills: ["面试编排", "初筛分析", "问题设计", "面试评估"],
  tools: ["建立工作区", "轮次解析", "微信摘要", "PDF 扫描", "批量筛选"],
  entrySkill: "interview-orchestrator",
  supportSkills: ["interview-screening", "interview-questioning", "interview-assessment"],
};
```

**简化方案**:

```typescript
const INTERVIEW_AGENT_PROFILE: AgentProfileView = {
  title: "面试专家",
  subtitle: "智能面试助手",
  description: "帮你筛选简历、设计面试题、评估候选人",
  skills: ["简历分析", "题目设计", "综合评估"],
  tools: ["读取简历", "生成题目", "输出报告"],
  entrySkill: "interview-orchestrator",
  supportSkills: [], // 隐藏内部实现细节
};
```

**文件**: `apps/web/src/components/lui/agent-selector.vue`

---

### 3.4 Phase 1 时间计划

| 任务 | 负责人 | 工期 | 依赖 | 状态 |
|------|--------|------|------|------|
| 消息持久化 - API 设计 | | 1d | | ⬜ |
| 消息持久化 - 后端实现 | | 2d | API 设计 | ⬜ |
| 消息持久化 - 前端集成 | | 2d | 后端实现 | ⬜ |
| Bug 修复 - 重复会话 | | 0.5d | | ⬜ |
| Bug 修复 - 思考展开 | | 0.5d | | ⬜ |
| Bug 修复 - 候选人显示 | | 0.5d | | ⬜ |
| Agent 说明简化 | | 0.5d | | ⬜ |
| 集成测试 | | 1d | 以上全部 | ⬜ |
| **总计** | | **~8d** | | |

---

## 4. Phase 2: Agent 增强

**目标**: 赋予 Agent 文件操作能力和记忆能力  
**工期**: 2 周  
**关键交付物**: Agent 可读写文件、具备短期和长期记忆

---

### 4.1 Agent 工具系统 (read/write)

#### 4.1.1 技术方案

```typescript
// apps/web/src/agents/tools/file-tools.ts
export const fileTools = {
  readFile: {
    name: 'readFile',
    description: '读取当前会话中的文件内容',
    parameters: {
      type: 'object',
      properties: { fileId: { type: 'string' } },
      required: ['fileId'],
    },
    handler: async (params, context) => {
      const file = await fileApi.getFile(context.conversationId, params.fileId);
      return { success: true, content: file.content };
    },
  },
  writeFile: {
    name: 'writeFile',
    description: '创建新文件',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        content: { type: 'string' },
        type: { type: 'string', enum: ['code', 'document'] },
      },
      required: ['name', 'content', 'type'],
    },
    handler: async (params, context) => {
      const file = await fileApi.createFile(context.conversationId, params);
      return { success: true, fileId: file.id };
    },
  },
};
```

#### 4.1.2 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新增 | `apps/web/src/agents/tools/file-tools.ts` | 文件操作工具 |
| 修改 | `apps/web/src/agents/host.ts` | 集成工具调用 |

---

### 4.2 全局记忆系统

#### 4.2.1 数据模型

```typescript
// packages/shared/src/db-schema.ts
export interface AgentMemory {
  id: string;
  type: 'fact' | 'insight' | 'preference';
  scope: 'global' | 'candidate';
  content: string;
  embedding: string | null;
  importance: number;
  createdAt: number;
}
```

#### 4.2.2 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 修改 | `packages/shared/src/db-schema.ts` | 添加 AgentMemory |
| 新增 | `packages/server/src/services/memory.ts` | 记忆服务 |
| 修改 | `apps/web/src/agents/host.ts` | 记忆注入 |

---

### 4.3 Phase 2 时间计划

| 任务 | 工期 | 状态 |
|------|------|------|
| Agent 工具系统 | 4d | ✅ |
| 全局记忆系统 | 5d | ✅ |
| 会话记忆系统 | 2d | ✅ |
| 集成测试 | 2d | ⬜ |
| **总计** | **~13d** | |

---

## 5. Phase 3: 多 Agent 架构重构

**目标**: 基于 AgentHost + Vercel AI SDK 实现专业 Agent 协作  
**工期**: 2 周  
**关键交付物**: 专业 Agent 协作系统

**技术选型**:
- ✅ AgentHost（现有架构，apps/web/src/agents/host.ts）
- ✅ Vercel AI SDK（ai package）
- ✅ Swarm 模式（Agent 间 handoff）
- ❌ LangGraph（不使用）

---

### 5.1 架构设计

```
┌─────────────────────────────────────────┐
│     面试协调员 (interview-coordinator)   │
│  ┌─────┬─────┬─────┬─────┐             │
│  │技术 │ HR  │薪资 │简历 │  Worker     │
│  │面试官│面试官│顾问 │分析器│  Agents     │
│  └─────┴─────┴─────┴─────┘             │
└─────────────────────────────────────────┘

现有 Agents:
- interview-coordinator (协调员)
- tech-interviewer (技术面试官)
- hr-interviewer (HR 面试官)
- salary-advisor (薪资顾问)
- resume-analyzer (简历分析器)
- search-assistant (搜索助手)
```

### 5.2 实现方案

**基于现有 AgentHost 架构**:

1. **增强 interview-coordinator**:
   - 添加更智能的任务分配逻辑
   - 实现 Agent 间的 handoff 机制
   - 添加结果聚合功能

2. **完善 Worker Agents**:
   - tech-interviewer: 技术面试问题生成
   - hr-interviewer: HR 面试问题生成
   - salary-advisor: 薪资建议
   - resume-analyzer: 简历分析

3. **添加新功能**:
   - 面试结果填报
   - 邮件发送（Phase 4）

### 5.3 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 修改 | `apps/web/src/agents/builtin/interview-coordinator.ts` | 增强协调逻辑 |
| 修改 | `apps/web/src/agents/builtin/tech-interviewer.ts` | 完善技术面试 |
| 修改 | `apps/web/src/agents/builtin/hr-interviewer.ts` | 完善 HR 面试 |
| 修改 | `apps/web/src/agents/host.ts` | 添加 handoff 支持 |
| 修改 | `apps/web/src/components/lui/AgentChat.vue` | 适配新架构 |

---

### 5.4 Phase 3 时间计划

| 任务 | 工期 | 状态 |
|------|------|------|
| AgentHost 架构增强 | 3d | ✅ |
| Worker Agent 完善 | 5d | ✅ |
| Handoff 机制实现 | 3d | ✅ |
| 集成测试 | 3d | ⬜ |
| **总计** | **~14d** | |

---

## 6. Phase 4: 业务功能闭环

**目标**: 实现邮件发送和面试结果填报  
**工期**: 1-2 周  
**关键交付物**: 业务闭环功能

---

### 6.1 邮件发送功能

#### 6.1.1 数据模型

```typescript
// packages/shared/src/db-schema.ts
export interface EmailConfig {
  id: string;
  userId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
}

export interface EmailTemplate {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
}
```

#### 6.1.2 安装依赖

```bash
bun add nodemailer
bun add -d @types/nodemailer
```

---

### 6.2 面试结果填报

#### 6.2.1 功能需求

- 支持面试官录入面试评价
- 评分维度：技术能力、沟通能力、文化匹配度
- 综合建议：通过/待定/拒绝
- 自动生成面试报告

---

### 6.3 Phase 4 时间计划

| 任务 | 工期 | 状态 |
|------|------|------|
| 邮件配置功能 | 3d | ✅ |
| 邮件发送服务 | 2d | ✅ |
| 面试结果填报 | 3d | ✅ |
| 集成测试 | 2d | ⬜ |
| **总计** | **~10d** | |

---

## 7. Phase 5-6: 优化与完善

**目标**: 交互体验优化  
**工期**: 1 周  
**关键交付物**: 完善的用户体验

---

### 7.1 监听功能键盘化

- 移除页面上的录音按钮
- 独立监听窗口
- 支持 Record / Pause / Resume 快捷键

### 7.2 引导页面优化

- 首次使用引导
- 端点配置向导
- 登录扫码支持

---

### 7.3 Phase 5-6 时间计划

| 任务 | 工期 | 状态 |
|------|------|------|
| 监听功能重构 | 3d | ⬜ |
| 引导页面 | 3d | ⬜ |
| 整体优化 | 2d | ⬜ |
| **总计** | **~8d** | |

---

## 8. 技术规范

### 8.1 代码规范

- TypeScript strict mode
- 所有 API 返回类型必须定义
- 错误处理使用统一格式

### 8.2 数据库变更

- 所有表变更需更新 db-schema.ts
- 新增表需创建 migration（如果启用）

### 8.3 API 规范

```typescript
// 统一响应格式
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

---

## 9. 风险__VG_SENSITIVE_KEYWORD_2e1c15e4a1f9__

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| LangGraph 学习曲线 | 延期 | 中 | 提前技术调研，预留缓冲时间 |
| 向量数据库选型 | 技术债务 | 低 | 先用 SQLite + 内存，后续可替换 |
| SMTP 服务商限制 | 功能受限 | 低 | 支持多个邮件服务商 |
| 性能瓶颈 | 体验差 | 中 | 流式响应，分页加载 |

---

## 10. 附录

### 10.1 参考资源

- LangGraph Docs: https://langchain-ai.github.io/langgraph/
- CrewAI Memory: https://docs.crewai.com/concepts/memory
- Nodemailer: https://nodemailer.com/

### 10.2 项目关键文件

```
packages/
  shared/src/db-schema.ts      # 数据模型
  server/src/routes.ts         # API 路由
  server/src/schema.ts         # Drizzle Schema
apps/
  web/src/components/lui/      # LUI 组件
  web/src/agents/              # Agent 系统
  web/src/stores/lui.ts        # LUI 状态
```

---

## 📅 总体时间计划

| Phase | 内容 | 工期 | 累计 |
|-------|------|------|------|
| Phase 1 | 基础能力 | 8d | 8d |
| Phase 2 | Agent 增强 | 13d | 21d |
| Phase 3 | 架构重构 | 14d | 35d |
| Phase 4 | 业务功能 | 10d | 45d |
| Phase 5-6 | 优化 | 8d | 53d |
| 缓冲 | | 7d | **60d** |

**预计总工期**: 约 8-9 周（考虑周末和缓冲）

---

**计划制定完成 ✅**

下一步：确认计划后，可开始具体任务的实施。

---
