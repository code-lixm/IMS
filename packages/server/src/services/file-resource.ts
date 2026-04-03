import { eq, and, desc, sql } from "drizzle-orm";
import type { FileResourceType } from "@ims/shared";
import { db } from "../db";
import { fileResources } from "../schema";

type FileResourceRow = typeof fileResources.$inferSelect;
type FileResourceRecord = {
  id: string;
  conversationId: string;
  name: string;
  type: FileResourceType;
  content: string;
  filePath: string | null;
  language: string | null;
  size: number;
  createdAt: number;
};

function toFileResource(row: FileResourceRow): FileResourceRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    name: row.name,
    type: row.type as FileResourceType,
    content: row.content,
    filePath: row.filePath ?? null,
    language: row.language ?? null,
    size: row.size,
    createdAt: typeof row.createdAt === "number" ? row.createdAt : new Date(row.createdAt).getTime(),
  };
}

function contentSize(content: string): number {
  return new TextEncoder().encode(content).length;
}

export class FileResourceService {
  async getFiles(
    conversationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ files: FileResourceRecord[]; total: number }> {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(fileResources)
      .where(eq(fileResources.conversationId, conversationId));

    const rows = await db
      .select()
      .from(fileResources)
      .where(eq(fileResources.conversationId, conversationId))
      .orderBy(desc(fileResources.createdAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    return {
      files: rows.map(toFileResource),
      total: Number(countResult[0]?.count) || 0,
    };
  }

  async getFileById(conversationId: string, fileId: string): Promise<FileResourceRecord | null> {
    const [row] = await db
      .select()
      .from(fileResources)
      .where(and(eq(fileResources.conversationId, conversationId), eq(fileResources.id, fileId)))
      .limit(1);

    return row ? toFileResource(row) : null;
  }

  async createFile(data: {
    conversationId: string;
    name: string;
    type: FileResourceType;
    content: string;
    language?: string | null;
    filePath?: string | null;
  }): Promise<FileResourceRecord> {
    const now = new Date();
    const id = `file_${crypto.randomUUID()}`;

    const [row] = await db
      .insert(fileResources)
      .values({
        id,
        conversationId: data.conversationId,
        name: data.name,
        type: data.type,
        content: data.content,
        filePath: data.filePath ?? null,
        language: data.language ?? null,
        size: contentSize(data.content),
        createdAt: now,
      })
      .returning();

    return toFileResource(row);
  }

  async updateFile(
    conversationId: string,
    fileId: string,
    updates: {
      name?: string;
      content?: string;
      language?: string | null;
    }
  ): Promise<FileResourceRecord | null> {
    const updateData: Partial<typeof fileResources.$inferInsert> = {};

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    if (updates.content !== undefined) {
      updateData.content = updates.content;
      updateData.size = contentSize(updates.content);
    }

    if (updates.language !== undefined) {
      updateData.language = updates.language;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getFileById(conversationId, fileId);
    }

    const [row] = await db
      .update(fileResources)
      .set(updateData)
      .where(and(eq(fileResources.conversationId, conversationId), eq(fileResources.id, fileId)))
      .returning();

    return row ? toFileResource(row) : null;
  }

  async deleteFile(conversationId: string, fileId: string): Promise<FileResourceRecord | null> {
    const [row] = await db
      .delete(fileResources)
      .where(and(eq(fileResources.conversationId, conversationId), eq(fileResources.id, fileId)))
      .returning();

    return row ? toFileResource(row) : null;
  }
}

export const fileResourceService = new FileResourceService();
