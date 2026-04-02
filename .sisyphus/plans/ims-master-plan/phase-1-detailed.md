# Phase 1: Agent 基础能力 - 详细技术方案

> **目标**: 解决数据丢失和基础体验问题
> **工期**: 8 天
> **关键交付物**: 消息可持久化、UI Bug 修复、Agent 说明简化

---

## 1. 消息持久化系统 - 详细设计

### 1.1 数据模型

#### 1.1.1 数据库 Schema

```typescript
// packages/server/src/schema.ts

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 消息状态枚举
export const MessageStatus = {
  STREAMING: 'streaming',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const;

// 消息表
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  
  // 消息角色：user | assistant | system | tool
  role: text('role', { 
    enum: ['user', 'assistant', 'system', 'tool'] 
  }).notNull(),
  
  // 消息内容（主文本）
  content: text('content').notNull(),
  
  // AI 思考过程（reasoning）
  reasoning: text('reasoning'),
  
  // 工具调用 JSON（如果有）
  toolsJson: text('tools_json'),
  
  // 消息状态
  status: text('status', { 
    enum: ['streaming', 'complete', 'error'] 
  }).notNull().default('streaming'),
  
  // Agent ID（如果是 Agent 消息）
  agentId: text('agent_id'),
  
  // 引用消息 ID（回复功能）
  parentId: text('parent_id'),
  
  // 元数据（扩展字段）
  metadataJson: text('metadata_json'),
  
  // 时间戳
  createdAt: integer('created_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
});

// 会话表（增强版）
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  candidateId: text('candidate_id'),
  agentId: text('agent_id').notNull(),
  
  // 会话类型
  type: text('type', { 
    enum: ['interview', 'screening', 'assessment', 'general'] 
  }).notNull().default('general'),
  
  // 会话状态
  status: text('status', {
    enum: ['active', 'archived', 'completed']
  }).notNull().default('active'),
  
  // 消息数量缓存
  messageCount: integer('message_count').notNull().default(0),
  
  // 最后消息时间
  lastMessageAt: integer('last_message_at'),
  
  // 创建时间
  createdAt: integer('created_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
});
```

#### 1.1.2 共享类型定义

```typescript
// packages/shared/src/types/message.ts

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageStatus = 'streaming' | 'complete' | 'error';
export type ConversationType = 'interview' | 'screening' | 'assessment' | 'general';
export type ConversationStatus = 'active' | 'archived' | 'completed';

// 消息接口
export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  reasoning?: string;
  toolsJson?: string; // 工具调用序列化 JSON
  status: MessageStatus;
  agentId?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// 工具调用定义
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'success' | 'error';
}

// 创建消息请求
export interface CreateMessageRequest {
  role: MessageRole;
  content: string;
  reasoning?: string;
  tools?: ToolCall[];
  agentId?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

// 消息分页响应
export interface PaginatedMessagesResponse {
  messages: Message[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}
```

### 1.2 API 设计

#### 1.2.1 REST API 端点

```typescript
// packages/server/src/routes/messages.ts

import { Hono } from 'hono';
import { MessageService } from '../services/message';

const app = new Hono();
const messageService = new MessageService();

// 获取会话消息列表
// GET /api/conversations/:conversationId/messages
app.get('/api/conversations/:conversationId/messages', async (c) => {
  const conversationId = c.req.param('conversationId');
  const { page = '1', pageSize = '50', before } = c.req.query();
  
  const result = await messageService.getMessages(conversationId, {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    before: before ? parseInt(before) : undefined,
  });
  
  return c.json({
    success: true,
    data: result,
  });
});

// 发送消息（创建用户消息 + AI 响应占位）
// POST /api/conversations/:conversationId/messages
app.post('/api/conversations/:conversationId/messages', async (c) => {
  const conversationId = c.req.param('conversationId');
  const body = await c.req.json<CreateMessageRequest>();
  
  // 1. 创建用户消息
  const userMessage = await messageService.createMessage({
    conversationId,
    role: 'user',
    content: body.content,
    agentId: body.agentId,
  });
  
  // 2. 创建 AI 响应占位
  const assistantMessage = await messageService.createMessage({
    conversationId,
    role: 'assistant',
    content: '', // 初始为空，流式填充
    agentId: body.agentId,
    parentId: userMessage.id,
  });
  
  // 3. 更新会话统计
  await conversationService.updateStats(conversationId);
  
  return c.json({
    success: true,
    data: {
      userMessage,
      assistantMessage,
    },
  });
});

// 流式更新消息内容
// PATCH /api/messages/:messageId/content
app.patch('/api/messages/:messageId/content', async (c) => {
  const messageId = c.req.param('messageId');
  const { content, reasoning, tools, status } = await c.req.json();
  
  await messageService.updateMessage(messageId, {
    content,
    reasoning,
    toolsJson: tools ? JSON.stringify(tools) : undefined,
    status,
  });
  
  return c.json({ success: true });
});

// 完成消息（流式结束）
// POST /api/messages/:messageId/complete
app.post('/api/messages/:messageId/complete', async (c) => {
  const messageId = c.req.param('messageId');
  await messageService.completeMessage(messageId);
  return c.json({ success: true });
});

// 删除消息
// DELETE /api/messages/:messageId
app.delete('/api/messages/:messageId', async (c) => {
  const messageId = c.req.param('messageId');
  await messageService.deleteMessage(messageId);
  return c.json({ success: true });
});

// 批量删除会话消息
// DELETE /api/conversations/:conversationId/messages
app.delete('/api/conversations/:conversationId/messages', async (c) => {
  const conversationId = c.req.param('conversationId');
  await messageService.deleteMessagesByConversationId(conversationId);
  return c.json({ success: true });
});

export default app;
```

