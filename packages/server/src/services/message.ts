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
import {
  buildInterviewAssessmentMarkdownFromStructuredData,
  extractStructuredInterviewAssessmentBlock,
} from './document-templates';

type WorkflowAction = 'confirm-round' | 'advance-stage' | 'complete-workflow';

const WORKFLOW_ACTION_MARKER_PATTERN = /<!--\s*workflow-action:(confirm-round|advance-stage|complete-workflow)\s*-->/g;
const WORKFLOW_ACTION_META_KIND = '__workflow_action__';

type StreamChunkLike = {
  type?: unknown;
  text?: unknown;
  delta?: unknown;
  textDelta?: unknown;
  [key: string]: unknown;
};

type StreamChunkPayload = {
  chunk: StreamChunkLike;
};

type StreamFinishPayload = {
  text?: unknown;
  isAborted?: boolean;
};

type StreamErrorPayload = {
  error: unknown;
};

type AssistantStreamPersistenceHandlers = {
  onChunk: (payload: StreamChunkPayload) => Promise<void>;
  onFinish: (payload: StreamFinishPayload) => Promise<void>;
  onError: (payload: StreamErrorPayload) => Promise<void>;
};

const THINK_OPEN_TAG = '<think>';
const THINK_CLOSE_TAG = '</think>';
const STALE_STREAMING_MESSAGE_MS = 2 * 60 * 1000;

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

function parseWorkflowActionMarker(content: string): {
  cleanedContent: string;
  workflowAction: WorkflowAction | null;
} {
  const matches = Array.from(content.matchAll(WORKFLOW_ACTION_MARKER_PATTERN));
  const workflowAction = (matches.at(-1)?.[1] ?? null) as WorkflowAction | null;
  const cleanedContent = content.replace(WORKFLOW_ACTION_MARKER_PATTERN, '').trim();

  return { cleanedContent, workflowAction };
}

function stripFunctionCalls(content: string): string {
  if (!content) {
    return '';
  }
  let cleaned = content;
  cleaned = cleaned.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '');
  cleaned = cleaned.replace(/<function_calls>[\s\S]*$/g, '');
  cleaned = cleaned.replace(/<\/function_calls>/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

function extractEmbeddedReasoning(content: string): {
  content: string;
  reasoning: string | null;
} {
  if (!content) {
    return {
      content: '',
      reasoning: null,
    };
  }

  const trimmedStart = content.trimStart();
  if (!trimmedStart.startsWith(THINK_OPEN_TAG)) {
    return {
      content,
      reasoning: null,
    };
  }

  const leadingWhitespaceLength = content.length - trimmedStart.length;
  const afterOpen = content.slice(leadingWhitespaceLength + THINK_OPEN_TAG.length);
  const closeIndex = afterOpen.indexOf(THINK_CLOSE_TAG);

  if (closeIndex < 0) {
    return {
      content: '',
      reasoning: afterOpen || null,
    };
  }

  return {
    content: afterOpen.slice(closeIndex + THINK_CLOSE_TAG.length).trimStart(),
    reasoning: afterOpen.slice(0, closeIndex) || null,
  };
}

function normalizeDisplayState(message: {
  role: MessageRole;
  content: string;
  reasoning: string | null;
  toolsJson: string | null;
  status: MessageStatus;
  createdAt: number | Date;
}) {
  const extracted = extractEmbeddedReasoning(message.content);
  const reasoning = message.reasoning ?? extracted.reasoning;
  const content = extracted.reasoning ? extracted.content : message.content;
  const createdAt = typeof message.createdAt === 'number'
    ? message.createdAt
    : new Date(message.createdAt).getTime();
  const age = Date.now() - createdAt;
  const hasVisibleContent = content.trim().length > 0 || (reasoning?.trim().length ?? 0) > 0;
  const hasTools = parseStoredToolsJson(message.toolsJson).tools?.length ?? 0;

  const status = message.status === 'streaming'
    && message.role === 'assistant'
    && !hasVisibleContent
    && hasTools === 0
    && age > STALE_STREAMING_MESSAGE_MS
    ? 'error'
    : message.status;

  return {
    content,
    reasoning,
    status,
  };
}

function parseStoredToolsJson(toolsJson: string | null): {
  tools: unknown[] | null;
  workflowAction: WorkflowAction | null;
} {
  if (!toolsJson) {
    return { tools: null, workflowAction: null };
  }

  try {
    const parsed = JSON.parse(toolsJson) as unknown;
    if (!Array.isArray(parsed)) {
      return { tools: null, workflowAction: null };
    }

    let workflowAction: WorkflowAction | null = null;
    const tools = parsed.filter((entry) => {
      if (
        entry
        && typeof entry === 'object'
        && WORKFLOW_ACTION_META_KIND in entry
        && typeof (entry as Record<string, unknown>)[WORKFLOW_ACTION_META_KIND] === 'string'
      ) {
        workflowAction = (entry as Record<string, WorkflowAction>)[WORKFLOW_ACTION_META_KIND];
        return false;
      }
      return true;
    });

    return {
      tools: tools.length > 0 ? tools : null,
      workflowAction,
    };
  } catch {
    return { tools: null, workflowAction: null };
  }
}

function mergeStoredToolsJson(toolsJson: string | null | undefined, workflowAction: WorkflowAction | null): string | null | undefined {
  if (toolsJson === undefined && workflowAction === null) {
    return undefined;
  }

  const parsed = parseStoredToolsJson(toolsJson ?? null);
  const nextEntries = parsed.tools ? [...parsed.tools] : [];
  if (workflowAction) {
    nextEntries.push({ [WORKFLOW_ACTION_META_KIND]: workflowAction });
  }

  return nextEntries.length > 0 ? JSON.stringify(nextEntries) : null;
}

export function getWorkflowActionFromToolsJson(toolsJson: string | null | undefined): WorkflowAction | null {
  return parseStoredToolsJson(toolsJson ?? null).workflowAction;
}

export function serializeMessageData(message: {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  reasoning: string | null;
  toolsJson: string | null;
  status: MessageStatus;
  createdAt: number | Date;
}) {
  const { tools, workflowAction } = parseStoredToolsJson(message.toolsJson);
  const normalized = normalizeDisplayState(message);
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: normalized.content,
    reasoning: normalized.reasoning,
    workflowAction,
    tools,
    status: normalized.status,
    createdAt: typeof message.createdAt === 'number'
      ? message.createdAt
      : new Date(message.createdAt).getTime(),
  };
}

