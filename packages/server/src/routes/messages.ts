/**
 * Messages Routes - 消息 CRUD API 路由
 *
 * 提供消息的 REST API 接口：
 * - GET  /api/messages/conversations/:id - 获取会话消息列表
 * - POST /api/messages/conversations/:id - 创建新消息
 * - GET  /api/messages/:id - 获取单条消息
 * - PUT  /api/messages/:id - 更新消息
 * - POST /api/messages/:id/complete - 标记消息完成
 * - DELETE /api/messages/:id - 删除消息
 * - DELETE /api/messages/conversations/:id - 删除会话所有消息
 */

import { messageService } from "../services/message";
import { corsHeaders, ok, fail } from "../utils/http";
import type { MessageRole, MessageStatus } from "@ims/shared";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

/**
 * 注册消息路由
 */
export async function messagesRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS 预检
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET /api/messages/conversations/:conversationId - 获取会话消息列表
  const conversationMessagesMatch = path.match(/^\/api\/messages\/conversations\/([^/]+)$/);
  if (conversationMessagesMatch) {
    const conversationId = conversationMessagesMatch[1];

    if (request.method === "GET") {
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

      try {
        const result = await messageService.getMessages(conversationId, { limit, offset });
        return ok({
          messages: result.messages,
          total: result.total,
        });
      } catch (error) {
        console.error("[messages] Failed to get messages:", error);
        return fail("INTERNAL_ERROR", "Failed to get messages", 500);
      }
    }

    if (request.method === "POST") {
      try {
        const body = await parseJson<{
          content: string;
          role: "user" | "assistant" | "system";
          reasoning?: string;
          toolsJson?: string;
        }>(request);

        if (!body.content?.trim()) {
          return fail("VALIDATION_ERROR", "content is required", 422);
        }

        if (!body.role || !["user", "assistant", "system"].includes(body.role)) {
          return fail("VALIDATION_ERROR", "role must be user, assistant, or system", 422);
        }

        const message = await messageService.createMessage({
          conversationId,
          role: body.role as MessageRole,
          content: body.content.trim(),
          reasoning: body.reasoning,
          toolsJson: body.toolsJson,
        });

        return ok(message, { status: 201 });
      } catch (error) {
        console.error("[messages] Failed to create message:", error);
        return fail("INTERNAL_ERROR", "Failed to create message", 500);
      }
    }

    if (request.method === "DELETE") {
      try {
        const count = await messageService.deleteMessagesByConversation(conversationId);
        return ok({ success: true, deletedCount: count });
      } catch (error) {
        console.error("[messages] Failed to delete messages:", error);
        return fail("INTERNAL_ERROR", "Failed to delete messages", 500);
      }
    }
  }

  // GET|PUT|DELETE /api/messages/:messageId - 单条消息操作
  const messageMatch = path.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch) {
    const messageId = messageMatch[1];

    if (request.method === "GET") {
      try {
        const message = await messageService.getMessageById(messageId);
        if (!message) {
          return fail("NOT_FOUND", "Message not found", 404);
        }
        return ok(message);
      } catch (error) {
        console.error("[messages] Failed to get message:", error);
        return fail("INTERNAL_ERROR", "Failed to get message", 500);
      }
    }

    if (request.method === "PUT") {
      try {
        const body = await parseJson<{
          content?: string;
          reasoning?: string;
          toolsJson?: string;
          status?: MessageStatus;
        }>(request);

        const message = await messageService.updateMessage(messageId, body);
        if (!message) {
          return fail("NOT_FOUND", "Message not found", 404);
        }
        return ok(message);
      } catch (error) {
        console.error("[messages] Failed to update message:", error);
        return fail("INTERNAL_ERROR", "Failed to update message", 500);
      }
    }

    if (request.method === "DELETE") {
      try {
        await messageService.deleteMessage(messageId);
        return ok({ success: true, deletedId: messageId });
      } catch (error) {
        console.error("[messages] Failed to delete message:", error);
        return fail("INTERNAL_ERROR", "Failed to delete message", 500);
      }
    }
  }

  // POST /api/messages/:conversationId/:messageId/complete - 标记消息完成
  const completeMatch = path.match(/^\/api\/messages\/([^/]+)\/([^/]+)\/complete$/);
  if (completeMatch && request.method === "POST") {
    const messageId = completeMatch[2];

    try {
      const body = await parseJson<{ content?: string }>(request);
      const message = await messageService.completeMessage(messageId, body?.content);
      if (!message) {
        return fail("NOT_FOUND", "Message not found", 404);
      }
      return ok(message);
    } catch (error) {
      console.error("[messages] Failed to complete message:", error);
      return fail("INTERNAL_ERROR", "Failed to complete message", 500);
    }
  }

  return null;
}