#### 1.2.2 WebSocket 流式响应（可选优化）

```typescript
// packages/server/src/services/streaming.ts

import { ServerWebSocket } from 'bun';

export interface StreamMessage {
  type: 'chunk' | 'reasoning' | 'tool_start' | 'tool_end' | 'complete' | 'error';
  data: unknown;
}

export class MessageStreamManager {
  private sockets = new Map<string, ServerWebSocket<unknown>>();
  
  register(messageId: string, ws: ServerWebSocket<unknown>) {
    this.sockets.set(messageId, ws);
  }
  
  unregister(messageId: string) {
    this.sockets.delete(messageId);
  }
  
  async streamChunk(messageId: string, chunk: string) {
    const ws = this.sockets.get(messageId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'chunk',
        data: { content: chunk },
      }));
    }
  }
  
  async streamComplete(messageId: string) {
    const ws = this.sockets.get(messageId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'complete',
        data: {},
      }));
      this.unregister(messageId);
    }
  }
}
```

### 1.3 服务层实现

```typescript
// packages/server/src/services/message.ts

import { db } from '../db';
import { messages, conversations } from '../schema';
import { eq, and, desc, asc, count, sql } from 'drizzle-orm';
import type { Message, CreateMessageRequest, PaginatedMessagesResponse } from '@ims/shared';

export interface GetMessagesOptions {
  page?: number;
  pageSize?: number;
  before?: number; // 时间戳，获取该时间之前的消息
}

export class MessageService {
  // 获取消息列表
  async getMessages(
    conversationId: string,
    options: GetMessagesOptions = {}
  ): Promise<PaginatedMessagesResponse> {
    const { page = 1, pageSize = 50, before } = options;
    const offset = (page - 1) * pageSize;
    
    // 构建查询条件
    const conditions = [eq(messages.conversationId, conversationId)];
    if (before) {
      conditions.push(sql`${messages.createdAt} < ${before}`);
    }
    
    // 查询消息
    const result = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: [desc(messages.createdAt)],
      limit: pageSize,
      offset,
    });
    
    // 统计总数
    const [{ total }] = await db
      .select({ total: count() })
      .from(messages)
      .where(and(...conditions));
    
    // 转换为前端格式（反转顺序使其按时间正序）
    const sortedMessages = result.reverse().map(this.mapToMessage);
    
    return {
      messages: sortedMessages,
      pagination: {
        total,
        page,
        pageSize,
        hasMore: offset + result.length < total,
      },
    };
  }
  
  // 获取单条消息
  async getMessageById(messageId: string): Promise<Message | null> {
    const result = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
    return result ? this.mapToMessage(result) : null;
  }
  
  // 创建消息
  async createMessage(data: CreateMessageRequest & { conversationId: string }): Promise<Message> {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const [record] = await db.insert(messages).values({
      id,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      reasoning: data.reasoning ?? null,
      toolsJson: data.tools ? JSON.stringify(data.tools) : null,
      status: 'streaming',
      agentId: data.agentId ?? null,
      parentId: data.parentId ?? null,
      metadataJson: data.metadata ? JSON.stringify(data.metadata) : null,
      createdAt: now,
      updatedAt: now,
    }).returning();
    
    return this.mapToMessage(record);
  }
  
  // 更新消息
  async updateMessage(
    messageId: string,
    updates: Partial<Pick<Message, 'content' | 'reasoning' | 'status' | 'toolsJson'>>
  ): Promise<void> {
    await db.update(messages)
      .set({
        ...updates,
        updatedAt: Date.now(),
      })
      .where(eq(messages.id, messageId));
  }
  
  // 追加内容（流式更新）
  async appendContent(messageId: string, contentDelta: string): Promise<void> {
    await db.update(messages)
      .set({
        content: sql`${messages.content} || ${contentDelta}`,
        updatedAt: Date.now(),
      })
      .where(eq(messages.id, messageId));
  }
  
  // 完成消息
  async completeMessage(messageId: string): Promise<void> {
    await db.update(messages)
      .set({
        status: 'complete',
        updatedAt: Date.now(),
      })
      .where(eq(messages.id, messageId));
  }
  
  // 标记错误
  async failMessage(messageId: string, error: string): Promise<void> {
    await db.update(messages)
      .set({
        status: 'error',
        metadataJson: JSON.stringify({ error }),
        updatedAt: Date.now(),
      })
      .where(eq(messages.id, messageId));
  }
  
  // 删除单条消息
  async deleteMessage(messageId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, messageId));
  }
  
  // 删除会话的所有消息
  async deleteMessagesByConversationId(conversationId: string): Promise<void> {
    await db.delete(messages)
      .where(eq(messages.conversationId, conversationId));
  }
  
  // 获取会话消息数量
  async getMessageCount(conversationId: string): Promise<number> {
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    return total;
  }
  
  // 映射数据库记录到接口
  private mapToMessage(record: typeof messages.$inferSelect): Message {
    return {
      id: record.id,
      conversationId: record.conversationId,
      role: record.role as Message['role'],
      content: record.content,
      reasoning: record.reasoning ?? undefined,
      toolsJson: record.toolsJson ?? undefined,
      status: record.status as Message['status'],
      agentId: record.agentId ?? undefined,
      parentId: record.parentId ?? undefined,
      metadata: record.metadataJson ? JSON.parse(record.metadataJson) : undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
```

