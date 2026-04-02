/**
 * Memory Routes - 记忆 API 路由
 *
 * 提供记忆的 REST API 接口。
 */

import {
  createMemory,
  getMemories,
  getMemoryById,
  updateMemory,
  deleteMemory,
} from "../services/memory";
import { corsHeaders, ok, fail } from "../utils/http";
import type { MemoryType, MemoryScope } from "@ims/shared";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

/**
 * 注册记忆路由
 */
export async function memoryRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS 预检
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET /api/memories - 获取记忆列表
  if (path === "/api/memories" && request.method === "GET") {
    const type = url.searchParams.get("type") as MemoryType | undefined;
    const scope = url.searchParams.get("scope") as MemoryScope | undefined;
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    try {
      const result = await getMemories({ type, scope, limit, offset });
      return ok({
        memories: result.memories,
        total: result.total,
      });
    } catch (error) {
      console.error("[memory] Failed to get memories:", error);
      return fail("INTERNAL_ERROR", "Failed to get memories", 500);
    }
  }

  // POST /api/memories - 创建记忆
  if (path === "/api/memories" && request.method === "POST") {
    try {
      const body = await parseJson<{
        type: MemoryType;
        scope: MemoryScope;
        content: string;
        importance?: number;
        embedding?: string | null;
      }>(request);

      if (!body.type || !["fact", "insight", "preference"].includes(body.type)) {
        return fail("VALIDATION_ERROR", "type must be fact, insight, or preference", 422);
      }

      if (!body.scope || !["global", "candidate"].includes(body.scope)) {
        return fail("VALIDATION_ERROR", "scope must be global or candidate", 422);
      }

      if (!body.content?.trim()) {
        return fail("VALIDATION_ERROR", "content is required", 422);
      }

      const memory = await createMemory({
        type: body.type,
        scope: body.scope,
        content: body.content.trim(),
        importance: body.importance,
        embedding: body.embedding,
      });

      return ok(memory, { status: 201 });
    } catch (error) {
      console.error("[memory] Failed to create memory:", error);
      return fail("INTERNAL_ERROR", "Failed to create memory", 500);
    }
  }

  // GET /api/memories/:id - 获取单条记忆
  const singleMemoryMatch = path.match(/^\/api\/memories\/([^/]+)$/);
  if (singleMemoryMatch) {
    const memoryId = singleMemoryMatch[1];

    if (request.method === "GET") {
      try {
        const memory = await getMemoryById(memoryId);
        if (!memory) {
          return fail("NOT_FOUND", "Memory not found", 404);
        }
        return ok(memory);
      } catch (error) {
        console.error("[memory] Failed to get memory:", error);
        return fail("INTERNAL_ERROR", "Failed to get memory", 500);
      }
    }

    if (request.method === "PUT") {
      try {
        const body = await parseJson<{
          content?: string;
          importance?: number;
          embedding?: string | null;
        }>(request);

        const memory = await updateMemory(memoryId, body);
        if (!memory) {
          return fail("NOT_FOUND", "Memory not found", 404);
        }
        return ok(memory);
      } catch (error) {
        console.error("[memory] Failed to update memory:", error);
        return fail("INTERNAL_ERROR", "Failed to update memory", 500);
      }
    }

    if (request.method === "DELETE") {
      try {
        const deleted = await deleteMemory(memoryId);
        if (!deleted) {
          return fail("NOT_FOUND", "Memory not found", 404);
        }
        return ok({ success: true });
      } catch (error) {
        console.error("[memory] Failed to delete memory:", error);
        return fail("INTERNAL_ERROR", "Failed to delete memory", 500);
      }
    }
  }

  return null;
}
