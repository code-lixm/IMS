# Local AI Workbench Design

## Overview

LUI (Local AI Workbench) 是 IMS 系统的 AI 对话界面，基于 Vercel AI SDK + ai-elements-vue 自建，替代原 OpenCode 嵌入方案。

## Steering Document Alignment

### Technical Standards (tech.md)
- 使用 TypeScript 严格模式
- 组件使用 `<script setup>` 语法
- 状态管理使用 Pinia
- API 调用通过统一的 api client

### Project Structure (structure.md)
- 前端组件放在 `apps/web/src/components/lui/`
- 视图放在 `apps/web/src/views/`
- Store 放在 `apps/web/src/stores/`
- 后端路由在 `packages/server/src/routes.ts`
- 共享类型在 `packages/shared/src/`

## Code Reuse Analysis

### Existing Components to Leverage
- **shadcn-vue 组件**: Button, Input, Dialog, DropdownMenu, ScrollArea, Badge
- **lucide-vue-next 图标**: User, Bot, Send, Paperclip, Plus, X, FileCode, FileText, Download, Trash2, Eye, ChevronRight, MoreHorizontal, MessageSquare, Loader2
- **marked**: Markdown 渲染
- **sanitize-html**: HTML 清理（防止 XSS）

### Integration Points
- **API 路由**: 扩展 `packages/server/src/routes.ts` 添加 LUI 相关接口
- **数据库 Schema**: 扩展 `packages/server/src/schema.ts` 和 `packages/shared/src/db-schema.ts`
- **API 类型**: 扩展 `packages/shared/src/api-types.ts`
- **前端 API 客户端**: 在 `apps/web/src/api/` 添加 lui.ts

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vue 3)                          │
├──────────────┬──────────────────────────┬───────────────────────┤
│  Left Panel  │      Center Panel        │     Right Panel        │
│  Conversation│      Chat Messages       │    File Resources      │
│  List        │      + Prompt Input      │                        │
├──────────────┴──────────────────────────┴───────────────────────┤
│                     useLuiStore (Pinia)                          │
│  conversations[], selectedId, messages[], fileResources[]         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Bun.serve)                           │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/lui/conversations     - CRUD conversations            │
│  POST /api/lui/conversations/:id/messages - Send message (stream)│
│  POST /api/lui/files            - Upload file                   │
│  GET  /api/lui/files            - List files                    │
│  DELETE /api/lui/files/:id      - Delete file                  │
├─────────────────────────────────────────────────────────────────┤
│  AI Provider (OpenAI-compatible) via Vercel AI SDK               │
└─────────────────────────────────────────────────────────────────┘
```

## Data Models

### Conversation (前端 + 数据库)
```
Conversation
- id: string              // UUID
- title: string           // 会话标题
- createdAt: number       // Unix timestamp ms
- updatedAt: number       // Unix timestamp ms
```

### Message (前端)
```
Message
- id: string              // UUID
- conversationId: string // 所属会话
- role: 'user' | 'assistant' | 'system'
- content: string         // 消息内容
- reasoning?: string      // AI 思考过程
- tools?: ToolCall[]     // 工具调用
- status: 'streaming' | 'error' | 'complete'
- createdAt: number
```

### FileResource (前端 + 数据库)
```
FileResource
- id: string              // UUID
- conversationId: string  // 所属会话
- name: string            // 文件名
- type: 'code' | 'document' | 'image'
- content: string         // 文件内容或 URL
- language?: string       // 编程语言（code 类型）
- size: number            // 文件大小 bytes
- createdAt: number
```

### ToolCall (前端)
```
ToolCall
- id: string
- name: string
- input: Record<string, unknown>
- output?: unknown
```

## Database Schema

### New Tables (packages/server/src/schema.ts)

```typescript
// conversations table
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// messages table
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  reasoning: text("reasoning"),
  toolsJson: text("tools_json"),
  status: text("status", { enum: ["streaming", "error", "complete"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// file_resources table
export const fileResources = sqliteTable("file_resources", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  name: text("name").notNull(),
  type: text("type", { enum: ["code", "document", "image"] }).notNull(),
  content: text("content").notNull(),
  language: text("language"),
  size: integer("size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

## API Endpoints

### Conversations

#### GET /api/lui/conversations
获取会话列表

**Response:**
```json
{
  "items": [
    { "id": "...", "title": "...", "createdAt": 1234567890, "updatedAt": 1234567890 }
  ]
}
```

#### POST /api/lui/conversations
创建新会话

**Request:**
```json
{ "title": "新会话" }
```

**Response:**
```json
{ "id": "...", "title": "新会话", "createdAt": 1234567890, "updatedAt": 1234567890 }
```

#### GET /api/lui/conversations/:id
获取会话详情（包括消息）

**Response:**
```json
{
  "conversation": { "id": "...", "title": "...", "createdAt": 1234567890, "updatedAt": 1234567890 },
  "messages": [
    { "id": "...", "role": "user", "content": "...", "status": "complete", "createdAt": 1234567890 }
  ],
  "files": [
    { "id": "...", "name": "...", "type": "code", "language": "typescript", "size": 1024 }
  ]
}
```

#### DELETE /api/lui/conversations/:id
删除会话

**Response:**
```json
{ "id": "..." }
```

### Messages

#### POST /api/lui/conversations/:id/messages
发送消息（流式响应）

**Request:**
```json
{
  "content": "帮我分析这个候选人",
  "fileIds": ["file-1", "file-2"]  // 可选，附加的文件
}
```

**Response:** `text/event-stream`
```
data: {"type":"reasoning","content":"思考中..."}
data: {"type":"tool","tool":{"name":"searchCandidates","input":{}}}
data: {"type":"text","content":"根据分析..."}
data: {"type":"done"}
```

### Files

#### POST /api/lui/files
上传文件

**Request:** `multipart/form-data`
- file: File
- conversationId: string

**Response:**
```json
{
  "id": "...",
  "name": "resume.pdf",
  "type": "document",
  "size": 102400,
  "content": "...base64 or text content..."
}
```

#### GET /api/lui/files/:id
获取文件内容

#### DELETE /api/lui/files/:id
删除文件

## Components

### LUIView.vue (主视图)
- 三栏 Flexbox 布局
- 响应式调整（移动端折叠侧边栏）
- 状态管理：加载会话列表、当前会话消息

### ConversationList.vue (会话列表)
- Props: `selectedId: string | null`
- Emits: `select(id)`, `create()`, `delete(id)`
- 状态：hover 高亮、选中态

### ChatMessage.vue (消息渲染)
- Props: `message: Message`
- 支持 Markdown 渲染（marked + sanitize-html）
- 折叠/展开思考内容
- 工具调用展示
- 流式打字效果

### PromptInput.vue (输入框)
- Props: `modelValue: string`, `disabled: boolean`
- Emits: `update:modelValue`, `send(text)`, `selectCommand(cmd)`, `fileUpload(files)`
- 自动增高 textarea
- Enter 发送，Shift+Enter 换行
- Slash command 下拉菜单
- 文件上传按钮

### FileResources.vue (文件资源)
- 从 store 读取文件列表
- 按类型分组展示
- 预览、下载、删除操作

## Frontend Store (lui.ts)

```typescript
interface LUIState {
  conversations: Conversation[]
  selectedId: string | null
  messages: Record<string, Message[]>  // conversationId -> messages
  fileResources: Record<string, FileResource[]>  // conversationId -> files
}

actions:
- selectConversation(id)
- createConversation(title?)
- deleteConversation(id)
- addMessage(conversationId, message)
- updateMessage(conversationId, messageId, updates)
- addFileResource(conversationId, file)
- removeFileResource(conversationId, fileId)
- loadConversation(id)  // 加载会话详情
```

## Error Handling

### Error Scenarios

1. **网络断开**
   -  Handling: 显示重连按钮
   -  User Impact: 无法发送消息，显示离线状态

2. **AI 服务不可用**
   -  Handling: 显示错误消息，提供重试按钮
   -  User Impact: 看到错误提示，可选择重试

3. **文件上传失败**
   -  Handling: 显示错误 toast，保留输入内容
   -  User Impact: 看到错误消息，可重新选择文件

4. **会话加载失败**
   -  Handling: 显示错误状态，提供重试按钮
   -  User Impact: 看到错误提示，可选择重试

5. **消息发送失败**
   -  Handling: 消息标记为失败，显示重试按钮
   -  User Impact: 看到失败状态，可重发消息

## Testing Strategy

### Unit Testing
- Store actions: 测试 CRUD 操作
- Component rendering: 测试不同状态下的 UI
- Markdown rendering: 测试安全过滤

### Integration Testing
- API 端点测试
- 前端与后端联调
- 流式响应处理

### E2E Testing
- 完整对话流程
- 文件上传下载流程
- 会话切换流程