### 1.4 前端状态管理

```typescript
// apps/web/src/stores/message.ts

import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { messageApi } from '@/api/message';
import type { Message, PaginatedMessagesResponse } from '@ims/shared';

export interface MessageState {
  // 按会话 ID 组织的消息
  messagesByConversation: Record<string, Message[]>;
  // 加载状态
  loading: Record<string, boolean>;
  // 错误状态
  errors: Record<string, string | null>;
  // 分页信息
  pagination: Record<string, PaginatedMessagesResponse['pagination']>;
}

export const useMessageStore = defineStore('message', () => {
  // State
  const messagesByConversation = ref<Record<string, Message[]>>({});
  const loading = ref<Record<string, boolean>>({});
  const errors = ref<Record<string, string | null>>({});
  const pagination = ref<Record<string, PaginatedMessagesResponse['pagination']>>({});
  const streamingMessages = ref<Set<string>>(new Set());
  
  // Getters
  const getMessages = computed(() => (conversationId: string) => {
    return messagesByConversation.value[conversationId] ?? [];
  });
  
  const isLoading = computed(() => (conversationId: string) => {
    return loading.value[conversationId] ?? false;
  });
  
  const hasMoreMessages = computed(() => (conversationId: string) => {
    return pagination.value[conversationId]?.hasMore ?? false;
  });
  
  const isStreaming = computed(() => (messageId: string) => {
    return streamingMessages.value.has(messageId);
  });
  
  // Actions
  
  /**
   * 加载会话消息
   */
  async function loadMessages(
    conversationId: string,
    options?: { reset?: boolean; before?: number }
  ): Promise<void> {
    if (loading.value[conversationId]) return;
    
    loading.value[conversationId] = true;
    errors.value[conversationId] = null;
    
    try {
      const response = await messageApi.getMessages(conversationId, {
        page: 1,
        pageSize: 50,
        before: options?.before,
      });
      
      if (options?.reset) {
        messagesByConversation.value[conversationId] = response.messages;
      } else {
        // 追加到开头（历史消息）
        const existing = messagesByConversation.value[conversationId] ?? [];
        messagesByConversation.value[conversationId] = [
          ...response.messages,
          ...existing,
        ];
      }
      
      pagination.value[conversationId] = response.pagination;
    } catch (err) {
      errors.value[conversationId] = err instanceof Error 
        ? err.message 
        : '加载消息失败';
      throw err;
    } finally {
      loading.value[conversationId] = false;
    }
  }
  
  /**
   * 发送消息
   */
  async function sendMessage(
    conversationId: string,
    content: string,
    options?: {
      agentId?: string;
      onStream?: (chunk: string) => void;
    }
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    // 乐观更新：添加用户消息到列表
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId,
      role: 'user',
      content,
      status: 'complete',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    addMessageToConversation(conversationId, tempUserMessage);
    
    try {
      // 调用 API
      const response = await messageApi.sendMessage(conversationId, {
        content,
        agentId: options?.agentId,
      });
      
      // 替换临时消息
      replaceMessage(conversationId, tempUserMessage.id, response.userMessage);
      
      // 添加 AI 消息
      addMessageToConversation(conversationId, response.assistantMessage);
      
      return response;
    } catch (err) {
      // 移除临时消息
      removeMessage(conversationId, tempUserMessage.id);
      throw err;
    }
  }
  
  /**
   * 流式更新消息
   */
  async function streamMessage(
    conversationId: string,
    messageId: string,
    stream: AsyncIterable<string>
  ): Promise<void> {
    streamingMessages.value.add(messageId);
    
    const message = findMessage(conversationId, messageId);
    if (!message) {
      streamingMessages.value.delete(messageId);
      return;
    }
    
    try {
      for await (const chunk of stream) {
        message.content += chunk;
        // 节流：每 500ms 保存一次到后端
      }
      
      // 流式结束，标记完成
      await messageApi.completeMessage(messageId);
      message.status = 'complete';
    } catch (err) {
      message.status = 'error';
      throw err;
    } finally {
      streamingMessages.value.delete(messageId);
    }
  }
  
  /**
   * 更新消息内容（本地 + 后端）
   */
  async function updateMessageContent(
    conversationId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    const message = findMessage(conversationId, messageId);
    if (message) {
      message.content = content;
    }
    await messageApi.updateContent(messageId, { content });
  }
  
  /**
   * 删除消息
   */
  async function deleteMessage(
    conversationId: string,
    messageId: string
  ): Promise<void> {
    await messageApi.deleteMessage(messageId);
    removeMessage(conversationId, messageId);
  }
  
  /**
   * 清空会话消息
   */
  async function clearConversation(conversationId: string): Promise<void> {
    await messageApi.clearMessages(conversationId);
    messagesByConversation.value[conversationId] = [];
    pagination.value[conversationId] = {
      total: 0,
      page: 1,
      pageSize: 50,
      hasMore: false,
    };
  }
  
  // 辅助函数
  function addMessageToConversation(conversationId: string, message: Message): void {
    if (!messagesByConversation.value[conversationId]) {
      messagesByConversation.value[conversationId] = [];
    }
    messagesByConversation.value[conversationId].push(message);
  }
  
  function replaceMessage(
    conversationId: string,
    oldId: string,
    newMessage: Message
  ): void {
    const list = messagesByConversation.value[conversationId];
    if (!list) return;
    
    const index = list.findIndex(m => m.id === oldId);
    if (index !== -1) {
      list[index] = newMessage;
    }
  }
  
  function removeMessage(conversationId: string, messageId: string): void {
    const list = messagesByConversation.value[conversationId];
    if (!list) return;
    
    const index = list.findIndex(m => m.id === messageId);
    if (index !== -1) {
      list.splice(index, 1);
    }
  }
  
  function findMessage(conversationId: string, messageId: string): Message | undefined {
    return messagesByConversation.value[conversationId]?.find(m => m.id === messageId);
  }
  
  return {
    // State
    messagesByConversation,
    loading,
    errors,
    // Getters
    getMessages,
    isLoading,
    hasMoreMessages,
    isStreaming,
    // Actions
    loadMessages,
    sendMessage,
    streamMessage,
    updateMessageContent,
    deleteMessage,
    clearConversation,
  };
});
```

