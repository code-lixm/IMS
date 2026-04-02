/**
 * Agent Memory Service - 全局记忆系统
 *
 * 提供 Agent 记忆的 CRUD 操作，支持事实、洞察和偏好三种类型。
 */

import { db } from "../db";
import { memories } from "../schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { MemoryType, MemoryScope } from "@ims/shared";

export interface CreateMemoryInput {
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  importance?: number;
  embedding?: string | null;
}

export interface UpdateMemoryInput {
  content?: string;
  importance?: number;
  embedding?: string | null;
}

export interface MemoryFilters {
  type?: MemoryType;
  scope?: MemoryScope;
  limit?: number;
  offset?: number;
}

/**
 * 创建新记忆
 */
export async function createMemory(
  data: CreateMemoryInput
): Promise<{
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  importance: number;
  embedding: string | null;
  createdAt: Date;
}> {
  const now = new Date();
  const [memory] = await db
    .insert(memories)
    .values({
      id: crypto.randomUUID(),
      type: data.type,
      scope: data.scope,
      content: data.content,
      embedding: data.embedding ?? null,
      importance: data.importance ?? 5,
      createdAt: now,
    })
    .returning();

  return memory;
}

/**
 * 获取记忆列表
 */
export async function getMemories(
  filters: MemoryFilters = {}
): Promise<{
  memories: Array<{
    id: string;
    type: MemoryType;
    scope: MemoryScope;
    content: string;
    importance: number;
    embedding: string | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const { type, scope, limit = 50, offset = 0 } = filters;

  // Build where conditions
  const conditions = [];
  if (type) {
    conditions.push(eq(memories.type, type));
  }
  if (scope) {
    conditions.push(eq(memories.scope, scope));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(memories)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  // Get memories
  const results = await db
    .select()
    .from(memories)
    .where(whereClause)
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    memories: results,
    total,
  };
}

/**
 * 根据 ID 获取单条记忆
 */
export async function getMemoryById(
  id: string
): Promise<{
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  importance: number;
  embedding: string | null;
  createdAt: Date;
} | null> {
  const [memory] = await db
    .select()
    .from(memories)
    .where(eq(memories.id, id))
    .limit(1);

  return memory ?? null;
}

/**
 * 更新记忆
 */
export async function updateMemory(
  id: string,
  data: UpdateMemoryInput
): Promise<{
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  importance: number;
  embedding: string | null;
  createdAt: Date;
} | null> {
  const updateData: Record<string, unknown> = {};

  if (data.content !== undefined) {
    updateData.content = data.content;
  }
  if (data.importance !== undefined) {
    updateData.importance = data.importance;
  }
  if (data.embedding !== undefined) {
    updateData.embedding = data.embedding;
  }

  const [memory] = await db
    .update(memories)
    .set(updateData)
    .where(eq(memories.id, id))
    .returning();

  return memory ?? null;
}

/**
 * 删除记忆
 */
export async function deleteMemory(id: string): Promise<boolean> {
  const memory = await getMemoryById(id);
  if (!memory) {
    return false;
  }
  await db.delete(memories).where(eq(memories.id, id));
  return true;
}

/**
 * 根据重要性获取记忆（用于 Agent 上下文注入）
 */
export async function getMemoriesByImportance(
  minImportance: number = 5,
  limit: number = 10
): Promise<
  Array<{
    id: string;
    type: MemoryType;
    scope: MemoryScope;
    content: string;
    importance: number;
    createdAt: Date;
  }>
> {
  const results = await db
    .select({
      id: memories.id,
      type: memories.type,
      scope: memories.scope,
      content: memories.content,
      importance: memories.importance,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(sql`${memories.importance} >= ${minImportance}`)
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(limit);

  return results;
}
