import { z } from "zod";
import { api } from "@/api/client";
import type { FileResource, FileResourceType } from "@ims/shared";
import type { AgentTool, IMSContext } from "../host";

function resolveConversationId(conversationId: string | undefined, context: unknown): string {
  const currentConversationId = (context as IMSContext | undefined)?.currentConversationId;
  const resolved = conversationId ?? currentConversationId;

  if (!resolved?.trim()) {
    throw new Error("缺少 conversationId，请在参数中提供会话 ID");
  }

  return resolved;
}

export const fileTools: Record<string, AgentTool> = {
  readFile: {
    description: "读取当前会话中的文件内容",
    inputSchema: z.object({
      conversationId: z.string().optional().describe("会话 ID，不传则尝试使用当前会话"),
      fileId: z.string().describe("文件 ID"),
    }),
    execute: async (params, context) => {
      const { conversationId, fileId } = params as { conversationId?: string; fileId: string };
      const resolvedConversationId = resolveConversationId(conversationId, context);

      const file = await api<FileResource>(
        `/api/conversations/${encodeURIComponent(resolvedConversationId)}/file-resources/${encodeURIComponent(fileId)}`
      );

      return {
        success: true,
        file,
      };
    },
  },
  writeFile: {
    description: "在当前会话中创建新文件",
    inputSchema: z.object({
      conversationId: z.string().optional().describe("会话 ID，不传则尝试使用当前会话"),
      name: z.string().describe("文件名"),
      type: z.enum(["code", "document", "image"]).describe("文件类型"),
      content: z.string().describe("文件内容"),
      language: z.string().optional().describe("代码语言"),
    }),
    execute: async (params, context) => {
      const { conversationId, name, type, content, language } = params as {
        conversationId?: string;
        name: string;
        type: FileResourceType;
        content: string;
        language?: string;
      };
      const resolvedConversationId = resolveConversationId(conversationId, context);

      const file = await api<FileResource>(
        `/api/conversations/${encodeURIComponent(resolvedConversationId)}/file-resources`,
        {
          method: "POST",
          json: {
            name,
            type,
            content,
            language,
          },
        }
      );

      return {
        success: true,
        file,
      };
    },
  },
  updateFile: {
    description: "更新当前会话中的文件内容或名称",
    inputSchema: z.object({
      conversationId: z.string().optional().describe("会话 ID，不传则尝试使用当前会话"),
      fileId: z.string().describe("文件 ID"),
      name: z.string().optional().describe("新的文件名"),
      content: z.string().optional().describe("新的文件内容"),
      language: z.string().nullable().optional().describe("新的代码语言"),
    }),
    execute: async (params, context) => {
      const { conversationId, fileId, name, content, language } = params as {
        conversationId?: string;
        fileId: string;
        name?: string;
        content?: string;
        language?: string | null;
      };
      const resolvedConversationId = resolveConversationId(conversationId, context);

      const file = await api<FileResource>(
        `/api/conversations/${encodeURIComponent(resolvedConversationId)}/file-resources/${encodeURIComponent(fileId)}`,
        {
          method: "PUT",
          json: {
            name,
            content,
            language,
          },
        }
      );

      return {
        success: true,
        file,
      };
    },
  },
  deleteFile: {
    description: "删除当前会话中的文件",
    inputSchema: z.object({
      conversationId: z.string().optional().describe("会话 ID，不传则尝试使用当前会话"),
      fileId: z.string().describe("文件 ID"),
    }),
    execute: async (params, context) => {
      const { conversationId, fileId } = params as { conversationId?: string; fileId: string };
      const resolvedConversationId = resolveConversationId(conversationId, context);

      await api<{ success: boolean; deletedId: string }>(
        `/api/conversations/${encodeURIComponent(resolvedConversationId)}/file-resources/${encodeURIComponent(fileId)}`,
        {
          method: "DELETE",
        }
      );

      return {
        success: true,
        deletedId: fileId,
      };
    },
  },
};
