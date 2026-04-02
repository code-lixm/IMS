/**
 * Session Memory Service - 会话记忆系统
 *
 * 提供会话级别记忆的 CRUD 操作，支持上下文、摘要、决策和待办事项四种类型。
 */

import { db } from "../db";
import { sessionMemories } from "../schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import type { SessionMemoryType } from "@ims/shared";

export interface CreateSessionMemoryInput {
  conversationId: string;
  type: SessionMemoryType;
  content: string;
  metadata?: Record<string, unknown> | null;
  importance?: number;
  expiresAt?: Date | null;
}

export interface UpdateSessionMemoryInput {
  content?: string;
  metadata?: Record<string, unknown> | null;
  importance?: number;
  expiresAt?: Date | null;
}

export interface SessionMemoryFilters {
  conversationId?: string;
  type?: SessionMemoryType;
  limit?: number;
  offset?: number;
  includeExpired?: boolean;
}

/**
 * 创建新会话记忆
 */
export async function createSessionMemory(
  data: CreateSessionMemoryInput
): Promise<{
  id: string;
  conversationId: string;
  type: SessionMemoryType;
  content: string;
  metadata: Record<string, unknown> | null;
  importance: number;
  createdAt: Date;
  expiresAt: Date | null;
}> {
  const now = new Date();
  const [memory] = await db
    .insert(sessionMemories)
    .values({
      id: crypto.randomUUID(),
      conversationId: data.conversationId,
      type: data.type,
      content: data.content,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      importance: data.importance ?? 5,
      createdAt: now,
      expiresAt: data.expiresAt ?? null,
    })
    .returning();

  return {
    ...memory,
    metadata: memory.metadata ? JSON.parse(memory.metadata) : null,
  };
}

/**
 * 获取会话记忆列表
 */
export async function getSessionMemories(
  filters: SessionMemoryFilters = {}
): Promise<{
  memories: Array<{
    id: string;
    conversationId: string;
    type: SessionMemoryType;
    content: string;
    metadata: Record<string, unknown> | null;
    importance: number;
    createdAt: Date;
    expiresAt: Date | null;
  }>;
  total: number;
}> {
  const { conversationId, type, limit = 50, offset = 0, includeExpired = false } = filters;

  // Build where conditions
  const conditions = [];
  if (conversationId) {
    conditions.push(eq(sessionMemories.conversationId, conversationId));
  }
  if (type) {
    conditions.push(eq(sessionMemories.type, type));
  }
  // Filter out expired memories unless explicitly included
  if (!includeExpired) {
    conditions.push(
      sql`(${sessionMemories.expiresAt} IS NULL OR ${sessionMemories.expiresAt} > NOW())`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessionMemories)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  // Get memories
  const results = await db
    .select()
    .from(sessionMemories)
    .where(whereClause)
    .orderBy(desc(sessionMemories.importance), desc(sessionMemories.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    memories: results.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    })),
    total,
  };
}

/**
 * 根据 ID 获取单条会话记忆
 */
export async function getSessionMemoryById(
  id: string
): Promise<{
  id: string;
  conversationId: string;
  type: SessionMemoryType;
  content: string;
  metadata: Record<string, unknown> | null;
  importance: number;
  createdAt: Date;
  expiresAt: Date | null;
} | null> {
  const [memory] = await db
    .select()
    .from(sessionMemories)
    .where(eq(sessionMemories.id, id))
    .limit(1);

  if (!memory) return null;

  return {
    ...memory,
    metadata: memory.metadata ? JSON.parse(memory.metadata) : null,
  };
}

/**
 * 更新会话记忆
 */
export async function updateSessionMemory(
  id: string,
  data: UpdateSessionMemoryInput
): Promise<{
  id: string;
  conversationId: string;
  type: SessionMemoryType;
  content: string;
  metadata: Record<string, unknown> | null;
  importance: number;
  createdAt: Date;
  expiresAt: Date | null;
} | null> {
  const updateData: Record<string, unknown> = {};

  if (data.content !== undefined) {
    updateData.content = data.content;
  }
  if (data.metadata !== undefined) {
    updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;
  }
  if (data.importance !== undefined) {
    updateData.importance = data.importance;
  }
  if (data.expiresAt !== undefined) {
    updateData.expiresAt = data.expiresAt;
  }

  const [memory] = await db
    .update(sessionMemories)
    .set(updateData)
    .where(eq(sessionMemories.id, id))
    .returning();

  if (!memory) return null;

  return {
    ...memory,
    metadata: memory.metadata ? JSON.parse(memory.metadata) : null,
  };
}

/**
 * 删除会话记忆
 */
export async function deleteSessionMemory(id: string): Promise<boolean> {
  const memory = await getSessionMemoryById(id);
  if (!memory) {
    return false;
  }
  await db.delete(sessionMemories).where(eq(sessionMemories.id, id));
  return true;
}

/**
 * 删除会话的所有记忆
 */
export async function deleteSessionMemoriesByConversation(
  conversationId: string
): Promise<number> {
  const deleted = await db
    .delete(sessionMemories)
    .where(eq(sessionMemories.conversationId, conversationId))
    .returning({ id: sessionMemories.id });
  return deleted.length;
}

/**
 * 清理过期的会话记忆
 */
export async function cleanupExpiredSessionMemories(): Promise<number> {
  const deleted = await db
    .delete(sessionMemories)
    .where(sql`${sessionMemories.expiresAt} IS NOT NULL AND ${sessionMemories.expiresAt} < NOW()`)
    .returning({ id: sessionMemories.id });
  return deleted.length;
}

/**
 * 根据会话获取摘要类记忆（用于 Agent 上下文注入）
 */
export async function getSessionSummaries(
  conversationId: string,
  limit: number = 5
): Promise<
  Array<{
    id: string;
    type: SessionMemoryType;
    content: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }>
> {
  const results = await db
    .select({
      id: sessionMemories.id,
      type: sessionMemories.type,
      content: sessionMemories.content,
      metadata: sessionMemories.metadata,
      createdAt: sessionMemories.createdAt,
    })
    .from(sessionMemories)
    .where(
      and(
        eq(sessionMemories.conversationId, conversationId),
        eq(sessionMemories.type, "summary"),
        sql`(${sessionMemories.expiresAt} IS NULL OR ${sessionMemories.expiresAt} > NOW())`
      )
    )
    .orderBy(desc(sessionMemories.createdAt))
    .limit(limit);

  return results.map((r) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

/**
 * 根据会话获取待办事项
 */
export async function getSessionActionItems(
  conversationId: string
): Promise<
  Array<{
    id: string;
    content: string;
    metadata: Record<string, unknown> | null;
    importance: number;
    createdAt: Date;
  }>
> {
  const results = await db
    .select({
      id: sessionMemories.id,
      content: sessionMemories.content,
      metadata: sessionMemories.metadata,
      importance: sessionMemories.importance,
      createdAt: sessionMemories.createdAt,
    })
    .from(sessionMemories)
    .where(
      and(
        eq(sessionMemories.conversationId, conversationId),
        eq(sessionMemories.type, "action_item"),
        sql`(${sessionMemories.expiresAt} IS NULL OR ${sessionMemories.expiresAt} > NOW())`
      )
    )
    .orderBy(desc(sessionMemories.importance), desc(sessionMemories.createdAt));

  return results.map((r) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}