### 1.5 前端 API 客户端

```typescript
// apps/web/src/api/message.ts

import { apiClient } from './client';
import type { 
  Message, 
  CreateMessageRequest,
  PaginatedMessagesResponse 
} from '@ims/shared';

export interface GetMessagesParams {
  page?: number;
  pageSize?: number;
  before?: number;
}

export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage: Message;
}

export const messageApi = {
  // 获取消息列表
  async getMessages(
    conversationId: string,
    params?: GetMessagesParams
  ): Promise<PaginatedMessagesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.before) searchParams.set('before', String(params.before));
    
    const response = await apiClient.get(
      `/api/conversations/${conversationId}/messages?${searchParams}`
    );
    return response.data;
  },
  
  // 发送消息
  async sendMessage(
    conversationId: string,
    data: CreateMessageRequest
  ): Promise<SendMessageResponse> {
    const response = await apiClient.post(
      `/api/conversations/${conversationId}/messages`,
      data
    );
    return response.data;
  },
  
  // 更新消息内容
  async updateContent(
    messageId: string,
    updates: { content?: string; reasoning?: string; status?: string }
  ): Promise<void> {
    await apiClient.patch(`/api/messages/${messageId}/content`, updates);
  },
  
  // 完成消息
  async completeMessage(messageId: string): Promise<void> {
    await apiClient.post(`/api/messages/${messageId}/complete`);
  },
  
  // 删除消息
  async deleteMessage(messageId: string): Promise<void> {
    await apiClient.delete(`/api/messages/${messageId}`);
  },
  
  // 清空会话消息
  async clearMessages(conversationId: string): Promise<void> {
    await apiClient.delete(`/api/conversations/${conversationId}/messages`);
  },
};
```

