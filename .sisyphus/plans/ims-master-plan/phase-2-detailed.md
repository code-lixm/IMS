# Phase 2: Agent 增强 - 详细技术方案（修正版）

> **目标**: 赋予 Agent 文件操作能力和记忆能力
> **工期**: 12 天（修正：使用后端 SQLite 存储）
> **关键交付物**: Agent 可读写文件、具备短期和长期记忆

---

## 1. Agent 文件操作工具系统

### 1.1 修正：使用后端 SQLite 存储

**修正点**: 原规划使用前端 IndexedDB，修正为使用后端 SQLite，与现有系统一致。

```
原方案: IndexedDB (前端) → 修正为: SQLite (后端)
```

### 1.2 数据模型（后端存储）

```typescript
// packages/server/src/schema.ts 新增（已在 Phase 1 定义）
// fileResources 表已在 phase-1-detailed.md 中定义
```

### 1.3 文件管理 API（扩展 routes.ts）

```typescript
// packages/server/src/routes.ts 新增文件路由

// ========== File Resource 路由 ==========

// 创建文件
app.post("/api/conversations/:conversationId/files", async (c) => {
  const conversationId = c.req.param("conversationId");
  const body = await c.req.json<{
    name: string;
    content: string;
    type: string;
    mimeType?: string;
    createdBy?: "user" | "agent";
    agentId?: string;
  }>();

  const id = crypto.randomUUID();
  const now = new Date();

  // 保存文件内容到本地存储
  const sanitizedName = body.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = join(FILES_STORAGE_DIR, conversationId, `${id}_${sanitizedName}`);
  
  await ensureDir(dirname(storagePath));
  await writeFile(storagePath, body.content, "utf-8");

  // 创建数据库记录
  const [file] = await db.insert(fileResources).values({
    id,
    conversationId,
    name: sanitizedName,
    originalName: body.name,
    type: body.type || "document",
    mimeType: body.mimeType || detectMimeType(body.name),
    size: Buffer.byteLength(body.content, "utf-8"),
    storagePath,
    createdBy: body.createdBy || "user",
    agentId: body.agentId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return c.json(ok(file));
});

// 读取文件
app.get("/api/files/:fileId", async (c) => {
  const fileId = c.req.param("fileId");

  const [file] = await db.select().from(fileResources)
    .where(eq(fileResources.id, fileId))
    .limit(1);

  if (!file) {
    return c.json(fail("File not found"), 404);
  }

  // 读取文件内容
  const content = await readFile(file.storagePath, "utf-8");

  return c.json(ok({ resource: file, content }));
});

// 读取文件内容（Agent 工具用）
app.get("/api/files/:fileId/content", async (c) => {
  const fileId = c.req.param("fileId");

  const [file] = await db.select().from(fileResources)
    .where(eq(fileResources.id, fileId))
    .limit(1);

  if (!file) {
    return c.json(fail("File not found"), 404);
  }

  const content = await readFile(file.storagePath, "utf-8");

  return c.json(ok({ 
    id: file.id,
    name: file.name,
    content 
  }));
});

// 列出会话文件
app.get("/api/conversations/:conversationId/files", async (c) => {
  const conversationId = c.req.param("conversationId");

  const files = await db.select().from(fileResources)
    .where(and(
      eq(fileResources.conversationId, conversationId),
      eq(fileResources.status, "active")
    ))
    .orderBy(desc(fileResources.createdAt));

  return c.json(ok({ files }));
});

// 更新文件
app.patch("/api/files/:fileId", async (c) => {
  const fileId = c.req.param("fileId");
  const body = await c.req.json<{
    content?: string;
    name?: string;
  }>();

  const [existing] = await db.select().from(fileResources)
    .where(eq(fileResources.id, fileId))
    .limit(1);

  if (!existing) {
    return c.json(fail("File not found"), 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name) {
    updates.name = body.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    updates.originalName = body.name;
  }

  if (body.content !== undefined) {
    // 更新文件内容
    await writeFile(existing.storagePath, body.content, "utf-8");
    updates.size = Buffer.byteLength(body.content, "utf-8");
  }

  const [updated] = await db.update(fileResources)
    .set(updates)
    .where(eq(fileResources.id, fileId))
    .returning();

  return c.json(ok(updated));
});

// 删除文件（软删除）
app.delete("/api/files/:fileId", async (c) => {
  const fileId = c.req.param("fileId");

  await db.update(fileResources)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(fileResources.id, fileId));

  return c.json(ok({ deleted: true }));
});

// 下载文件
app.get("/api/files/:fileId/download", async (c) => {
  const fileId = c.req.param("fileId");

  const [file] = await db.select().from(fileResources)
    .where(eq(fileResources.id, fileId))
    .limit(1);

  if (!file) {
    return c.json(fail("File not found"), 404);
  }

  const content = await readFile(file.storagePath);
  const mimeType = file.mimeType || "application/octet-stream";

  return new Response(content, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${file.originalName}"`,
    },
  });
});
```

### 1.4 前端文件服务

```typescript
// apps/web/src/services/file-service.ts 新增