function coerceChunkText(chunk: StreamChunkLike): string {
  const candidates = [chunk.text, chunk.textDelta, chunk.delta];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return '';
}

function isToolLikeChunkType(type: string): boolean {
  return type.startsWith('tool-') || type.startsWith('source');
}

function toSerializableChunk(chunk: StreamChunkLike): Record<string, unknown> {
  return JSON.parse(JSON.stringify(chunk)) as Record<string, unknown>;
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

  async createAssistantStreamingMessage(conversationId: string): Promise<string> {
    const message = await this.createMessage({
      conversationId,
      role: 'assistant',
      content: '',
    });

    return message.id;
  }

  createAssistantStreamPersistenceHandlers(messageId: string): AssistantStreamPersistenceHandlers {
    let finalContent = '';
    let finalReasoning = '';
    let toolEntries: Record<string, unknown>[] = [];
    let queue = Promise.resolve();

    const enqueue = (operation: () => Promise<void>) => {
      queue = queue
        .then(operation)
        .catch((error) => {
          console.error('[message-service] assistant stream persistence failed', {
            messageId,
            error,
          });
        });
      return queue;
    };

    return {
      onChunk: async ({ chunk }) => enqueue(async () => {
        const type = typeof chunk.type === 'string' ? chunk.type : '';
        const text = coerceChunkText(chunk);

        if (type === 'text' || type === 'text-delta') {
          if (!text) {
            return;
          }
          finalContent += text;
          await this.appendContent(messageId, text);
          return;
        }

        if (type === 'reasoning' || type === 'reasoning-delta') {
          if (!text) {
            return;
          }
          finalReasoning += text;
          await this.updateMessage(messageId, { reasoning: finalReasoning });
          return;
        }

        if (type && isToolLikeChunkType(type)) {
          toolEntries = [...toolEntries, toSerializableChunk(chunk)];
          await this.updateMessage(messageId, {
            toolsJson: JSON.stringify(toolEntries),
          });
        }
      }),
      onFinish: async ({ text, isAborted }) => {
        await queue;

        if (isAborted) {
          await this.markError(messageId, finalContent || '消息生成已中止');
          return;
        }

        await this.completeMessage(
          messageId,
          typeof text === 'string' && text.length > 0 ? text : finalContent,
        );
      },
      onError: async ({ error }) => {
        await queue;
        await this.markError(
          messageId,
          error instanceof Error ? error.message : '消息生成失败',
        );
      },
    };
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
      const sanitizedContent = stripFunctionCalls(finalContent);
      const { cleanedContent, workflowAction } = parseWorkflowActionMarker(sanitizedContent);
      const currentMessage = await this.getMessageById(messageId);
      const extracted = extractEmbeddedReasoning(cleanedContent);
      const visibleContent = extracted.reasoning ? extracted.content : cleanedContent;
      const extractedAssessment = extractStructuredInterviewAssessmentBlock(visibleContent);
      updateData.content = extractedAssessment.structuredData
        ? buildInterviewAssessmentMarkdownFromStructuredData(extractedAssessment.structuredData)
        : extractedAssessment.cleanedContent;
      if (!currentMessage?.reasoning && extracted.reasoning) {
        updateData.reasoning = extracted.reasoning;
      }
      updateData.toolsJson = mergeStoredToolsJson(currentMessage?.toolsJson, workflowAction);
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
