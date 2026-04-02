# Phase 1: Agent 基础能力 - 详细技术方案（修正版 v2）

> **目标**: 解决数据丢失和基础体验问题
> **工期**: 8 天（修正：使用现有架构）
> **关键交付物**: 消息可持久化、UI Bug 修复、Agent 说明简化

---

## 0. 前置条件：Schema 对齐（Phase 0）

### 0.1 现有 Schema 分析

根据 `packages/server/src/schema.ts` 现有结构：

```typescript
// 现有 conversations 表（已存在）
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  candidateId: text("candidate_id").references(() => candidates.id),
  agentId: text("agent_id"),
  // ...
});
```

**发现**: 现有 schema 已有 `conversations` 表，但缺少：
- `messages` 表（核心缺失）
- `fileResources` 表（引用但未定义）

### 0.2 Schema 扩展方案

```typescript
// packages/server/src/schema.ts 新增

// LUI - Message（新增）
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull().default(""),
  reasoning: text("reasoning"),
  toolsJson: text("tools_json"),
  status: text("status", { enum: ["streaming", "complete", "error"] }).notNull().default("streaming"),
  agentId: text("agent_id"),
  parentId: text("parent_id"),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// LUI - FileResource（新增）
export const fileResources = sqliteTable("file_resources", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => conversations.id),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  type: text("type").notNull(),
  mimeType: text("mime_type"),
  size: integer("size").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  summary: text("summary"),
  createdBy: text("created_by", { enum: ["user", "agent"] }),
  agentId: text("agent_id"),
  status: text("status", { enum: ["active", "archived", "deleted"] }).notNull().default("active"),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

---

## 1. 消息持久化系统

### 1.1 与现有系统集成

**现有架构**:
- 使用 `createLuiMessageModule` 工厂模式（`stores/lui/messages.ts`）
- 使用 `luiApi` 而非 `messageApi`
- 集成到 `useLuiStore`

### 1.2 API 设计（扩展现有 routes.ts）

```typescript
// packages/server/src/routes.ts 新增路由

// ========== Message 路由 ==========

app.post("/api/conversations/:conversationId/messages", async (c) => {
  const conversationId = c.req.param("conversationId");
  const body = await c.req.json();

  // 验证会话存在
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return c.json(fail("Conversation not found"), 404);
  }

  // 创建消息
  const id = crypto.randomUUID();
  const now = new Date();

  const [userMsg] = await db.insert(messages).values({
    id,
    conversationId,
    role: body.role || "user",
    content: body.content,
    agentId: body.agentId,
    parentId: body.parentId,
    status: "complete",
    createdAt: now,
    updatedAt: now,
  }).returning();

  // 创建 AI 响应占位
  let assistantMsg = null;
  if (body.role === "user" || !body.role) {
    const assistantId = crypto.randomUUID();
    [assistantMsg] = await db.insert(messages).values({
      id: assistantId,
      conversationId,
      role: "assistant",
      content: "",
      agentId: body.agentId || conversation.agentId,
      parentId: id,
      status: "streaming",
      createdAt: now,
      updatedAt: now,
    }).returning();
  }

  return c.json(ok({ userMessage: userMsg, assistantMessage: assistantMsg }));
});

app.get("/api/conversations/:conversationId/messages", async (c) => {
  const conversationId = c.req.param("conversationId");
  const { limit = "50" } = c.req.query();

  const limitNum = Math.min(parseInt(limit) || 50, 100);
  
  const results = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limitNum);

  // 反转顺序（按时间正序返回）
  const orderedMessages = results.reverse();

  return c.json(ok({ messages: orderedMessages }));
});

app.patch("/api/messages/:messageId", async (c) => {
  const messageId = c.req.param("messageId");
  const body = await c.req.json();

  const updates = { updatedAt: new Date() };
  if (body.content !== undefined) updates.content = body.content;
  if (body.reasoning !== undefined) updates.reasoning = body.reasoning;
  if (body.toolsJson !== undefined) updates.toolsJson = body.toolsJson;
  if (body.status !== undefined) updates.status = body.status;

  const [updated] = await db.update(messages)
    .set(updates)
    .where(eq(messages.id, messageId))
    .returning();

  if (!updated) {
    return c.json(fail("Message not found"), 404);
  }

  return c.json(ok(updated));
});

app.post("/api/messages/:messageId/complete", async (c) => {
  const messageId = c.req.param("messageId");

  const [updated] = await db.update(messages)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(messages.id, messageId))
    .returning();

  return c.json(ok(updated));
});
```

### 1.3 前端 Store 扩展

**修正**: 扩展现有 `createLuiMessageModule`，而非新建 store。

```typescript
// apps/web/src/stores/lui/messages.ts 扩展

import { luiApi } from "@/api/lui"; // 现有 API
import type { Message } from "./types";

