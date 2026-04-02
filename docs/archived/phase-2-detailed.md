# Phase 2: Agent 增强 - 详细技术方案

> **目标**: 赋予 Agent 文件操作能力和记忆能力
> **工期**: 13 天
> **关键交付物**: Agent 可读写文件、具备短期和长期记忆

---

## 1. Agent 文件操作工具系统

### 1.1 需求分析

**功能需求**:
- Agent 可以读取会话中的文件（简历、报告等）
- Agent 可以创建和写入文件（面试报告、评估结果等）
- 文件按会话隔离，确保数据安全
- 支持多种文件类型：文本、Markdown、JSON、PDF 等

**技术约束**:
- 前端执行（基于安全考虑，不开放服务端文件系统）
- 文件存储在 IndexedDB 或本地文件系统（Tauri）
- 需要权限控制（只访问当前会话的文件）

### 1.2 架构设计

```
┌─────────────────────────────────────────┐
│           Agent Host                    │
│  ┌─────────────────────────────────┐    │
│  │      Tool Registry              │    │
│  │  ┌─────────┐  ┌─────────────┐   │    │
│  │  │readFile │  │  writeFile  │   │    │
│  │  └────┬────┘  └──────┬──────┘   │    │
│  └───────┼──────────────┼──────────┘    │
│          │              │               │
│          ▼              ▼               │
│  ┌─────────────────────────────────┐    │
│  │      File Manager               │    │
│  │  ┌──────────┐  ┌──────────┐     │    │
│  │  │ IndexedDB│  │ Tauri FS │     │    │
│  │  └──────────┘  └──────────┘     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 1.3 数据模型

```typescript
// packages/shared/src/types/file.ts

export type FileType = 'document' | 'code' | 'image' | 'pdf' | 'data' | 'other';
export type FileStatus = 'active' | 'archived' | 'deleted';

export interface FileResource {
  id: string;
  conversationId: string;
  
  // 文件信息
  name: string;
  originalName: string;
  type: FileType;
  mimeType: string;
  size: number;
  
  // 存储路径（相对路径或 IndexedDB key）
  storagePath: string;
  
  // 内容摘要（用于预览）
  summary?: string;
  
  // 创建者（user | agent）
  createdBy: 'user' | 'agent';
  agentId?: string;
  
  // 状态
  status: FileStatus;
  
  // 元数据
  metadata?: {
    pageCount?: number;
    lineCount?: number;
    wordCount?: number;
    encoding?: string;
  };
  
  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// 文件内容（从存储读取）
export interface FileContent {
  id: string;
  content: string | Blob | ArrayBuffer;
  encoding: 'utf-8' | 'base64' | 'binary';
}

// 创建文件请求
export interface CreateFileRequest {
  name: string;
  content: string;
  type: FileType;
  mimeType?: string;
}

// 工具调用上下文
export interface ToolContext {
  conversationId: string;
  agentId: string;
  messageId: string;
  userId: string;
}
```

### 1.4 文件管理器实现

```typescript
// apps/web/src/services/file-manager.ts

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FileResource, FileContent, FileType } from '@ims/shared';

const DB_NAME = 'ims-files';
const DB_VERSION = 1;

interface FileDBSchema extends DBSchema {
  files: {
    key: string;
    value: FileResource;
    indexes: {
      'by-conversation': string;
      'by-status': string;
    };
  };
  contents: {
    key: string;
    value: FileContent;
  };
}

export class FileManager {
  private db: IDBPDatabase<FileDBSchema> | null = null;
  