### 1.6 组件集成

```vue
<!-- apps/web/src/components/lui/AgentChat.vue -->

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useMessageStore } from '@/stores/message';
import { useConversationStore } from '@/stores/conversation';
import type { Message } from '@ims/shared';

interface Props {
  conversationId: string;
  agentId: string;
}

const props = defineProps<Props>();

// Stores
const messageStore = useMessageStore();
const conversationStore = useConversationStore();

// 本地状态
const inputMessage = ref('');
const isSending = ref(false);
const reasoningOpenStates = ref<Record<string, boolean>>({});
const scrollContainer = ref<HTMLElement>();

// 计算属性
const messages = computed(() => messageStore.getMessages(props.conversationId));
const isLoading = computed(() => messageStore.isLoading(props.conversationId));
const currentConversation = computed(() => 
  conversationStore.getConversationById(props.conversationId)
);

// 生命周期
onMounted(async () => {
  // 加载历史消息
  await messageStore.loadMessages(props.conversationId, { reset: true });
  scrollToBottom();
});

// 监听消息变化，自动滚动
watch(
  () => messages.value.length,
  () => {
    nextTick(scrollToBottom);
  }
);

// 发送消息
async function handleSend() {
  const content = inputMessage.value.trim();
  if (!content || isSending.value) return;
  
  inputMessage.value = '';
  isSending.value = true;
  
  try {
    const { assistantMessage } = await messageStore.sendMessage(
      props.conversationId,
      content,
      { agentId: props.agentId }
    );
    
    // 开始流式响应
    const stream = await agentHost.stream(
      props.agentId,
      content,
      { conversationId: props.conversationId }
    );
    
    // 流式更新
    await messageStore.streamMessage(
      props.conversationId,
      assistantMessage.id,
      stream
    );
    
    // 更新会话统计
    await conversationStore.updateStats(props.conversationId);
    
  } catch (error) {
    console.error('发送消息失败:', error);
    // 显示错误提示
  } finally {
    isSending.value = false;
  }
}

// 自动展开思考过程
watch(
  () => messages.value,
  (newMessages) => {
    newMessages.forEach(msg => {
      // 流式传输中的消息自动展开思考过程
      if (msg.status === 'streaming' && msg.reasoning && !reasoningOpenStates.value[msg.id]) {
        reasoningOpenStates.value[msg.id] = true;
      }
    });
  },
  { deep: true }
);

function scrollToBottom() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
}

function toggleReasoning(messageId: string) {
  reasoningOpenStates.value[messageId] = !reasoningOpenStates.value[messageId];
}
</script>

<template>
  <div class="agent-chat flex flex-col h-full">
    <!-- 消息列表 -->
    <div ref="scrollContainer" class="messages-container flex-1 overflow-y-auto p-4">
      <!-- 加载更多 -->
      <div v-if="isLoading" class="flex justify-center py-4">
        <LoadingSpinner />
      </div>
      
      <!-- 消息列表 -->
      <div v-if="messages.length === 0 && !isLoading" class="empty-state">
        <p class="text-muted-foreground text-center py-8">
          开始新对话...
        </p>
      </div>
      
      <template v-else>
        <div
          v-for="message in messages"
          :key="message.id"
          class="message mb-4"
          :class="[`message-${message.role}`]"
        >
          <!-- 用户消息 -->
          <template v-if="message.role === 'user'">
            <div class="flex justify-end">
              <div class="message-bubble user bg-primary text-primary-foreground">
                {{ message.content }}
              </div>
            </div>
          </template>
          
          <!-- AI 消息 -->
          <template v-else-if="message.role === 'assistant'">
            <div class="flex justify-start">
              <div class="message-bubble assistant bg-muted">
                <!-- 思考过程（可折叠） -->
                <Collapsible
                  v-if="message.reasoning"
                  v-model:open="reasoningOpenStates[message.id]"
                >
                  <CollapsibleTrigger class="flex items-center gap-2 text-sm text-muted-foreground">
                    <Brain class="h-4 w-4" />
                    <span>思考过程</span>
                    <ChevronDown
                      class="h-4 w-4 transition-transform"
                      :class="{ 'rotate-180': reasoningOpenStates[message.id] }"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre class="reasoning-content text-xs bg-secondary p-2 rounded mt-2">
                      {{ message.reasoning }}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
                
                <!-- 消息内容 -->
                <div class="message-content mt-2">
                  {{ message.content }}
                </div>
                
                <!-- 流式指示器 -->
                <div v-if="message.status === 'streaming'" class="streaming-indicator">
                  <span class="animate-pulse">●</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>
    </div>
    
    <!-- 输入区域 -->
    <div class="input-area border-t p-4">
      <div class="flex gap-2">
        <Textarea
          v-model="inputMessage"
          placeholder="输入消息..."
          class="flex-1"
          @keydown.enter.prevent="handleSend"
        />
        <Button 
          :disabled="!inputMessage.trim() || isSending" 
          @click="handleSend"
        >
          <Send v-if="!isSending" class="h-4 w-4" />
          <LoadingSpinner v-else class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
```