export function createLuiMessageModule(options: LuiMessageModuleOptions): LuiMessageModule {
  const apiBase = `${getServerUrl()}/api`;

  // 扩展现有方法：sendMessage
  async function sendMessage(conversationId: string, content: string): Promise<void> {
    const response = await fetch(`${apiBase}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    const result = await response.json();
    const { userMessage, assistantMessage } = result.data;

    // 添加到本地状态
    addMessage(conversationId, userMessage);
    if (assistantMessage) {
      addMessage(conversationId, assistantMessage);
    }
  }

  // 新增方法：loadMessages
  async function loadMessages(conversationId: string): Promise<void> {
    const response = await fetch(`${apiBase}/conversations/${conversationId}/messages?limit=50`);

    if (!response.ok) {
      throw new Error(`Failed to load messages`);
    }

    const result = await response.json();
    const serverMessages = result.data.messages;

    // 更新本地状态
    messages.value[conversationId] = serverMessages;
  }

  // 新增方法：updateStreamingMessage
  function updateStreamingMessage(conversationId: string, messageId: string, chunk: string) {
    const msgList = messages.value[conversationId];
    if (msgList) {
      const msg = msgList.find(m => m.id === messageId);
      if (msg) {
        msg.content += chunk;
        msg.status = "streaming";
      }
    }
  }

  // 新增方法：completeStreamingMessage
  async function completeStreamingMessage(conversationId: string, messageId: string) {
    const msgList = messages.value[conversationId];
    if (msgList) {
      const msg = msgList.find(m => m.id === messageId);
      if (msg) {
        msg.status = "complete";
      }
    }

    await fetch(`${apiBase}/messages/${messageId}/complete`, { method: "POST" });
  }

  return {
    // ... existing exports
    sendMessage,
    loadMessages,
    updateStreamingMessage,
    completeStreamingMessage,
  };
}
```

---

## 2. UI Bug 修复

### 2.1 Bug 1: 重复会话问题

**修复**: 在 `createLuiConversationModule` 中添加重复检查。

```typescript
// apps/web/src/stores/lui/conversations.ts 扩展

async function createConversation(data: {
  title: string;
  candidateId?: string;
  agentId?: string;
}): Promise<Conversation> {
  // 1. 检查重复
  if (data.candidateId) {
    const existing = conversations.value.find(
      (c) => c.candidateId === data.candidateId && c.status === "active"
    );
    if (existing) {
      await selectConversation(existing.id);
      return existing;
    }
  }

  // 2. 调用 API
  const response = await fetch(`${apiBase}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  const conversation = result.data;

  // 3. 更新本地状态
  conversations.value.unshift(conversation);
  await selectConversation(conversation.id);

  return conversation;
}
```

### 2.2 已确认正常的功能

以下功能**无需修复**：

| 功能 | 状态 | 证据 |
|------|------|------|
| candidate-selector 显示 | ✅ 正常 | `candidate-selector.vue:22-24` 已正确显示 `{{ currentCandidate?.name }}` |
| reasoning 展开/收起 | ⚪ 不适用 | 当前 AI Gateway 不输出 reasoning 字段，无需实现 |

---

## 3. Agent 说明简化

```typescript
// apps/web/src/agents/builtin/index.ts 修正

export const AGENT_PROFILES = {
  "interview-orchestrator": {
    title: "面试专家",
    subtitle: "智能面试助手",
    description: "帮你筛选简历、设计面试题、评估候选人",
    skills: ["简历分析", "题目设计", "综合评估"],
  },
};
```

---

## 4. 任务清单（修正）

| ID | 任务 | 工期 | 依赖 | 优先级 | 修正说明 |
|----|------|------|------|--------|----------|
| P1-T0 | Phase 0: Schema 对齐评审 | 2d | - | 高 | 分析现有 schema |
| P1-T1 | 设计消息数据模型 | 0.5d | T0 | 高 | Schema 扩展 |
| P1-T2 | 实现消息 API 路由 | 1.5d | T1 | 高 | 扩展 routes.ts |
| P1-T3 | 扩展 messageModule | 1d | T2 | 高 | 扩展 lui/messages.ts |
| P1-T4 | 修复重复会话 Bug | 0.5d | - | 中 | 扩展 conversations.ts |
| P1-T5 | 简化 Agent 说明 | 0.5d | - | 低 | 修正 builtin/index.ts |
| P1-T6 | 集成测试 | 1d | 以上全部 | 高 | - |

**删除的任务**:
- ❌ 修复 candidateselector Bug - 已正常
- ❌ reasoning 展开/收起 - AI Gateway 不支持

**Phase 1 总工期**: 8 天

---

## 5. 依赖关系图

```
Phase 0: Schema 对齐 (2d)
    │
    ▼
P1-T1 (数据模型) ← T0
    │
    ▼
P1-T2 (API 路由) ← T1
    │
    ▼
P1-T3 (messageModule) ← T2
    │
    ▼
P1-T6 (集成测试)

并行: P1-T4, P1-T5 可与主路径并行
```

---

**文档完成** ✅