  // 初始化数据库
  async init(): Promise<void> {
    if (this.db) return;
    
    this.db = await openDB<FileDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 文件元数据表
        const fileStore = db.createObjectStore('files', { keyPath: 'id' });
        fileStore.createIndex('by-conversation', 'conversationId');
        fileStore.createIndex('by-status', 'status');
        
        // 文件内容表
        db.createObjectStore('contents', { keyPath: 'id' });
      },
    });
  }
  
  // 创建文件
  async createFile(
    conversationId: string,
    data: {
      name: string;
      content: string;
      type: FileType;
      mimeType?: string;
      createdBy: 'user' | 'agent';
      agentId?: string;
    }
  ): Promise<FileResource> {
    await this.init();
    
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const file: FileResource = {
      id,
      conversationId,
      name: this.sanitizeFileName(data.name),
      originalName: data.name,
      type: data.type,
      mimeType: data.mimeType || this.detectMimeType(data.name),
      size: new Blob([data.content]).size,
      storagePath: id, // 使用 ID 作为存储 key
      createdBy: data.createdBy,
      agentId: data.agentId,
      status: 'active',
      metadata: this.extractMetadata(data.content),
      createdAt: now,
      updatedAt: now,
    };
    
    const content: FileContent = {
      id,
      content: data.content,
      encoding: 'utf-8',
    };
    
    // 保存元数据和内容
    await this.db!.put('files', file);
    await this.db!.put('contents', content);
    
    return file;
  }
  
  // 读取文件
  async readFile(
    conversationId: string,
    fileId: string
  ): Promise<{ resource: FileResource; content: string } | null> {
    await this.init();
    
    // 获取元数据
    const resource = await this.db!.get('files', fileId);
    if (!resource) return null;
    
    // 验证会话权限
    if (resource.conversationId !== conversationId) {
      throw new Error('无权访问该文件');
    }
    
    // 获取内容
    const contentRecord = await this.db!.get('contents', fileId);
    if (!contentRecord) return null;
    
    return {
      resource,
      content: contentRecord.content as string,
    };
  }
  
  // 读取文件内容（供 Agent 使用）
  async readFileContent(
    conversationId: string,
    fileIdOrName: string
  ): Promise<string | null> {
    // 先尝试作为 ID 读取
    let file = await this.getFileById(fileIdOrName);
    
    // 如果不是 ID，尝试作为文件名读取
    if (!file) {
      const files = await this.listFiles(conversationId);
      file = files.find(f => f.name === fileIdOrName || f.originalName === fileIdOrName);
    }
    
    if (!file || file.conversationId !== conversationId) {
      return null;
    }
    
    const contentRecord = await this.db!.get('contents', file.id);
    return contentRecord?.content as string | null;
  }
  
  // 更新文件
  async updateFile(
    fileId: string,
    updates: { content?: string; name?: string }
  ): Promise<FileResource | null> {
    await this.init();
    
    const resource = await this.db!.get('files', fileId);
    if (!resource) return null;
    
    if (updates.name) {
      resource.name = this.sanitizeFileName(updates.name);
      resource.originalName = updates.name;
    }
    
    if (updates.content !== undefined) {
      resource.size = new Blob([updates.content]).size;
      resource.metadata = this.extractMetadata(updates.content);
      
      const content: FileContent = {
        id: fileId,
        content: updates.content,
        encoding: 'utf-8',
      };
      await this.db!.put('contents', content);
    }
    
    resource.updatedAt = Date.now();
    await this.db!.put('files', resource);
    
    return resource;
  }
  
  // 删除文件
  async deleteFile(fileId: string, permanent = false): Promise<void> {
    await this.init();
    
    if (permanent) {
      await this.db!.delete('files', fileId);
      await this.db!.delete('contents', fileId);
    } else {
      // 软删除
      const resource = await this.db!.get('files', fileId);
      if (resource) {
        resource.status = 'deleted';
        resource.updatedAt = Date.now();
        await this.db!.put('files', resource);
      }
    }
  }
  
  // 列出会话文件
  async listFiles(
    conversationId: string,
    options?: { includeDeleted?: boolean }
  ): Promise<FileResource[]> {
    await this.init();
    
    const index = this.db!.transaction('files').store.index('by-conversation');
    const files = await index.getAll(conversationId);
    
    if (!options?.includeDeleted) {
      return files.filter(f => f.status !== 'deleted');
    }
    return files;
  }
  
  // 获取文件（通过 ID）
  async getFileById(fileId: string): Promise<FileResource | undefined> {
    await this.init();
    return this.db!.get('files', fileId);
  }
  
  // 清理过期文件
  async cleanupExpiredFiles(maxAgeDays: number): Promise<number> {
    await this.init();
    
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const tx = this.db!.transaction(['files', 'contents'], 'readwrite');
    
    const files = await tx.objectStore('files').getAll();
    const toDelete = files.filter(f => f.updatedAt < cutoff && f.status === 'deleted');
    
    for (const file of toDelete) {
      await tx.objectStore('files').delete(file.id);
      await tx.objectStore('contents').delete(file.id);
    }
    
    await tx.done;
    return toDelete.length;
  }
  
  // 辅助方法
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 255);
  }
  
  private detectMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'txt': 'text/plain',
      'md': 'text/markdown',
      'json': 'application/json',
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
  
  private extractMetadata(content: string): FileResource['metadata'] {
    return {
      lineCount: content.split('\n').length,
      wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
      encoding: 'utf-8',
    };
  }
}

