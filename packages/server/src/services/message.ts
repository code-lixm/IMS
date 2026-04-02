/**
 * Message Service - 消息持久化管理
 * 
 * 提供消息的 CRUD 操作，支持：
 * - 获取会话消息列表
 * - 创建消息
 * - 更新消息内容（流式追加）
 * - 标记消息完成
 * - 删除会话的所有消息
 */

import { db } from '../db';
import { messages } from '../schema';
import { eq, sql } from 'drizzle-orm';
import type { MessageRole, MessageStatus } from '@ims/shared';

// 类型别名
type MessageRow = typeof messages.$inferSelect;

/**
 * 将数据库行转换为 Message 类型
 */
function toMessage(row: MessageRow): {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  reasoning: string | null;
  toolsJson: string | null;
  status: MessageStatus;
  createdAt: number;
} {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    reasoning: row.reasoning,
    toolsJson: row.toolsJson,
    status: row.status as MessageStatus,
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : new Date(row.createdAt).getTime(),
  };
}

/**
 * MessageService - 消息服务类
 */
export class MessageService {
  /**
   * 获取会话消息列表
   * @param conversationId 会话 ID
   * @param options 分页选项
   * @returns 消息列表（按创建时间升序）
   */
  async getMessages(
    conversationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ messages: ReturnType<typeof toMessage>[]; total: number }> {
    // 获取总数
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    const total = Number(countResult[0]?.count) || 0;

    // 获取消息列表
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(options?.limit ?? 20)
      .offset(options?.offset ?? 0);

    return {
      messages: rows.map(toMessage),
      total,
    };
  }

  /**
   * 获取单条消息
   * @param messageId 消息 ID
   * @returns 消息或 null
   */
  async getMessageById(messageId: string): Promise<ReturnType<typeof toMessage> | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    return row ? toMessage(row) : null;
  }

  /**
   * 创建新消息
   * @param data 消息数据
   * @returns 创建的消息
   */
  async createMessage(data: {
    conversationId: string;
    role: MessageRole;
    content: string;
    reasoning?: string;
    toolsJson?: string;
  }): Promise<ReturnType<typeof toMessage>> {
    const id = `msg_${crypto.randomUUID()}`;
    const now = new Date();

    const [row] = await db
      .insert(messages)
      .values({
        id,
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        reasoning: data.reasoning || null,
        toolsJson: data.toolsJson || null,
        status: 'streaming',
        createdAt: now,
      })
      .returning();

    return toMessage(row);
  }

  /**
   * 更新消息内容（用于流式追加）
   * @param messageId 消息 ID
   * @param contentDelta 追加的内容增量
   */
  async appendContent(messageId: string, contentDelta: string): Promise<void> {
    await db
      .update(messages)
      .set({
        content: sql`${messages.content} || ${contentDelta}`,
      })
      .where(eq(messages.id, messageId));
  }

  /**
   * 更新消息（完整替换内容）
   * @param messageId 消息 ID
   * @param updates 更新的字段
   */
  async updateMessage(
    messageId: string,
    updates: {
      content?: string;
      reasoning?: string;
      toolsJson?: string;
      status?: MessageStatus;
    }
  ): Promise<ReturnType<typeof toMessage> | null> {
    const updateData: Partial<typeof messages.$inferInsert> = {};

    if (updates.content !== undefined) {
      updateData.content = updates.content;
    }
    if (updates.reasoning !== undefined) {
      updateData.reasoning = updates.reasoning;
    }
    if (updates.toolsJson !== undefined) {
      updateData.toolsJson = updates.toolsJson;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getMessageById(messageId);
    }

    const [row] = await db
      .update(messages)
      .set(updateData)
      .where(eq(messages.id, messageId))
      .returning();

    return row ? toMessage(row) : null;
  }

  /**
   * 标记消息为已完成
   * @param messageId 消息 ID
   * @param finalContent 最终内容（可选）
   */
  async completeMessage(
    messageId: string,
    finalContent?: string
  ): Promise<ReturnType<typeof toMessage> | null> {
    const updateData: Partial<typeof messages.$inferInsert> = {
      status: 'complete',
    };

    if (finalContent !== undefined) {
      updateData.content = finalContent;
    }

    const [row] = await db
      .update(messages)
      .set(updateData)
      .where(eq(messages.id, messageId))
      .returning();

    return row ? toMessage(row) : null;
  }

  /**
   * 标记消息为错误状态
   * @param messageId 消息 ID
   * @param errorContent 错误信息内容
   */
  async markError(messageId: string, errorContent?: string): Promise<ReturnType<typeof toMessage> | null> {
    const updateData: Partial<typeof messages.$inferInsert> = {
      status: 'error',
    };

    if (errorContent !== undefined) {
      updateData.content = errorContent;
    }

    const [row] = await db
      .update(messages)
      .set(updateData)
      .where(eq(messages.id, messageId))
      .returning();

    return row ? toMessage(row) : null;
  }

  /**
   * 删除单条消息
   * @param messageId 消息 ID
   * @returns 是否成功删除
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(messages)
      .where(eq(messages.id, messageId))
      .returning();

    return !deleted;
  }

  /**
   * 删除会话的所有消息
   * @param conversationId 会话 ID
   * @returns 删除的消息数量
   */
  async deleteMessagesByConversation(conversationId: string): Promise<number> {
    const result = await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId))
      .returning();

    return result.length;
  }
}

// 导出单例
export const messageService = new MessageService();