---

## 2. UI Bug 修复 - 详细方案

### 2.1 Bug 1: 重复会话问题

**问题描述**: 用户创建会话时出现重复条目

**根本原因**: 
- 创建会话时未检查同一候选人的现有会话
- 前端状态更新与后端响应不同步
- 并发创建请求导致重复

**修复方案**:

```typescript
// apps/web/src/stores/conversation.ts

export const useConversationStore = defineStore('conversation', () => {
  // ... 其他代码

  /**
   * 创建会话（带重复检查）
   */
  async function createConversation(data: {
    title: string;
    candidateId?: string;
    agentId: string;
  }): Promise<Conversation> {
    // 1. 检查是否已存在同一候选人的活跃会话
    if (data.candidateId) {
      const existingConversation = conversations.value.find(
        c => c.candidateId === data.candidateId && 
             c.agentId === data.agentId &&
             c.status === 'active'
      );
      
      if (existingConversation) {
        // 复用现有会话，切换过去
        await selectConversation(existingConversation.id);
        return existingConversation;
      }
    }
    
    // 2. 检查是否正在创建中（防止重复点击）
    const existingCreating = conversations.value.find(
      c => c.status === 'creating' && 
           c.candidateId === data.candidateId &&
           c.agentId === data.agentId
    );
    
    if (existingCreating) {
      throw new Error('会话创建中，请稍候');
    }
    
    // 3. 创建乐观更新（临时状态）
    const tempId = `creating-${Date.now()}`;
    const tempConversation: Conversation = {
      id: tempId,
      title: data.title,
      candidateId: data.candidateId,
      agentId: data.agentId,
      status: 'creating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    conversations.value.unshift(tempConversation);
    
    try {
      // 4. 调用后端 API
      const conversation = await conversationApi.create({
        title: data.title,
        candidateId: data.candidateId,
        agentId: data.agentId,
      });
      
      // 5. 替换临时会话
      replaceConversation(tempId, conversation);
      
      // 6. 选中新会话
      await selectConversation(conversation.id);
      
      return conversation;
    } catch (error) {
      // 7. 失败时移除临时会话
      removeConversation(tempId);
      throw error;
    }
  }
  
  // 辅助函数
  function replaceConversation(oldId: string, newConversation: Conversation): void {
    const index = conversations.value.findIndex(c => c.id === oldId);
    if (index !== -1) {
      conversations.value[index] = newConversation;
    }
  }
  
  function removeConversation(id: string): void {
    const index = conversations.value.findIndex(c => c.id === id);
    if (index !== -1) {
      conversations.value.splice(index, 1);
    }
  }
  
  // ... 其他代码
});
```

**后端防重复**:

```typescript
// packages/server/src/services/conversation.ts

export class ConversationService {
  async createConversation(data: CreateConversationRequest): Promise<Conversation> {
    // 检查是否已存在相同候选人和 Agent 的活跃会话
    if (data.candidateId) {
      const existing = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.candidateId, data.candidateId),
          eq(conversations.agentId, data.agentId),
          eq(conversations.status, 'active')
        ),
      });
      
      if (existing) {
        throw new Error('该候选人的会话已存在');
      }
    }
    
    // 创建新会话
    const id = crypto.randomUUID();
    const [conversation] = await db.insert(conversations).values({
      id,
      title: data.title,
      candidateId: data.candidateId ?? null,
      agentId: data.agentId,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).returning();
    
    return conversation;
  }
}
```

### 2.2 Bug 2: 思考阶段展开/收起失效

**问题描述**: 思考阶段（reasoning）展开/收起状态在流式响应过程中失效

**根本原因**: 
- 流式更新时重新渲染消息组件
- 折叠状态存储在组件内部，更新后重置
- 缺少持久化的状态管理

**修复方案**:

```vue
<!-- apps/web/src/components/lui/ReasoningPanel.vue -->

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Brain, ChevronDown } from 'lucide-vue-next';

interface Props {
  messageId: string;
  reasoning: string;
  isStreaming?: boolean;
  defaultOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  defaultOpen: false,
});

// 使用 localStorage 持久化折叠状态
const storageKey = computed(() => `reasoning-open-${props.messageId}`);

const isOpen = ref(props.defaultOpen || props.isStreaming);

// 初始化时从 localStorage 读取
onMounted(() => {
  const saved = localStorage.getItem(storageKey.value);
  if (saved !== null) {
    isOpen.value = saved === 'true';
  }
});

// 流式传输时自动展开
watch(() => props.isStreaming, (streaming) => {
  if (streaming) {
    isOpen.value = true;
  }
});

// 保存状态变化
watch(isOpen, (value) => {
  localStorage.setItem(storageKey.value, String(value));
});

function toggle() {
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <Collapsible v-model:open="isOpen">
    <CollapsibleTrigger 
      class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      @click="toggle"
    >
      <Brain class="h-4 w-4" />
      <span>思考过程</span>
      <ChevronDown
        class="h-4 w-4 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <pre class="reasoning-content text-xs bg-secondary p-3 rounded mt-2 overflow-x-auto">
        <code>{{ reasoning }}</code>
      </pre>
    </CollapsibleContent>
  </Collapsible>
</template>

<style scoped>
.reasoning-content {
  font-family: 'Fira Code', monospace;
  line-height: 1.5;
}
</style>
```

### 2.3 Bug 3: 候选人选择显示

**问题描述**: 候选人点击选择时未显示候选人姓名

**根本原因**: `candidate-selector.vue` 组件中 `SelectValue` 插槽未正确渲染选中项

**修复方案**:

```vue
<!-- apps/web/src/components/lui/candidate-selector.vue -->

<script setup lang="ts">
import { computed } from 'vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-vue-next';
import type { Candidate } from '@ims/shared';

interface Props {
  candidates: Candidate[];
  modelValue?: string | null;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '选择候选人',
});

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  select: [candidate: Candidate];
}>();

const selectedId = computed({
  get: () => props.modelValue ?? '',
  set: (val: string) => {
    emit('update:modelValue', val || null);
    if (val) {
      const candidate = props.candidates.find(c => c.id === val);
      if (candidate) {
        emit('select', candidate);
      }
    }
  },
});

const selectedCandidate = computed(() => {
  if (!selectedId.value) return null;
  return props.candidates.find(c => c.id === selectedId.value);
});
</script>

<template>
  <Select v-model="selectedId">
    <SelectTrigger class="w-full">
      <!-- 修复：使用自定义渲染显示选中值 -->
      <div class="flex items-center gap-2 overflow-hidden">
        <User v-if="!selectedCandidate" class="h-4 w-4 text-muted-foreground" />
        <template v-if="selectedCandidate">
          <span class="font-medium truncate">{{ selectedCandidate.name }}</span>
          <Badge v-if="selectedCandidate.position" variant="secondary" class="text-xs">
            {{ selectedCandidate.position }}
          </Badge>
        </template>
        <span v-else class="text-muted-foreground">{{ placeholder }}</span>
      </div>
    </SelectTrigger>
    
    <SelectContent>
      <SelectItem 
        v-for="candidate in candidates" 
        :key="candidate.id" 
        :value="candidate.id"
      >
        <div class="flex items-center justify-between gap-4 w-full">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ candidate.name }}</span>
            <Badge v-if="candidate.position" variant="secondary">
              {{ candidate.position }}
            </Badge>
          </div>
          <span v-if="candidate.email" class="text-xs text-muted-foreground">
            {{ candidate.email }}
          </span>
        </div>
      </SelectItem>
      
      <div v-if="candidates.length === 0" class="px-2 py-4 text-center text-sm text-muted-foreground">
        暂无候选人
      </div>
    </SelectContent>
  </Select>
</template>
```