// 单例实例
export const fileManager = new FileManager();
```

### 1.5 Agent 工具定义

```typescript
// apps/web/src/agents/tools/file-tools.ts

import { z } from 'zod';
import { fileManager } from '@/services/file-manager';
import type { ToolContext } from '@ims/shared';

// 读取文件工具
export const readFileTool = {
  name: 'readFile',
  description: '读取当前会话中的文件内容。支持通过文件 ID 或文件名查找。',
  parameters: z.object({
    fileIdOrName: z.string().describe('文件 ID 或文件名'),
  }),
  
  async execute(
    params: { fileIdOrName: string },
    context: ToolContext
  ): Promise<{
    success: boolean;
    content?: string;
    fileName?: string;
    error?: string;
  }> {
    try {
      const content = await fileManager.readFileContent(
        context.conversationId,
        params.fileIdOrName
      );
      
      if (content === null) {
        // 列出可用文件供参考
        const files = await fileManager.listFiles(context.conversationId);
        const availableFiles = files.map(f => f.name).join(', ');
        
        return {
          success: false,
          error: `未找到文件 "${params.fileIdOrName}"。可用文件: ${availableFiles || '无'}`,
        };
      }
      
      return {
        success: true,
        content,
        fileName: params.fileIdOrName,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取文件失败',
      };
    }
  },
};

// 写入文件工具
export const writeFileTool = {
  name: 'writeFile',
  description: '创建或更新文件。如果文件已存在，将覆盖内容。',
  parameters: z.object({
    name: z.string().describe('文件名（包含扩展名）'),
    content: z.string().describe('文件内容'),
    type: z.enum(['document', 'code', 'data', 'other']).describe('文件类型'),
  }),
  
  async execute(
    params: { name: string; content: string; type: string },
    context: ToolContext
  ): Promise<{
    success: boolean;
    fileId?: string;
    fileName?: string;
    size?: number;
    error?: string;
  }> {
    try {
      // 检查是否已存在同名文件
      const existingFiles = await fileManager.listFiles(context.conversationId);
      const existingFile = existingFiles.find(
        f => f.name === params.name || f.originalName === params.name
      );
      
      if (existingFile) {
        // 更新现有文件
        const updated = await fileManager.updateFile(existingFile.id, {
          content: params.content,
        });
        
        return {
          success: true,
          fileId: existingFile.id,
          fileName: params.name,
          size: updated?.size,
        };
      }
      
      // 创建新文件
      const file = await fileManager.createFile(context.conversationId, {
        name: params.name,
        content: params.content,
        type: params.type as any,
        createdBy: 'agent',
        agentId: context.agentId,
      });
      
      return {
        success: true,
        fileId: file.id,
        fileName: file.name,
        size: file.size,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '写入文件失败',
      };
    }
  },
};

// 列出文件工具
export const listFilesTool = {
  name: 'listFiles',
  description: '列出当前会话中的所有文件。',
  parameters: z.object({}), // 无参数
  
  async execute(
    _params: {},
    context: ToolContext
  ): Promise<{
    success: boolean;
    files?: Array<{
      id: string;
      name: string;
      type: string;
      size: number;
      createdBy: string;
      createdAt: string;
    }>;
    error?: string;
  }> {
    try {
      const files = await fileManager.listFiles(context.conversationId);
      
      return {
        success: true,
        files: files.map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          size: f.size,
          createdBy: f.createdBy,
          createdAt: new Date(f.createdAt).toISOString(),
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取文件列表失败',
      };
    }
  },
};

