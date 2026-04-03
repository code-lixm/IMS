import { eq } from "drizzle-orm";
import type { FileResourceType } from "@ims/shared";
import { db } from "../db";
import { conversations } from "../schema";
import { fileResourceService } from "../services/file-resource";
import { corsHeaders, fail, ok } from "../utils/http";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

async function ensureConversationExists(conversationId: string): Promise<boolean> {
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return Boolean(conversation);
}

export async function fileResourcesRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const filesMatch = path.match(/^\/api\/conversations\/([^/]+)\/file-resources$/);
  if (filesMatch) {
    const conversationId = filesMatch[1];

    if (!(await ensureConversationExists(conversationId))) {
      return fail("NOT_FOUND", "Conversation not found", 404);
    }

    if (request.method === "GET") {
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

      try {
        const result = await fileResourceService.getFiles(conversationId, { limit, offset });
        return ok(result);
      } catch (error) {
        console.error("[file-resources] Failed to get files:", error);
        return fail("INTERNAL_ERROR", "Failed to get files", 500);
      }
    }

    if (request.method === "POST") {
      try {
        const body = await parseJson<{
          name: string;
          type: FileResourceType;
          content: string;
          language?: string | null;
        }>(request);

        if (!body.name?.trim()) {
          return fail("VALIDATION_ERROR", "name is required", 422);
        }

        if (!body.content?.trim()) {
          return fail("VALIDATION_ERROR", "content is required", 422);
        }

        if (!body.type || !["code", "document", "image"].includes(body.type)) {
          return fail("VALIDATION_ERROR", "type must be code, document, or image", 422);
        }

        const file = await fileResourceService.createFile({
          conversationId,
          name: body.name.trim(),
          type: body.type,
          content: body.content,
          language: body.language ?? null,
        });

        return ok(file, { status: 201 });
      } catch (error) {
        console.error("[file-resources] Failed to create file:", error);
        return fail("INTERNAL_ERROR", "Failed to create file", 500);
      }
    }
  }

  const fileMatch = path.match(/^\/api\/conversations\/([^/]+)\/file-resources\/([^/]+)$/);
  if (fileMatch) {
    const conversationId = fileMatch[1];
    const fileId = fileMatch[2];

    if (!(await ensureConversationExists(conversationId))) {
      return fail("NOT_FOUND", "Conversation not found", 404);
    }

    if (request.method === "GET") {
      try {
        const file = await fileResourceService.getFileById(conversationId, fileId);
        if (!file) {
          return fail("NOT_FOUND", "File not found", 404);
        }

        return ok(file);
      } catch (error) {
        console.error("[file-resources] Failed to get file:", error);
        return fail("INTERNAL_ERROR", "Failed to get file", 500);
      }
    }

    if (request.method === "PUT") {
      try {
        const body = await parseJson<{
          name?: string;
          content?: string;
          language?: string | null;
        }>(request);

        if (body.name !== undefined && !body.name.trim()) {
          return fail("VALIDATION_ERROR", "name cannot be empty", 422);
        }

        if (body.content !== undefined && !body.content.trim()) {
          return fail("VALIDATION_ERROR", "content cannot be empty", 422);
        }

        const file = await fileResourceService.updateFile(conversationId, fileId, {
          name: body.name?.trim(),
          content: body.content,
          language: body.language,
        });

        if (!file) {
          return fail("NOT_FOUND", "File not found", 404);
        }

        return ok(file);
      } catch (error) {
        console.error("[file-resources] Failed to update file:", error);
        return fail("INTERNAL_ERROR", "Failed to update file", 500);
      }
    }

    if (request.method === "DELETE") {
      try {
        const deleted = await fileResourceService.deleteFile(conversationId, fileId);
        if (!deleted) {
          return fail("NOT_FOUND", "File not found", 404);
        }

        return ok({ success: true, deletedId: fileId });
      } catch (error) {
        console.error("[file-resources] Failed to delete file:", error);
        return fail("INTERNAL_ERROR", "Failed to delete file", 500);
      }
    }
  }

  return null;
}
