/**
 * Agent 文件操作工具集
 * 
 * 提供文件读写能力，允许 Agent 操作会话中的文件资源
 * 
 * 文件位置: apps/web/src/agents/tools/file-tools.ts
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getIMSContext } from '../context-bridge';
import { fileResourcesApi } from '@/api/file-resources';
import type { FileResourceType } from '@ims/shared';

// ==================== 1. 读取文件工具 ====================

/**
 * 工具：读取文件内容
 */
export const readFileTool = tool({
  description: '读取指定文件的内容。可用于读取代码文件、文档、简历等',
  inputSchema: z.object({
    fileId: z.string().describe('文件ID，用于唯一标识文件'),
    conversationId: z.string().optional().describe('会话ID，不传则使用当前会话'),
  }),
  execute: async ({ fileId, conversationId }: { fileId: string; conversationId?: string }, options: any) => {
    try {
      const ctx = getIMSContext(options);
      const targetConversationId = conversationId || ctx.currentConversationId;

      if (!targetConversationId) {
        return {
          success: false,
          error: '未指定会话ID，且当前没有活跃会话',
        };
      }

      const fileResource = await fileResourcesApi.get(targetConversationId, fileId);

      if (!fileResource) {
        return {
          success: false,
          error: `未找到文件: ${fileId}`,
        };
      }

      return {
        success: true,
        data: {
          id: fileResource.id,
          name: fileResource.name,
          type: fileResource.type,
          language: fileResource.language,
          content: fileResource.content,
          size: fileResource.size,
          createdAt: fileResource.createdAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
});

// ==================== 2. 写入文件工具 ====================

/**
 * 工具：创建或更新文件
 */
export const writeFileTool = tool({
  description: '创建新文件或更新现有文件内容。支持代码文件、文档、文本等',
  inputSchema: z.object({
    name: z.string().describe('文件名（包含扩展名）'),
    content: z.string().describe('文件内容'),
    type: z.enum(['code', 'document', 'text']).describe('文件类型'),
    language: z.string().optional().describe('代码语言（如 typescript, python, markdown 等），仅 code 类型需要'),
    conversationId: z.string().optional().describe('会话ID，不传则使用当前会话'),
    fileId: z.string().optional().describe('现有文件ID，提供则更新，不提供则创建'),
  }),
  execute: async ({
    name,
    content,
    type,
    language,
    conversationId,
    fileId,
  }: {
    name: string;
    content: string;
    type: 'code' | 'document' | 'text';
    language?: string;
    conversationId?: string;
    fileId?: string;
  }, options: any) => {
    try {
      const ctx = getIMSContext(options);
      const targetConversationId = conversationId || ctx.currentConversationId;

      if (!targetConversationId) {
        return {
          success: false,
          error: '未指定会话ID，且当前没有活跃会话',
        };
      }

      const fileType: FileResourceType = type === 'code' ? 'code' : type === 'document' ? 'document' : 'code';

      if (fileId) {
        // 更新现有文件
        const updated = await fileResourcesApi.update(targetConversationId, fileId, {
          name,
          content,
          language,
        });

        return {
          success: true,
          message: '文件已更新',
          data: {
            id: updated.id,
            name: updated.name,
            type: updated.type,
            size: updated.size,
            updatedAt: updated.createdAt,
          },
        };
      } else {
        // 创建新文件
        const created = await fileResourcesApi.create(targetConversationId, {
          name,
          content,
          type: fileType,
          language,
        });

        return {
          success: true,
          message: '文件已创建',
          data: {
            id: created.id,
            name: created.name,
            type: created.type,
            size: created.size,
            createdAt: created.createdAt,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `写入文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
});

// ==================== 3. 列出文件工具 ====================

/**
 * 工具：列出会话中的所有文件
 */
export const listFilesTool = tool({
  description: '列出指定会话中的所有文件资源',
  inputSchema: z.object({
    conversationId: z.string().optional().describe('会话ID，不传则使用当前会话'),
    type: z.enum(['code', 'document', 'all']).optional().describe('文件类型筛选'),
  }),
  execute: async ({
    conversationId,
    type,
  }: {
    conversationId?: string;
    type?: 'code' | 'document' | 'all';
  }, options: any) => {
    try {
      const ctx = getIMSContext(options);
      const targetConversationId = conversationId || ctx.currentConversationId;

      if (!targetConversationId) {
        return {
          success: false,
          error: '未指定会话ID，且当前没有活跃会话',
        };
      }

      const files = await fileResourcesApi.list(targetConversationId);

      // 根据类型筛选
      let filteredFiles = files;
      if (type && type !== 'all') {
        filteredFiles = files.filter((f) => f.type === type);
      }

      return {
        success: true,
        data: {
          total: filteredFiles.length,
          files: filteredFiles.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            language: f.language,
            size: f.size,
            createdAt: f.createdAt,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `列出文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
});

// ==================== 4. 删除文件工具 ====================

/**
 * 工具：删除文件
 */
export const deleteFileTool = tool({
  description: '删除指定的文件',
  inputSchema: z.object({
    fileId: z.string().describe('要删除的文件ID'),
    conversationId: z.string().optional().describe('会话ID，不传则使用当前会话'),
  }),
  execute: async ({ fileId, conversationId }: { fileId: string; conversationId?: string }, options: any) => {
    try {
      const ctx = getIMSContext(options);
      const targetConversationId = conversationId || ctx.currentConversationId;

      if (!targetConversationId) {
        return {
          success: false,
          error: '未指定会话ID，且当前没有活跃会话',
        };
      }

      await fileResourcesApi.delete(targetConversationId, fileId);

      return {
        success: true,
        message: '文件已删除',
        data: { fileId },
      };
    } catch (error) {
      return {
        success: false,
        error: `删除文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
});

// ==================== 5. 工具集合导出 ====================

/**
 * 文件操作工具集合
 * 供 Agent 注册时使用
 */
export const fileTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  listFiles: listFilesTool,
  deleteFile: deleteFileTool,
};

// 类型导出
export type FileTools = typeof fileTools;
