# Local AI Workbench Tasks

## Implementation Progress

| 模块 | 状态 | 说明 |
|------|------|------|
| Mock LUI 组件 | [x] 完成 | prompt-input, conversation-list, chat-message, file-resources |
| Mock LUI 视图 | [x] 完成 | LUIView.vue 三栏布局 |
| Mock Store | [x] 完成 | lui.ts (mock 数据) |
| 路由配置 | [x] 完成 | /lui 路由 |
| Mock AI API | [x] 完成 | POST /api/chat (流式) |
| 数据库 Schema | [ ] 待完成 | conversations, messages, file_resources 表 |
| API 类型定义 | [ ] 待完成 | LUI 相关类型 |
| 前端 API 客户端 | [ ] 待完成 | api/lui.ts |
| 后端 API 路由 | [ ] 待完成 | 会话 CRUD + 消息流式 + 文件上传 |
| Store 持久化 | [ ] 待完成 | mock → API |
| 候选人上下文注入 | [ ] 待完成 | workspace context |

## Tasks

- [ ] 1. 扩展数据库 Schema
  - File: `packages/server/src/schema.ts`
  - File: `packages/shared/src/db-schema.ts`
  - 添加 conversations, messages, file_resources 表
  - _Leverage: `packages/server/src/schema.ts`, `packages/shared/src/db-schema.ts`
  - _Requirements: Design.md - Database Schema
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Extend the database schema to add three new tables for LUI: conversations, messages, and file_resources. Follow the schema defined in design.md. Add corresponding TypeScript types to db-schema.ts. Ensure Drizzle migrations are created.

- [ ] 2. 扩展 API 类型定义
  - File: `packages/shared/src/api-types.ts`
  - 添加 LUI 相关 API 类型
  - _Leverage: `packages/shared/src/api-types.ts`, Design.md - API Endpoints
  - _Requirements: Design.md - API Endpoints
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Add LUI-related TypeScript types to api-types.ts following the API endpoints defined in design.md. Include Conversation, Message, FileResource types and all API request/response types.

- [ ] 3. 创建前端 LUI API 客户端
  - File: `apps/web/src/api/lui.ts`
  - 实现会话 CRUD、消息发送、文件上传 API 调用
  - _Leverage: `apps/web/src/api/client.ts`, `apps/web/src/api/candidates.ts`
  - _Requirements: Design.md - API Endpoints
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Create a new API client module at apps/web/src/api/lui.ts following the existing patterns in client.ts. Implement all LUI API calls: conversations CRUD, message streaming, file upload/download/delete. Use the unified api() function for requests.

- [ ] 4. 实现后端会话 CRUD API
  - File: `packages/server/src/routes.ts`
  - 实现 GET/POST /api/lui/conversations, GET/DELETE /api/lui/conversations/:id
  - _Leverage: `packages/server/src/routes.ts`, existing candidate routes
  - _Requirements: Design.md - API Endpoints - Conversations
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Add conversation CRUD endpoints to routes.ts: GET /api/lui/conversations (list), POST /api/lui/conversations (create), GET /api/lui/conversations/:id (detail with messages and files), DELETE /api/lui/conversations/:id. Follow existing route patterns and use Drizzle ORM for database operations.

- [ ] 5. 实现后端消息流式 API
  - File: `packages/server/src/routes.ts`
  - 实现 POST /api/lui/conversations/:id/messages (流式响应)
  - _Leverage: `packages/server/src/routes.ts` (existing /api/chat), Vercel AI SDK
  - _Requirements: Design.md - API Endpoints - Messages
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Implement POST /api/lui/conversations/:id/messages endpoint for sending messages with streaming response. Use Vercel AI SDK's streamText with toUIMessageStreamResponse(). Save messages to database. Support reasoning and tool calls in the stream. Follow the existing /api/chat pattern but enhance it to save messages and support conversation context.

