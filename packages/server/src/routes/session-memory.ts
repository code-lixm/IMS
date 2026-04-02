/**
 * Session Memory Routes - 会话记忆 API 路由
 *
 * 提供会话记忆的 REST API 接口。
 */

import {
  createSessionMemory,
  getSessionMemories,
  getSessionMemoryById,
  updateSessionMemory,
  deleteSessionMemory,
  deleteSessionMemoriesByConversation,
  cleanupExpiredSessionMemories,
} from "../services/session-memory";
import { corsHeaders, ok, fail } from "../utils/http";
import type { SessionMemoryType } from "@ims/shared";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

/**
 * 注册会话记忆路由
 */
export async function sessionMemoryRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS 预检
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET /api/session-memories - 获取会话记忆列表
  if (path === "/api/session-memories" && request.method === "GET") {
    const conversationId = url.searchParams.get("conversationId") || undefined;
    const type = url.searchParams.get("type") as SessionMemoryType | undefined;
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
    const includeExpired = url.searchParams.get("includeExpired") === "true";

    try {
      const result = await getSessionMemories({ conversationId, type, limit, offset, includeExpired });
      return ok({
        memories: result.memories,
        total: result.total,
      });
    } catch (error) {
      console.error("[session-memory] Failed to get session memories:", error);
      return fail("INTERNAL_ERROR", "Failed to get session memories", 500);
    }
  }

  // POST /api/session-memories - 创建会话记忆
  if (path === "/api/session-memories" && request.method === "POST") {
    try {
      const body = await parseJson<{
        conversationId: string;
        type: SessionMemoryType;
        content: string;
        metadata?: Record<string, unknown> | null;
        importance?: number;
        expiresAt?: string | null;
      }>(request);

      if (!body.conversationId?.trim()) {
        return fail("VALIDATION_ERROR", "conversationId is required", 422);
      }

      if (!body.type || !["context", "summary", "decision", "action_item"].includes(body.type)) {
        return fail("VALIDATION_ERROR", "type must be context, summary, decision, or action_item", 422);
      }

      if (!body.content?.trim()) {
        return fail("VALIDATION_ERROR", "content is required", 422);
      }

      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

      const memory = await createSessionMemory({
        conversationId: body.conversationId.trim(),
        type: body.type,
        content: body.content.trim(),
        metadata: body.metadata,
        importance: body.importance,
        expiresAt,
      });

      return ok(memory, { status: 201 });
    } catch (error) {
      console.error("[session-memory] Failed to create session memory:", error);
      return fail("INTERNAL_ERROR", "Failed to create session memory", 500);
    }
  }

  // DELETE /api/session-memories - 删除会话的所有记忆
  if (path === "/api/session-memories" && request.method === "DELETE") {
    const conversationId = url.searchParams.get("conversationId");
    
    if (!conversationId) {
      return fail("VALIDATION_ERROR", "conversationId query param is required", 422);
    }

    try {
      const deleted = await deleteSessionMemoriesByConversation(conversationId);
      return ok({ success: true, deletedCount: deleted });
    } catch (error) {
      console.error("[session-memory] Failed to delete session memories:", error);
      return fail("INTERNAL_ERROR", "Failed to delete session memories", 500);
    }
  }

  // POST /api/session-memories/cleanup - 清理过期记忆
  if (path === "/api/session-memories/cleanup" && request.method === "POST") {
    try {
      const deleted = await cleanupExpiredSessionMemories();
      return ok({ success: true, deletedCount: deleted });
    } catch (error) {
      console.error("[session-memory] Failed to cleanup session memories:", error);
      return fail("INTERNAL_ERROR", "Failed to cleanup session memories", 500);
    }
  }

  // GET /api/session-memories/:id - 获取单条会话记忆
  const singleMemoryMatch = path.match(/^\/api\/session-memories\/([^/]+)$/);
  if (singleMemoryMatch) {
    const memoryId = singleMemoryMatch[1];

    if (request.method === "GET") {
      try {
        const memory = await getSessionMemoryById(memoryId);
        if (!memory) {
          return fail("NOT_FOUND", "Session memory not found", 404);
        }
        return ok(memory);
      } catch (error) {
        console.error("[session-memory] Failed to get session memory:", error);
        return fail("INTERNAL_ERROR", "Failed to get session memory", 500);
      }
    }

    if (request.method === "PUT") {
      try {
        const body = await parseJson<{
          content?: string;
          metadata?: Record<string, unknown> | null;
          importance?: number;
          expiresAt?: string | null;
        }>(request);

        const updateData: {
          content?: string;
          metadata?: Record<string, unknown> | null;
          importance?: number;
          expiresAt?: Date | null;
        } = {};

        if (body.content !== undefined) updateData.content = body.content;
        if (body.metadata !== undefined) updateData.metadata = body.metadata;
        if (body.importance !== undefined) updateData.importance = body.importance;
        if (body.expiresAt !== undefined) {
          updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        }

        const memory = await updateSessionMemory(memoryId, updateData);
        if (!memory) {
          return fail("NOT_FOUND", "Session memory not found", 404);
        }
        return ok(memory);
      } catch (error) {
        console.error("[session-memory] Failed to update session memory:", error);
        return fail("INTERNAL_ERROR", "Failed to update session memory", 500);
      }
    }

    if (request.method === "DELETE") {
      try {
        const deleted = await deleteSessionMemory(memoryId);
        if (!deleted) {
          return fail("NOT_FOUND", "Session memory not found", 404);
        }
        return ok({ success: true });
      } catch (error) {
        console.error("[session-memory] Failed to delete session memory:", error);
        return fail("INTERNAL_ERROR", "Failed to delete session memory", 500);
      }
    }
  }

  return null;
}