// 工具集合
export const fileTools = [readFileTool, writeFileTool, listFilesTool];
```

### 1.6 前端组件

```vue
<!-- apps/web/src/components/lui/FileResourceList.vue -->

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { fileManager } from '@/services/file-manager';
import { useMessageStore } from '@/stores/message';
import {
  FileText,
  FileCode,
  FileImage,
  File as FileIcon,
  Download,
  Trash2,
  RefreshCw,
} from 'lucide-vue-next';
import type { FileResource, FileType } from '@ims/shared';

interface Props {
  conversationId: string;
}

const props = defineProps<Props>();

// 状态
const files = ref<FileResource[]>([]);
const loading = ref(false);
const selectedFile = ref<FileResource | null>(null);
const previewContent = ref<string>('');
const showPreview = ref(false);

// 文件类型图标映射
const fileTypeIcons: Record<FileType, any> = {
  document: FileText,
  code: FileCode,
  image: FileImage,
  pdf: FileText,
  data: FileCode,
  other: FileIcon,
};

// 加载文件列表
async function loadFiles() {
  loading.value = true;
  try {
    files.value = await fileManager.listFiles(props.conversationId);
  } finally {
    loading.value = false;
  }
}

// 预览文件
async function previewFile(file: FileResource) {
  const result = await fileManager.readFile(props.conversationId, file.id);
  if (result) {
    previewContent.value = result.content;
    selectedFile.value = file;
    showPreview.value = true;
  }
}