- [ ] 6. 实现后端文件管理 API
  - File: `packages/server/src/routes.ts`
  - 实现 POST /api/lui/files, GET /api/lui/files/:id, DELETE /api/lui/files/:id
  - _Leverage: `packages/server/src/routes.ts` (existing file download patterns)
  - _Requirements: Design.md - API Endpoints - Files
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Implement file management endpoints: POST /api/lui/files (multipart upload), GET /api/lui/files/:id (download/preview), DELETE /api/lui/files/:id. Store files in app data directory. Support code, document, and image types. Return file content as base64 or text.

- [ ] 7. 重构 lui.ts Store 持久化
  - File: `apps/web/src/stores/lui.ts`
  - 将 mock 数据替换为真实 API 调用
  - _Leverage: `apps/web/src/stores/lui.ts`, `apps/web/src/api/lui.ts`
  - _Requirements: Requirement 8 - 会话持久化
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Refactor lui.ts store to use real API calls instead of mock data. Replace conversations, messages, and fileResources refs with API-backed state. Implement all actions: selectConversation, createConversation, deleteConversation, addMessage, updateMessage, addFileResource, removeFileResource, loadConversation. Handle loading and error states.

- [ ] 8. 完善 LUIView.vue 集成
  - File: `apps/web/src/views/LUIView.vue`
  - 将 mock AI 响应替换为真实 API 调用
  - _Leverage: `apps/web/src/views/LUIView.vue`, `apps/web/src/api/lui.ts`
  - _Requirements: Requirement 3 - 消息发送与渲染, Requirement 7 - AI 流式响应
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Refactor LUIView.vue to use real API instead of simulateAIResponse(). Connect onSend to POST /api/lui/conversations/:id/messages. Handle streaming responses properly, updating messages in real-time. Ensure proper error handling and loading states.

- [ ] 9. 实现候选人上下文注入
  - File: `packages/server/src/services/lui-context.ts` (new)
  - 实现 buildCandidateContext() 注入候选人信息到 AI 对话
  - _Leverage: `packages/server/src/services/opencode-manager.ts` (buildCandidateContext), Design.md - Context Injection
  - _Requirements: Design.md - Context Injection
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Create a new service at packages/server/src/services/lui-context.ts to build candidate context for AI conversations. Implement buildCandidateContext(candidateId) that retrieves candidate info, resume text, interview history, and artifact summaries. Modify the message streaming endpoint to inject this context as system message when a conversation has an associated candidate.

- [ ] 10. 添加候选人-Workspace 关联
  - File: `packages/server/src/routes.ts`
  - 修改 LUI 会话支持关联候选人 ID
  - _Leverage: `packages/server/src/routes.ts`, `packages/server/src/schema.ts`
  - _Requirements: Requirement 8 - 会话持久化
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Add candidateId field to conversations table and API. When creating a LUI session from candidate context (e.g., from CandidateDetailView), associate the conversation with the candidate. Update GET /api/lui/conversations/:id to include candidate info in response.

- [ ] 11. 前端候选人选择器
  - File: `apps/web/src/components/lui/candidate-selector.vue` (new)
  - 在 LUI 中选择关联候选人
  - _Leverage: `apps/web/src/components/lui/conversation-list.vue`
  - _Requirements: Requirement 1 - 三栏布局界面
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Create a new CandidateSelector component that allows users to select a candidate for the current LUI conversation. Show a dropdown/search in the conversation header. When a candidate is selected, inject their context into the AI conversation. Follow existing component patterns with shadcn-vue.

- [ ] 12. TypeCheck 和构建验证
  - Run: `pnpm typecheck && pnpm build`
  - 验证所有 LUI 相关代码通过类型检查
  - _Leverage: Existing build scripts
  - _Requirements: All
  - _Prompt: Implement the task for spec local-ai-workbench, first run spec-workflow-guide to get the workflow guide then implement the task: Run typecheck and build for both @ims/web and @ims/server packages. Fix any type errors that arise from the LUI implementation. Ensure @ims/web and @ims/server build successfully.