---

## 3. Agent 说明简化 - 详细方案

### 3.1 当前问题

```typescript
// 当前复杂的说明
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

### 3.2 简化方案

```typescript
// 简化后的说明
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

### 3.3 组件优化

```vue
<!-- apps/web/src/components/lui/agent-selector.vue -->

<template>
  <div class="agent-selector">
    <Card
      v-for="agent in agents"
      :key="agent.entrySkill"
      class="agent-card cursor-pointer hover:border-primary transition-colors"
      :class="{ 'border-primary': selectedAgent === agent.entrySkill }"
      @click="selectAgent(agent)"
    >
      <CardHeader class="pb-2">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">{{ agent.title }}</CardTitle>
          <Badge v-if="agent.isNew" variant="default">新</Badge>
        </div>
        <CardDescription>{{ agent.subtitle }}</CardDescription>
      </CardHeader>
      
      <CardContent class="pt-0">
        <p class="text-sm text-muted-foreground mb-3">
          {{ agent.description }}
        </p>
        
        <div class="flex flex-wrap gap-1">
          <Badge 
            v-for="skill in agent.skills" 
            :key="skill"
            variant="secondary"
            class="text-xs"
          >
            {{ skill }}
          </Badge>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
// 简化后的 Agent 定义
const agents: AgentProfileView[] = [
  {
    title: "面试专家",
    subtitle: "智能面试助手",
    description: "帮你筛选简历、设计面试题、评估候选人",
    skills: ["简历分析", "题目设计", "综合评估"],
    tools: ["读取简历", "生成题目", "输出报告"],
    entrySkill: "interview-orchestrator",
    supportSkills: [],
  },
  {
    title: "出题助手",
    subtitle: "专业面试题生成",
    description: "根据岗位要求和技能栈生成面试题",
    skills: ["技术题目", "情景题", "算法题"],
    tools: ["生成题目", "难度评估"],
    entrySkill: "question-generator",
    supportSkills: [],
  },
  {
    title: "评估助手",
    subtitle: "面试结果分析",
    description: "分析面试表现，生成评估报告",
    skills: ["能力评估", "综合评价", "报告生成"],
    tools: ["分析表现", "生成报告"],
    entrySkill: "assessment-helper",
    supportSkills: [],
  },
];
</script>
```

---

## 4. 任务清单

| ID | 任务 | 工期 | 依赖 | 优先级 | 验收标准 |
|----|------|------|------|--------|----------|
| P1-T1 | 设计消息数据模型 | 0.5d | - | 高 | Schema 定义完成 |
| P1-T2 | 实现 MessageService 后端服务 | 1.5d | T1 | 高 | 所有 CRUD 操作可运行 |
| P1-T3 | 实现消息 API 路由 | 1d | T2 | 高 | API 测试通过 |
| P1-T4 | 实现前端消息状态管理 | 1d | - | 高 | Store 功能完整 |
| P1-T5 | 集成 AgentChat 组件 | 1d | T3, T4 | 高 | 消息可持久化 |
| P1-T6 | 修复重复会话 Bug | 0.5d | - | 中 | 同一候选人只创建一个会话 |
| P1-T7 | 修复思考展开/收起 Bug | 0.5d | - | 中 | 状态正确保持 |
| P1-T8 | 修复候选人选择显示 Bug | 0.5d | - | 中 | 正确显示姓名 |
| P1-T9 | 简化 Agent 说明 | 0.5d | - | 低 | 文案简化完成 |
| P1-T10 | 集成测试 | 1d | 以上全部 | 高 | 所有功能测试通过 |

**Phase 1 总工期**: 8 天

---

## 5. 依赖关系图

```
Phase 1 任务依赖
├── P1-T1 (数据模型设计)
│   └── P1-T2 (后端服务)
│       └── P1-T3 (API 路由)
│           └── P1-T5 (组件集成)
├── P1-T4 (前端状态管理)
│   └── P1-T5 (组件集成)
├── P1-T6, T7, T8, T9 (Bug 修复和优化)
│   └── P1-T10 (集成测试)
└── P1-T5 + P1-T6~T9
    └── P1-T10 (集成测试)

关键路径: T1 → T2 → T3 → T5 → T10 = 5d
并行路径: T4, T6, T7, T8, T9 可与主路径并行
```

---

**文档完成** ✅