// 下载文件
async function downloadFile(file: FileResource) {
  const result = await fileManager.readFile(props.conversationId, file.id);
  if (!result) return;
  
  const blob = new Blob([result.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 删除文件
async function deleteFile(file: FileResource) {
  if (!confirm(`确定要删除 "${file.name}" 吗？`)) return;
  
  await fileManager.deleteFile(file.id);
  await loadFiles();
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

onMounted(loadFiles);
</script>

<template>
  <div class="file-resource-list">
    <!-- 头部 -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-medium">文件资源</h3>
      <Button variant="ghost" size="sm" @click="loadFiles" :disabled="loading">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>
    
    <!-- 空状态 -->
    <div v-if="files.length === 0" class="text-center py-8 text-muted-foreground">
      <FileIcon class="h-8 w-8 mx-auto mb-2 opacity-50" />
      <p class="text-sm">暂无文件</p>
    </div>
    
    <!-- 文件列表 -->
    <div v-else class="space-y-2">
      <div
        v-for="file in files"
        :key="file.id"
        class="file-item flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
        @click="previewFile(file)"
      >
        <component
          :is="fileTypeIcons[file.type] || FileIcon"
          class="h-5 w-5 text-muted-foreground"
        />
        
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ file.name }}</p>
          <p class="text-xs text-muted-foreground">
            {{ formatSize(file.size) }} · {{ file.createdBy === 'agent' ? 'AI生成' : '用户上传' }}
          </p>
        </div>
        
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            @click.stop="downloadFile(file)"
          >
            <Download class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-destructive"
            @click.stop="deleteFile(file)"
          >
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
    
    <!-- 预览对话框 -->
    <Dialog v-model:open="showPreview">
      <DialogContent class="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{{ selectedFile?.name }}</DialogTitle>
          <DialogDescription>
            {{ formatSize(selectedFile?.size || 0) }}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea class="h-[50vh]">
          <pre class="text-sm p-4 bg-muted rounded"><code>{{ previewContent }}</code></pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

---

## 2. Agent 记忆系统

### 2.1 架构设计

```
记忆系统架构
├── 全局记忆（Global Memory）
│   ├── 用户偏好（偏好题型、评估标准）
│   ├── 行业知识（技术栈、面试经验）
│   └── Agent 学习（改进建议、成功案例）
│
├── 会话记忆（Session Memory）
│   ├── 对话上下文（历史消息）
│   ├── 候选人信息（简历摘要、面试记录）
│   └── 临时状态（当前任务、待办事项）
│
└── 检索层
    ├── 关键词匹配
    └── 语义相似度（可选：向量检索）
```

### 2.2 数据模型

```typescript
// packages/shared/src/types/memory.ts

export type MemoryType = 'fact' | 'insight' | 'preference' | 'experience';
export type MemoryScope = 'global' | 'session' | 'candidate';
export type MemoryPriority = 'high' | 'medium' | 'low';

// 记忆条目
export interface Memory {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  
  // 关联 ID
  userId?: string;
  sessionId?: string;
  candidateId?: string;
  agentId?: string;
  
  // 内容
  content: string;
  summary?: string;
  
  // 元数据
  priority: MemoryPriority;
  tags: string[];
  source?: string; // 来源消息 ID 或操作
  
  // 使用统计
  accessCount: number;
  lastAccessedAt?: number;
  
  // 时间戳
  createdAt: number;
  expiresAt?: number; // 可选过期时间
}

// 记忆检索结果
export interface MemoryRetrievalResult {
  memory: Memory;
  relevance: number; // 0-1 相关度
}

// 记忆创建请求
export interface CreateMemoryRequest {
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  summary?: string;
  priority?: MemoryPriority;
  tags?: string[];
  source?: string;
  expiresAt?: number;
}

// 记忆检索请求
export interface RetrieveMemoryRequest {
  query: string;
  scope?: MemoryScope[];
  types?: MemoryType[];
  agentId?: string;
  sessionId?: string;
  candidateId?: string;
  limit?: number;
  minRelevance?: number;
}

// 记忆统计
export interface MemoryStats {
  totalCount: number;
  byType: Record<MemoryType, number>;
  byScope: Record<MemoryScope, number>;
  recentlyUsed: Memory[];
}
```

### 2.3 数据库 Schema

```typescript
// packages/server/src/schema.ts

// 记忆表
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  type: text('type', { 
    enum: ['fact', 'insight', 'preference', 'experience'] 
  }).notNull(),
  scope: text('scope', { 
    enum: ['global', 'session', 'candidate'] 
  }).notNull(),
  
  // 关联
  userId: text('user_id'),
  sessionId: text('session_id'),
  candidateId: text('candidate_id'),
  agentId: text('agent_id'),
  
  // 内容
  content: text('content').notNull(),
  summary: text('summary'),
  
  // 元数据
  priority: text('priority', { 
    enum: ['high', 'medium', 'low'] 
  }).notNull().default('medium'),
  tagsJson: text('tags_json'), // JSON 数组
  source: text('source'),
  
  // 使用统计
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: integer('last_accessed_at'),
  
  // 时间戳
  createdAt: integer('created_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  expiresAt: integer('expires_at'),
});

// 索引
export const memoryIndexes = {
  byUser: index('memories_user_id').on(memories.userId),
  bySession: index('memories_session_id').on(memories.sessionId),
  byCandidate: index('memories_candidate_id').on(memories.candidateId),
  byAgent: index('memories_agent_id').on(memories.agentId),
  byType: index('memories_type').on(memories.type),
  byScope: index('memories_scope').on(memories.scope),
};
```

### 2.4 记忆服务实现

```typescript
// packages/server/src/services/memory.ts

import { db } from '../db';
import { memories } from '../schema';
import { eq, and, or, desc, like, sql } from 'drizzle-orm';
import type { 
  Memory, 
  CreateMemoryRequest, 
  RetrieveMemoryRequest,
  MemoryRetrievalResult,
  MemoryStats 
} from '@ims/shared';

export class MemoryService {
  // 创建记忆
  async createMemory(
    userId: string,
    data: CreateMemoryRequest
  ): Promise<Memory> {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const [record] = await db.insert(memories).values({
      id,
      type: data.type,
      scope: data.scope,
      userId,
      sessionId: data.scope === 'session' ? data.sessionId : null,
      candidateId: data.scope === 'candidate' ? data.candidateId : null,
      agentId: data.agentId,
      content: data.content,
      summary: data.summary ?? null,
      priority: data.priority ?? 'medium',
      tagsJson: data.tags ? JSON.stringify(data.tags) : null,
      source: data.source ?? null,
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: now,
      expiresAt: data.expiresAt ?? null,
    }).returning();
    
    return this.mapToMemory(record);
  }
  
  // 检索记忆
  async retrieveMemories(
    userId: string,
    request: RetrieveMemoryRequest
  ): Promise<MemoryRetrievalResult[]> {
    const { 
      query, 
      scope, 
      types, 
      agentId, 
      sessionId, 
      candidateId,
      limit = 10,
      minRelevance = 0.1 
    } = request;
    
    // 构建查询条件
    const conditions = [eq(memories.userId, userId)];
    
    // 关键词匹配
    const keywordCondition = or(
      like(memories.content, `%${query}%`),
      like(memories.summary, `%${query}%`),
      like(memories.tagsJson, `%${query}%`)
    );
    conditions.push(keywordCondition);
    
    // 范围过滤
    if (scope && scope.length > 0) {
      conditions.push(sql`${memories.scope} IN (${scope.join(',')})`);
    }
    
    // 类型过滤
    if (types && types.length > 0) {
      conditions.push(sql`${memories.type} IN (${types.join(',')})`);
    }
    
    // Agent 过滤
    if (agentId) {
      conditions.push(or(
        eq(memories.agentId, agentId),
        eq(memories.agentId, '') // 全局记忆
      ));
    }
    
    // 会话过滤
    if (sessionId) {
      conditions.push(or(
        eq(memories.sessionId, sessionId),
        eq(memories.scope, 'global') // 全局记忆始终包含
      ));
    }
    
    // 候选人过滤
    if (candidateId) {
      conditions.push(or(
        eq(memories.candidateId, candidateId),
        eq(memories.scope, 'global')
      ));
    }
    
    // 过期过滤
    conditions.push(or(
      sql`${memories.expiresAt} IS NULL`,
      sql`${memories.expiresAt} > ${Date.now()}`
    ));
    
    // 执行查询
    const results = await db.query.memories.findMany({
      where: and(...conditions),
      orderBy: [
        desc(memories.priority), // 高优先级在前
        desc(memories.accessCount), // 常用记忆在前
        desc(memories.createdAt), // 新记忆在前
      ],
      limit,
    });
    
    // 计算相关度（简单版本：基于关键词匹配度）
    return results.map(record => {
      const memory = this.mapToMemory(record);
      const relevance = this.calculateRelevance(memory, query);
      
      // 更新访问统计
      this.incrementAccessCount(memory.id);
      
      return { memory, relevance };
    }).filter(r => r.relevance >= minRelevance);
  }
  
  // 获取会话记忆摘要
  async getSessionMemorySummary(
    sessionId: string
  ): Promise<{ keyFacts: string[]; context: string }> {
    const sessionMemories = await db.query.memories.findMany({
      where: and(
        eq(memories.sessionId, sessionId),
        eq(memories.scope, 'session')
      ),
      orderBy: [desc(memories.createdAt)],
      limit: 20,
    });
    
    const keyFacts = sessionMemories
      .filter(m => m.type === 'fact')
      .map(m => m.content);
    
    const context = sessionMemories
      .map(m => m.summary || m.content)
      .join('\n');
    
    return { keyFacts, context };
  }
  
  // 获取全局记忆（用于 Agent 初始化）
  async getGlobalMemories(
    userId: string,
    agentId?: string
  ): Promise<Memory[]> {
    const conditions = [
      eq(memories.userId, userId),
      eq(memories.scope, 'global'),
    ];
    
    if (agentId) {
      conditions.push(or(
        eq(memories.agentId, agentId),
        eq(memories.agentId, '')
      ));
    }
    
    const results = await db.query.memories.findMany({
      where: and(...conditions),
      orderBy: [desc(memories.priority), desc(memories.accessCount)],
      limit: 50,
    });
    
    return results.map(this.mapToMemory);
  }
  
  // 更新记忆
  async updateMemory(
    memoryId: string,
    updates: Partial<Pick<Memory, 'content' | 'summary' | 'priority' | 'tags'>>
  ): Promise<Memory | null> {
    const [record] = await db.update(memories)
      .set({
        content: updates.content,
        summary: updates.summary,
        priority: updates.priority,
        tagsJson: updates.tags ? JSON.stringify(updates.tags) : undefined,
      })
      .where(eq(memories.id, memoryId))
      .returning();
    
    return record ? this.mapToMemory(record) : null;
  }
  
  // 删除记忆
  async deleteMemory(memoryId: string): Promise<void> {
    await db.delete(memories).where(eq(memories.id, memoryId));
  }
  
  // 获取统计
  async getStats(userId: string): Promise<MemoryStats> {
    const allMemories = await db.query.memories.findMany({
      where: eq(memories.userId, userId),
    });
    
    const byType: Record<string, number> = {};
    const byScope: Record<string, number> = {};
    
    allMemories.forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + 1;
      byScope[m.scope] = (byScope[m.scope] || 0) + 1;
    });
    
    const recentlyUsed = allMemories
      .filter(m => m.lastAccessedAt)
      .sort((a, b) => (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0))
      .slice(0, 10)
      .map(this.mapToMemory);
    
    return {
      totalCount: allMemories.length,
      byType: byType as MemoryStats['byType'],
      byScope: byScope as MemoryStats['byScope'],
      recentlyUsed,
    };
  }
  
  // 清理过期记忆
  async cleanupExpiredMemories(userId: string): Promise<number> {
    const result = await db.delete(memories)
      .where(and(
        eq(memories.userId, userId),
        sql`${memories.expiresAt} IS NOT NULL`,
        sql`${memories.expiresAt} < ${Date.now()}`
      ));
    
    return result.changes || 0;
  }
  
  // 辅助方法
  private async incrementAccessCount(memoryId: string): Promise<void> {
    await db.update(memories)
      .set({
        accessCount: sql`${memories.accessCount} + 1`,
        lastAccessedAt: Date.now(),
      })
      .where(eq(memories.id, memoryId));
  }
  
  private calculateRelevance(memory: Memory, query: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = memory.content.toLowerCase().split(/\s+/);
    
    let matches = 0;
    queryWords.forEach(qw => {
      if (contentWords.some(cw => cw.includes(qw))) {
        matches++;
      }
    });
    
    let relevance = matches / queryWords.length;
    
    // 优先级加权
    const priorityWeight = { high: 1.2, medium: 1.0, low: 0.8 };
    relevance *= priorityWeight[memory.priority];
    
    // 使用频率加权
    if (memory.accessCount > 10) relevance *= 1.1;
    
    return Math.min(relevance, 1.0);
  }
  
  private mapToMemory(record: typeof memories.$inferSelect): Memory {
    return {
      id: record.id,
      type: record.type as Memory['type'],
      scope: record.scope as Memory['scope'],
      userId: record.userId ?? undefined,
      sessionId: record.sessionId ?? undefined,
      candidateId: record.candidateId ?? undefined,
      agentId: record.agentId ?? undefined,
      content: record.content,
      summary: record.summary ?? undefined,
      priority: record.priority as Memory['priority'],
      tags: record.tagsJson ? JSON.parse(record.tagsJson) : [],
      source: record.source ?? undefined,
      accessCount: record.accessCount,
      lastAccessedAt: record.lastAccessedAt ?? undefined,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt ?? undefined,
    };
  }
}
```

### 2.5 记忆注入 Agent

```typescript
// apps/web/src/agents/memory-integration.ts

import { memoryService } from '@/services/memory';
import type { Message } from '@ims/shared';

interface MemoryContext {
  globalMemories: string[];
  sessionContext: string;
  keyFacts: string[];
  relevantMemories: string[];
}

/**
 * 为 Agent 构建记忆上下文
 */
export async function buildMemoryContext(
  userId: string,
  agentId: string,
  sessionId: string,
  currentMessage: string,
  recentMessages: Message[]
): Promise<MemoryContext> {
  // 1. 获取全局记忆
  const globalMemories = await memoryService.getGlobalMemories(userId, agentId);
  
  // 2. 检索相关记忆
  const relevantResults = await memoryService.retrieveMemories(userId, {
    query: currentMessage,
    scope: ['global', 'session'],
    agentId,
    sessionId,
    limit: 5,
    minRelevance: 0.3,
  });
  
  // 3. 获取会话记忆摘要
  const { keyFacts, context } = await memoryService.getSessionMemorySummary(sessionId);
  
  return {
    globalMemories: globalMemories
      .filter(m => m.priority === 'high')
      .map(m => m.content),
    sessionContext: context,
    keyFacts,
    relevantMemories: relevantResults.map(r => r.memory.content),
  };
}

/**
 * 构建带记忆的 System Prompt
 */
export function buildSystemPromptWithMemory(
  basePrompt: string,
  memoryContext: MemoryContext
): string {
  const parts: string[] = [basePrompt];
  
  // 添加全局记忆
  if (memoryContext.globalMemories.length > 0) {
    parts.push('\n【长期记忆】');
    memoryContext.globalMemories.forEach(m => parts.push(`- ${m}`));
  }
  
  // 添加会话上下文
  if (memoryContext.sessionContext) {
    parts.push('\n【会话背景】');
    parts.push(memoryContext.sessionContext);
  }
  
  // 添加关键事实
  if (memoryContext.keyFacts.length > 0) {
    parts.push('\n【已知信息】');
    memoryContext.keyFacts.forEach(f => parts.push(`- ${f}`));
  }
  
  // 添加相关记忆
  if (memoryContext.relevantMemories.length > 0) {
    parts.push('\n【相关参考】');
    memoryContext.relevantMemories.forEach(m => parts.push(`- ${m}`));
  }
  
  return parts.join('\n');
}

/**
 * 从对话中提取记忆
 */
export async function extractMemoriesFromConversation(
  userId: string,
  sessionId: string,
  agentId: string,
  messages: Message[]
): Promise<void> {
  // 只处理最后几条消息
  const recentMessages = messages.slice(-4);
  const conversation = recentMessages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  // 调用 LLM 提取关键信息
  const extractionPrompt = `
从以下对话中提取关键信息，用于帮助 AI 记住重要内容。
提取以下类型的信息：
1. 事实（fact）: 客观信息，如候选人的技能、经验
2. 洞察（insight）: 分析和判断，如"候选人技术扎实"
3. 偏好（preference）: 用户的偏好设置，如"偏好行为面试题"

对话：
${conversation}

请按 JSON 格式返回提取的记忆（如无可提取的内容返回空数组）：
[
  {
    "type": "fact|insight|preference",
    "content": "记忆内容",
    "summary": "简短摘要",
    "priority": "high|medium|low"
  }
]
`;
  
  // 这里需要调用 LLM，简化处理
  // 实际实现中应该使用 AgentHost 调用 LLM
}
```

---

## 3. 任务清单

| ID | 任务 | 工期 | 依赖 | 优先级 | 验收标准 |
|----|------|------|------|--------|----------|
| P2-T1 | 设计文件系统数据模型 | 0.5d | - | 高 | Schema 定义完成 |
| P2-T2 | 实现 FileManager IndexedDB 存储 | 1.5d | T1 | 高 | CRUD 操作可运行 |
| P2-T3 | 实现文件操作工具（read/write/list） | 1d | T2 | 高 | Agent 可调用的工具 |
| P2-T4 | 开发文件资源列表组件 | 1d | T2 | 中 | 文件列表 UI 完成 |
| P2-T5 | 设计记忆系统数据模型 | 0.5d | - | 高 | Schema 定义完成 |
| P2-T6 | 实现 MemoryService 后端服务 | 2d | T5 | 高 | 记忆 CRUD 完整 |
| P2-T7 | 实现记忆检索和注入逻辑 | 1d | T6 | 高 | Agent 可获得记忆 |
| P2-T8 | 实现记忆提取功能 | 1d | T6 | 中 | 自动提取对话记忆 |
| P2-T9 | 设计记忆管理 UI | 0.5d | - | 低 | UI 原型完成 |
| P2-T10 | 集成测试 | 2d | 以上全部 | 高 | 所有功能测试通过 |

**Phase 2 总工期**: 11 天

---

## 4. 依赖关系图

```
Phase 2 任务依赖
├── P2-T1 (文件数据模型)
│   └── P2-T2 (FileManager)
│       ├── P2-T3 (文件工具)
│       └── P2-T4 (文件列表组件)
├── P2-T5 (记忆数据模型)
│   └── P2-T6 (MemoryService)
│       ├── P2-T7 (记忆检索注入)
│       └── P2-T8 (记忆提取)
├── P2-T9 (记忆管理 UI)
│   └── P2-T10 (集成测试)
└── P2-T3, T4, T7, T8, T9
    └── P2-T10 (集成测试)

关键路径: T1 → T2 → T3 → T10 = 5.5d
        T5 → T6 → T7 → T10 = 5.5d
并行路径: 文件和记忆可并行开发
```

---

**文档完成** ✅