import type { FileResource } from "@/stores/lui/types";

const apiBase = `${import.meta.env.VITE_API_URL || ""}/api`;

export interface FileServiceResult {
  success: boolean;
  file?: FileResource;
  content?: string;
  error?: string;
}

export const fileService = {
  /**
   * 创建文件
   */
  async createFile(
    conversationId: string,
    data: {
      name: string;
      content: string;
      type?: string;
      mimeType?: string;
      createdBy?: "user" | "agent";
      agentId?: string;
    }
  ): Promise<FileServiceResult> {
    try {
      const response = await fetch(`${apiBase}/conversations/${conversationId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Failed to create file: ${response.statusText}`);
      }

      const result = await response.json();
      return { success: true, file: result.data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  },

  /**
   * 读取文件
   */
  async readFile(fileId: string): Promise<FileServiceResult> {
    try {
      const response = await fetch(`${apiBase}/files/${fileId}`);

      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }

      const result = await response.json();
      return { 
        success: true, 
        file: result.data.resource,
        content: result.data.content 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  },

  /**
   * 读取文件内容（Agent 工具用）
   */
  async readFileContent(fileId: string): Promise<string | null> {
    try {
      const response = await fetch(`${apiBase}/files/${fileId}/content`);

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.data.content;
    } catch {
      return null;
    }
  },

  /**
   * 列出会话文件
   */
  async listFiles(conversationId: string): Promise<FileResource[]> {
    const response = await fetch(`${apiBase}/conversations/${conversationId}/files`);
    
    if (!response.ok) {
      return [];
    }

    const result = await response.json();
    return result.data.files || [];
  },

  /**
   * 更新文件
   */
  async updateFile(
    fileId: string,
    updates: { content?: string; name?: string }
  ): Promise<FileServiceResult> {
    try {
      const response = await fetch(`${apiBase}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update file: ${response.statusText}`);
      }

      const result = await response.json();
      return { success: true, file: result.data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  },

  /**
   * 删除文件
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      const response = await fetch(`${apiBase}/files/${fileId}`, {
        method: "DELETE",
      });

      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * 下载文件
   */
  async downloadFile(fileId: string): Promise<void> {
    const response = await fetch(`${apiBase}/files/${fileId}/download`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
```

### 1.5 Agent 文件工具定义

```typescript
// packages/server/src/services/lui-tools.ts 扩展

import { z } from "zod";

// 文件工具定义
export const FILE_TOOLS = {
  readFile: {
    name: "readFile",
    description: "读取当前会话中的文件内容。支持通过文件 ID 或文件名查找。",
    schema: z.object({
      fileIdOrName: z.string().describe("文件 ID 或文件名"),
    }),
  },
  writeFile: {
    name: "writeFile",
    description: "创建或更新文件。如果文件已存在，将覆盖内容。",
    schema: z.object({
      name: z.string().describe("文件名（包含扩展名）"),
      content: z.string().describe("文件内容"),
      type: z.enum(["document", "code", "data", "other"]).describe("文件类型"),
    }),
  },
  listFiles: {
    name: "listFiles",
    description: "列出当前会话中的所有文件。",
    schema: z.object({}),
  },
};

// 实现文件工具
async function executeReadFile(params: { fileIdOrName: string }, context: ToolContext) {
  const { conversationId } = context;
  
  // 先尝试作为 ID 读取
  let fileId = params.fileIdOrName;
  
  // 如果不是 ID，查找同名文件
  if (!fileId.includes("-")) {
    const files = await db.select().from(fileResources)
      .where(and(
        eq(fileResources.conversationId, conversationId),
        eq(fileResources.status, "active")
      ));
    
    const file = files.find(
      (f) => f.name === params.fileIdOrName || f.originalName === params.fileIdOrName
    );
    
    if (!file) {
      return {
        success: false,
        error: `文件 "${params.fileIdOrName}" 不存在`,
        availableFiles: files.map((f) => f.name),
      };
    }
    
    fileId = file.id;
  }
  
  // 读取文件
  const [file] = await db.select().from(fileResources)
    .where(eq(fileResources.id, fileId))
    .limit(1);
  
  if (!file) {
    return { success: false, error: "文件不存在" };
  }
  
  const content = await readFile(file.storagePath, "utf-8");
  
  return {
    success: true,
    fileId: file.id,
    fileName: file.originalName,
    content,
  };
}

async function executeWriteFile(
  params: { name: string; content: string; type: string },
  context: ToolContext
) {
  const { conversationId, agentId } = context;
  
  // 检查是否已存在同名文件
  const existingFiles = await db.select().from(fileResources)
    .where(and(
      eq(fileResources.conversationId, conversationId),
      eq(fileResources.status, "active")
    ));
  
  const existing = existingFiles.find(
    (f) => f.name === params.name || f.originalName === params.name
  );
  
  if (existing) {
    // 更新现有文件
    await writeFile(existing.storagePath, params.content, "utf-8");
    
    await db.update(fileResources)
      .set({
        size: Buffer.byteLength(params.content, "utf-8"),
        updatedAt: new Date(),
      })
      .where(eq(fileResources.id, existing.id));
    
    return {
      success: true,
      fileId: existing.id,
      fileName: params.name,
      isUpdate: true,
    };
  }
  
  // 创建新文件
  const id = crypto.randomUUID();
  const sanitizedName = params.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = join(FILES_STORAGE_DIR, conversationId, `${id}_${sanitizedName}`);
  
  await ensureDir(dirname(storagePath));
  await writeFile(storagePath, params.content, "utf-8");
  
  const now = new Date();
  
  await db.insert(fileResources).values({
    id,
    conversationId,
    name: sanitizedName,
    originalName: params.name,
    type: params.type,
    mimeType: detectMimeType(params.name),
    size: Buffer.byteLength(params.content, "utf-8"),
    storagePath,
    createdBy: "agent",
    agentId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  
  return {
    success: true,
    fileId: id,
    fileName: params.name,
    isUpdate: false,
  };
}

async function executeListFiles(context: ToolContext) {
  const { conversationId } = context;
  
  const files = await db.select().from(fileResources)
    .where(and(
      eq(fileResources.conversationId, conversationId),
      eq(fileResources.status, "active")
    ))
    .orderBy(desc(fileResources.createdAt));
  
  return {
    success: true,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      originalName: f.originalName,
      type: f.type,
      size: f.size,
      createdBy: f.createdBy,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}
```

---

## 2. Agent 记忆系统

### 2.1 修正：使用后端 SQLite 存储

**修正点**: 原规划中记忆系统使用前端 IndexedDB，修正为使用后端 SQLite 存储。

### 2.2 数据模型

```typescript
// packages/server/src/schema.ts 新增

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  type: text("type", { 
    enum: ["fact", "insight", "preference", "experience"] 
  }).notNull(),
  scope: text("scope", { 
    enum: ["global", "session", "candidate"] 
  }).notNull(),
  
  // 关联
  conversationId: text("conversation_id").references(() => conversations.id),
  candidateId: text("candidate_id").references(() => candidates.id),
  agentId: text("agent_id"),
  
  // 内容
  content: text("content").notNull(),
  summary: text("summary"),
  
  // 元数据
  priority: text("priority", { 
    enum: ["high", "medium", "low"] 
  }).notNull().default("medium"),
  tagsJson: text("tags_json"),
  sourceMessageId: text("source_message_id"),
  
  // 使用统计
  accessCount: integer("access_count").notNull().default(0),
  lastAccessedAt: integer("last_accessed_at"),
  
  // 时间戳
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at"),
});
```

### 2.3 记忆 API

```typescript
// packages/server/src/routes.ts 新增记忆路由

// ========== Memory 路由 ==========

// 创建记忆
app.post("/api/memories", async (c) => {
  const body = await c.req.json<{
    type: "fact" | "insight" | "preference" | "experience";
    scope: "global" | "session" | "candidate";
    content: string;
    summary?: string;
    conversationId?: string;
    candidateId?: string;
    agentId?: string;
    priority?: "high" | "medium" | "low";
    tags?: string[];
    expiresAt?: number;
  }>();

  const id = crypto.randomUUID();
  const now = new Date();

  const [memory] = await db.insert(memories).values({
    id,
    type: body.type,
    scope: body.scope,
    conversationId: body.conversationId,
    candidateId: body.candidateId,
    agentId: body.agentId,
    content: body.content,
    summary: body.summary,
    priority: body.priority || "medium",
    tagsJson: body.tags ? JSON.stringify(body.tags) : null,
    accessCount: 0,
    createdAt: now,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  }).returning();

  return c.json(ok(memory));
});

// 检索记忆
app.get("/api/memories", async (c) => {
  const { 
    query, 
    scope, 
    type, 
    conversationId, 
    candidateId,
    limit = "20" 
  } = c.req.query();

  let conditions = [];
  
  // 关键词搜索
  if (query) {
    conditions.push(
      or(
        like(memories.content, `%${query}%`),
        like(memories.summary, `%${query}%`)
      )
    );
  }
  
  // 范围过滤
  if (scope) {
    conditions.push(eq(memories.scope, scope));
  }
  
  // 类型过滤
  if (type) {
    conditions.push(eq(memories.type, type));
  }
  
  // 会话过滤
  if (conversationId) {
    conditions.push(
      or(
        eq(memories.conversationId, conversationId),
        eq(memories.scope, "global")
      )
    );
  }
  
  // 候选人过滤
  if (candidateId) {
    conditions.push(
      or(
        eq(memories.candidateId, candidateId),
        eq(memories.scope, "global")
      )
    );
  }

  const limitNum = Math.min(parseInt(limit) || 20, 50);

  const results = await db.select().from(memories)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(memories.priority), desc(memories.accessCount), desc(memories.createdAt))
    .limit(limitNum);

  // 更新访问统计
  for (const memory of results) {
    await db.update(memories)
      .set({
        accessCount: sql`${memories.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(memories.id, memory.id));
  }

  return c.json(ok({ memories: results }));
});

// 获取会话记忆摘要
app.get("/api/conversations/:conversationId/memory-summary", async (c) => {
  const conversationId = c.req.param("conversationId");

  const sessionMemories = await db.select().from(memories)
    .where(and(
      eq(memories.conversationId, conversationId),
      eq(memories.scope, "session")
    ))
    .orderBy(desc(memories.createdAt))
    .limit(20);

  const keyFacts = sessionMemories
    .filter((m) => m.type === "fact")
    .map((m) => m.content);

  const insights = sessionMemories
    .filter((m) => m.type === "insight")
    .map((m) => m.content);

  return c.json(ok({ keyFacts, insights }));
});

// 删除记忆
app.delete("/api/memories/:memoryId", async (c) => {
  const memoryId = c.req.param("memoryId");
  await db.delete(memories).where(eq(memories.id, memoryId));
  return c.json(ok({ deleted: true }));
});

// 清理过期记忆
app.post("/api/memories/cleanup", async (c) => {
  const result = await db.delete(memories)
    .where(sql`${memories.expiresAt} IS NOT NULL AND ${memories.expiresAt} < NOW()`);
  
  return c.json(ok({ deletedCount: result.changes }));
});
```

### 2.4 记忆检索服务

```typescript
// packages/server/src/services/memory-service.ts 新增

import { db } from "../db";
import { memories } from "../schema";
import { eq, and, or, like, desc, sql } from "drizzle-orm";

export interface MemoryContext {
  globalMemories: string[];
  sessionContext: string;
  keyFacts: string[];
  relevantMemories: string[];
}

export const memoryService = {
  /**
   * 构建 Agent 记忆上下文
   */
  async buildContext(
    conversationId: string,
    query: string,
    options?: {
      candidateId?: string;
      agentId?: string;
      maxItems?: number;
    }
  ): Promise<MemoryContext> {
    const maxItems = options?.maxItems || 10;
    
    // 1. 获取全局记忆
    const globalResults = await db.select().from(memories)
      .where(and(
        eq(memories.scope, "global"),
        eq(memories.priority, "high")
      ))
      .orderBy(desc(memories.accessCount))
      .limit(5);
    
    const globalMemories = globalResults.map((m) => m.content);
    
    // 2. 获取会话记忆摘要
    const sessionResults = await db.select().from(memories)
      .where(and(
        eq(memories.conversationId, conversationId),
        eq(memories.scope, "session")
      ))
      .orderBy(desc(memories.createdAt))
      .limit(10);
    
    const keyFacts = sessionResults
      .filter((m) => m.type === "fact")
      .map((m) => m.content);
    
    const sessionContext = sessionResults
      .map((m) => m.summary || m.content)
      .join("\n");
    
    // 3. 检索相关记忆
    let relevantConditions = [];
    
    if (conversationId) {
      relevantConditions.push(
        or(
          eq(memories.conversationId, conversationId),
          eq(memories.scope, "global")
        )
      );
    }
    
    if (query) {
      relevantConditions.push(
        or(
          like(memories.content, `%${query}%`),
          like(memories.summary, `%${query}%`)
        )
      );
    }
    
    const relevantResults = relevantConditions.length > 0
      ? await db.select().from(memories)
          .where(and(...relevantConditions))
          .orderBy(desc(memories.priority), desc(memories.accessCount))
          .limit(maxItems)
      : [];
    
    const relevantMemories = relevantResults
      .filter((m) => m.content !== sessionContext)
      .map((m) => m.content);
    
    return {
      globalMemories,
      sessionContext,
      keyFacts,
      relevantMemories,
    };
  },
  
  /**
   * 从对话中提取记忆（LLM 调用）
   */
  async extractFromConversation(
    conversationId: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      candidateId?: string;
      agentId?: string;
    }
  ): Promise<void> {
    // 这里需要调用 LLM 提取关键信息
    // 简化实现：直接存储消息摘要作为会话记忆
    
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;
    
    const now = new Date();
    
    // 存储会话摘要
    await db.insert(memories).values({
      id: crypto.randomUUID(),
      type: "insight",
      scope: "session",
      conversationId,
      candidateId: options?.candidateId,
      agentId: options?.agentId,
      content: lastMessage.content.substring(0, 500), // 限制长度
      summary: lastMessage.content.substring(0, 100),
      priority: "medium",
      createdAt: now,
    }).onConflictDoNothing();
  },
};
```

### 2.5 记忆注入 Agent

```typescript
// apps/web/src/agents/memory-integration.ts 新增

import { memoryService } from "@/services/memory-service";

/**
 * 构建带记忆的 System Prompt
 */
export function buildSystemPromptWithMemory(
  basePrompt: string,
  memoryContext: {
    globalMemories: string[];
    sessionContext: string;
    keyFacts: string[];
    relevantMemories: string[];
  }
): string {
  const parts: string[] = [basePrompt];
  
  // 添加全局记忆
  if (memoryContext.globalMemories.length > 0) {
    parts.push("\n【长期记忆】");
    memoryContext.globalMemories.forEach((m) => parts.push(`- ${m}`));
  }
  
  // 添加会话上下文
  if (memoryContext.sessionContext) {
    parts.push("\n【会话背景】");
    parts.push(memoryContext.sessionContext);
  }
  
  // 添加关键事实
  if (memoryContext.keyFacts.length > 0) {
    parts.push("\n【已知信息】");
    memoryContext.keyFacts.forEach((f) => parts.push(`- ${f}`));
  }
  
  // 添加相关记忆
  if (memoryContext.relevantMemories.length > 0) {
    parts.push("\n【相关参考】");
    memoryContext.relevantMemories.forEach((m) => parts.push(`- ${m}`));
  }
  
  return parts.join("\n");
}

/**
 * 在 AgentHost 中集成记忆
 */
export async function enrichAgentContext(
  conversationId: string,
  baseMessage: string,
  options?: {
    candidateId?: string;
    agentId?: string;
  }
): Promise<{
  context: {
    globalMemories: string[];
    sessionContext: string;
    keyFacts: string[];
    relevantMemories: string[];
  };
  enrichedPrompt: string;
}> {
  // 获取记忆上下文
  const memoryContext = await memoryService.buildContext(
    conversationId,
    baseMessage,
    options
  );
  
  return {
    context: memoryContext,
    enrichedPrompt: buildSystemPromptWithMemory(
      "你是一个专业的面试助手。", // 基础 prompt
      memoryContext
    ),
  };
}
```

---

## 3. 任务清单（修正）

| ID | 任务 | 工期 | 依赖 | 优先级 | 验收标准 | 修正说明 |
|----|------|------|------|--------|----------|----------|
| P2-T1 | 设计文件系统数据模型 | 0.5d | P1-T1 | 高 | Schema 扩展完成 | 已在 Phase 1 定义 |
| P2-T2 | 实现文件管理 API | 2d | P1-T2 | 高 | CRUD 操作可用 | 扩展 routes.ts |
| P2-T3 | 实现前端 fileService | 1d | T2 | 高 | 服务层完成 | 新增 file-service.ts |
| P2-T4 | 实现文件操作工具 | 1d | T2 | 高 | Agent 工具可用 | 扩展 lui-tools.ts |
| P2-T5 | 开发文件列表组件 | 1d | T3 | 中 | UI 完成 | 新增 FileResourceList.vue |
| P2-T6 | 设计记忆系统数据模型 | 0.5d | P1-T1 | 高 | Schema 定义完成 | 新增 memories 表 |
| P2-T7 | 实现记忆 API | 1.5d | T6 | 高 | 记忆 CRUD 完整 | 新增 memory-service.ts |
| P2-T8 | 实现记忆检索注入 | 1d | T7 | 高 | Agent 可获得记忆 | 新增 memory-integration.ts |
| P2-T9 | 实现记忆提取功能 | 1d | T7 | 中 | 自动提取对话记忆 | 调用 LLM 提取 |
| P2-T10 | 集成测试 | 1.5d | 以上全部 | 高 | 所有功能测试通过 | - |

**Phase 2 总工期**: 12 天

---

## 4. 依赖关系图（修正）

```
Phase 1 完成
    │
    ▼
Phase 2 任务依赖
├── P2-T1 (文件数据模型) ← P1-T1
├── P2-T2 (文件 API) ← P1-T2
│   ├── P2-T3 (fileService)
│   ├── P2-T4 (文件工具) ← P1-T2
│   └── P2-T5 (文件列表组件) ← T3
├── P2-T6 (记忆数据模型) ← P1-T1
├── P2-T7 (记忆 API) ← T6
│   ├── P2-T8 (记忆注入) ← T7
│   └── P2-T9 (记忆提取) ← T7
└── P2-T10 (集成测试)

关键路径: T1 → T2 → T4 → T10 = 4.5d
        T6 → T7 → T8 → T10 = 4d
文件和记忆可并行开发
```

---

**文档完成** ✅
