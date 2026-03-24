# Tasks Document

## Phase 1: 核心类型和状态管理

- [ ] 1. 扩展 LUI 类型定义
  - File: `apps/web/src/stores/lui/types.ts`
  - 添加 Agent, ModelConfig, ModelProvider, Credential, ChatConfig, Task 类型
  - 扩展现有 Conversation 类型以支持 AI Gateway 配置
  - Purpose: 建立 AI Gateway 完整的类型系统
  - _Leverage: 现有 types.ts 中的 Conversation, Message, FileResource 类型_
  - _Requirements: 全部_
  - _Prompt: Role: TypeScript Developer | Task: 在 apps/web/src/stores/lui/types.ts 中添加 AI Gateway 相关类型定义，包括 Agent、ModelConfig、ModelProvider、Credential、ChatConfig、Task 等接口，并扩展 Conversation 类型以支持 agentId、modelId、temperature 字段 | Restrictions: 必须与现有类型风格一致，使用严格的类型定义，避免 any 类型 | Success: 所有类型定义完整，TypeScript 编译通过_

- [ ] 2. 创建 Agent Store 模块
  - File: `apps/web/src/stores/lui/agents.ts`
  - 实现 Agent 的 CRUD 操作和状态管理
  - 添加默认智能体逻辑
  - Purpose: 管理智能体配置状态
  - _Leverage: 现有 store 模块化模式 (conversations.ts, messages.ts)_
  - _Requirements: 1_
  - _Prompt: Role: Vue/Pinia Developer | Task: 创建 apps/web/src/stores/lui/agents.ts，实现 Agent store 模块，包含 loadAgents、createAgent、updateAgent、deleteAgent、selectAgent 方法，以及 agents、selectedAgent、isLoading 等状态 | Restrictions: 使用与现有 store 模块相同的模式，使用 refs 和 computed，确保响应式 | Success: Store 功能完整，可与现有 lui.ts 集成_

- [ ] 3. 创建 Model Store 模块
  - File: `apps/web/src/stores/lui/models.ts`
  - 实现模型列表管理和选择状态
  - 集成模型提供商注册表
  - Purpose: 管理 AI 模型配置
  - _Leverage: 现有 store 模块化模式_
  - _Requirements: 2_
  - _Prompt: Role: Vue/Pinia Developer | Task: 创建 apps/web/src/stores/lui/models.ts，实现 Model store 模块，包含 loadModels、selectModel、getModelById 方法，以及 models、selectedModel、isLoading 状态。预置 OpenAI、Anthropic、Google 等提供商的模型配置 | Restrictions: 模型配置硬编码或从 API 加载，支持按提供商分组 | Success: 模型列表正确显示，选择功能正常_

- [ ] 4. 创建 Credential Store 模块
  - File: `apps/web/src/stores/lui/credentials.ts`
  - 实现凭证状态管理（授权状态，非密钥本身）
  - 集成 Tauri OS Keyring API
  - Purpose: 安全地管理 AI 服务凭证
  - _Leverage: Tauri API @tauri-apps/plugin-stronghold 或 @tauri-apps/api/os_
  - _Requirements: 4_
  - _Prompt: Role: Vue/Tauri Developer | Task: 创建 apps/web/src/stores/lui/credentials.ts，实现 Credential store 模块，包含 checkAuthStatus、authorize、revoke、getApiKey 方法。凭证存储使用 Tauri OS Keyring API，内存中仅保留授权状态 | Restrictions: API Key 绝不能明文存储在内存或 localStorage，必须使用系统 Keyring | Success: 授权流程完整，凭证安全存储，状态正确同步_

- [ ] 5. 创建 Task Queue Store 模块
  - File: `apps/web/src/stores/lui/task-queue.ts`
  - 实现任务队列状态管理
  - 支持任务添加、更新、完成、失败状态流转
  - Purpose: 管理 AI 任务队列和进度显示
  - _Leverage: 现有 store 模式_
  - _Requirements: 5_
  - _Prompt: Role: Vue/Pinia Developer | Task: 创建 apps/web/src/stores/lui/task-queue.ts，实现 TaskQueue store 模块，包含 addTask、updateTask、completeTask、failTask、removeTask 方法，以及 tasks、isProcessing、currentTask 状态。支持最大并发数限制 | Restrictions: 任务状态流转必须清晰，支持进度更新 | Success: 任务队列正常工作，状态更新及时，UI 能正确反映队列状态_

- [ ] 6. 集成 AI Gateway 到主 Store
  - File: `apps/web/src/stores/lui.ts` (修改)
  - 导入并整合所有 AI Gateway 子模块
  - 添加 chatConfig 状态
  - Purpose: 统一暴露 AI Gateway 功能
  - _Leverage: 现有 store 组合模式_
  - _Requirements: 全部_
  - _Prompt: Role: Vue/Pinia Developer | Task: 修改 apps/web/src/stores/lui.ts，导入 agents、models、credentials、task-queue 模块并整合到主 store。添加 chatConfig 状态（包含 agentId、modelId、temperature） | Restrictions: 保持现有 store 结构不变，新增模块通过展开运算符导出 | Success: 主 store 导出所有 AI Gateway 功能，类型检查通过_

## Phase 2: 后端 API 扩展

- [ ] 7. 扩展后端 Agent API
  - File: `packages/server/src/routes.ts` (添加路由)
  - 实现 GET/POST/PUT/DELETE /api/lui/agents
  - Purpose: 支持智能体的服务端持久化
  - _Leverage: 现有 /api/lui/agents 路由模式_
  - _Requirements: 1_
  - _Prompt: Role: Bun/TypeScript Backend Developer | Task: 在 packages/server/src/routes.ts 中添加完整的 Agent CRUD API 路由，包括 GET /api/lui/agents（列表）、POST /api/lui/agents（创建）、PUT /api/lui/agents/:id（更新）、DELETE /api/lui/agents/:id（删除）| Restrictions: 遵循现有路由风格，使用 zod 验证，返回统一响应格式 | Success: API 端点工作正常，数据库操作正确_

- [ ] 8. 创建模型注册表 API
  - File: `packages/server/src/routes.ts` (添加路由)
  - 实现 GET /api/lui/models 返回可用模型列表
  - Purpose: 动态获取支持的 AI 模型
  - _Leverage: 现有路由模式_
  - _Requirements: 2_
  - _Prompt: Role: Bun/TypeScript Backend Developer | Task: 在 packages/server/src/routes.ts 中添加 GET /api/lui/models 路由，返回支持的模型列表（OpenAI GPT-4/GPT-3.5、Anthropic Claude、Google Gemini 等），包含模型 ID、名称、提供商、能力等信息 | Restrictions: 模型列表可硬编码或从配置读取 | Success: 模型列表正确返回，前端能正确显示_

- [ ] 9. 扩展消息发送 API 支持配置参数
  - File: `packages/server/src/routes.ts` (修改现有路由)
  - 修改 POST /api/lui/conversations/:id/messages 以接受 agentId、modelId、temperature
  - 根据配置调用相应 AI 服务
  - Purpose: 使聊天 API 支持 AI Gateway 配置
  - _Leverage: 现有 streamText 实现_
  - _Requirements: 1, 2, 3_
  - _Prompt: Role: Bun/TypeScript Backend Developer | Task: 修改现有的 POST /api/lui/conversations/:id/messages 路由，在请求体中接受 agentId、modelId、temperature 参数。根据 modelId 选择对应的 AI 提供商，使用 agent 的 system prompt 和 tools 配置 | Restrictions: 保持流式响应不变，根据配置动态调整 AI 调用参数 | Success: 不同模型和智能体配置能产生不同的 AI 响应_

## Phase 3: 前端 UI 组件

- [ ] 10. 创建 Agent Selector 组件
  - File: `apps/web/src/components/lui/agent-selector.vue`
  - 实现智能体选择下拉菜单
  - 支持显示智能体名称、描述
  - 提供创建/编辑入口
  - Purpose: 在工具栏中切换智能体
  - _Leverage: DropdownMenu, Button, Badge 组件_
  - _Requirements: 1_
  - _Prompt: Role: Vue/shadcn-ui Developer | Task: 创建 apps/web/src/components/lui/agent-selector.vue，实现智能体选择器。使用 shadcn-vue DropdownMenu 组件，显示当前选中智能体，下拉列表展示所有智能体（带描述），底部提供"创建智能体"入口 | Restrictions: 使用与 candidate-selector.vue 类似的模式，遵循 shadcn 设计规范 | Success: 组件可正常切换智能体，UI 符合设计系统_

- [ ] 11. 创建 Model Selector 组件
  - File: `apps/web/src/components/lui/model-selector.vue`
  - 实现模型选择下拉菜单，按提供商分组
  - 显示授权状态（已授权/未授权）
  - 未授权模型显示授权按钮
  - Purpose: 在工具栏中切换 AI 模型
  - _Leverage: DropdownMenu, Badge, Button 组件_
  - _Requirements: 2_
  - _Prompt: Role: Vue/shadcn-ui Developer | Task: 创建 apps/web/src/components/lui/model-selector.vue，实现模型选择器。按提供商分组显示模型列表，每个模型显示授权状态（使用 Badge 组件：绿色"已授权"、黄色"未授权"），未授权模型点击后弹出授权对话框 | Restrictions: 分组显示使用 DropdownMenuGroup/Label，授权状态实时更新 | Success: 模型列表正确分组，授权状态准确显示，选择功能正常_

- [ ] 12. 创建 Temperature Control 组件
  - File: `apps/web/src/components/lui/temperature-control.vue`
  - 实现三档按钮（精确/平衡/创意）
  - 提供精确滑块（0.0-1.0）
  - 显示当前档位视觉反馈
  - Purpose: 调节 AI 输出强度
  - _Leverage: Button, Slider, Tooltip 组件_
  - _Requirements: 3_
  - _Prompt: Role: Vue/shadcn-ui Developer | Task: 创建 apps/web/src/components/lui/temperature-control.vue，实现温度控制器。使用 ButtonGroup 显示三档按钮（精确 0.0、平衡 0.5、创意 1.0），点击展开 Slider 滑块进行精确调节。使用图标区分不同档位（如雪花/太阳图标）| Restrictions: Slider 范围 0-1，步进 0.1，视觉反馈清晰 | Success: 三档切换正常，滑块精确调节有效，视觉反馈明显_

- [ ] 13. 创建 Auth Dialog 组件
  - File: `apps/web/src/components/lui/auth-dialog.vue`
  - 实现 OAuth/API Key 授权对话框
  - 支持 OAuth 流程和手动输入 API Key
  - 显示授权成功/失败状态
  - Purpose: 一键授权 AI 服务
  - _Leverage: Dialog, Input, Button, Alert 组件_
  - _Requirements: 4_
  - _Prompt: Role: Vue/shadcn-ui Developer | Task: 创建 apps/web/src/components/lui/auth-dialog.vue，实现授权对话框。根据提供商显示不同的授权方式（OAuth 按钮或 API Key 输入框），提交后调用 credential store 进行授权，显示加载状态和结果反馈 | Restrictions: API Key 输入使用 password 类型，支持显示/隐藏切换 | Success: 授权流程完整，状态反馈清晰，凭证安全存储_

- [ ] 14. 创建 Task Queue Indicator 组件
  - File: `apps/web/src/components/lui/task-queue-indicator.vue`
  - 实现待办指示器条
  - 显示当前任务和队列数量
  - 支持展开查看详细任务列表
  - Purpose: 展示 AI 任务处理状态
  - _Leverage: Badge, Progress, Collapsible 组件_
  - _Requirements: 5_
  - _Prompt: Role: Vue/shadcn-ui Developer | Task: 创建 apps/web/src/components/lui/task-queue-indicator.vue，实现待办指示器。固定在输入框上方，显示当前处理任务和队列数量，点击展开 Collapsible 查看所有任务详情，包含进度条和状态标识 | Restrictions: 自动显示/隐藏（有任务时显示），不影响输入框使用 | Success: 指示器状态同步准确，UI 不突兀，信息展示清晰_

- [ ] 15. 创建 AI Gateway Toolbar 组件
  - File: `apps/web/src/components/lui/ai-gateway-toolbar.vue`
  - 整合所有选择器组件到工具栏
  - 放在 PromptInput 下方或集成到其中
  - Purpose: 统一的 AI Gateway 控制面板
  - _Leverage: AgentSelector, ModelSelector, TemperatureControl 组件_
  - _Requirements: 全部_
  - _Prompt: Role: Vue/shadcn-ui Developer | Task: 创建 apps/web/src/components/lui/ai-gateway-toolbar.vue，作为 AI Gateway 控制容器。整合 AgentSelector（左）、ModelSelector（中）、TemperatureControl（右）到一行工具栏，使用 flex justify-between 布局 | Restrictions: 保持紧凑设计，不占用过多垂直空间，各组件间距合理 | Success: 工具栏布局美观，各选择器功能正常，整体协调_

## Phase 4: 集成和验证

- [ ] 16. 集成 AI Gateway Toolbar 到 LUIView
  - File: `apps/web/src/views/LUIView.vue` (修改)
  - 在 PromptInput 上方添加 TaskQueueIndicator
  - 在 PromptInput 内或下方添加 AI Gateway Toolbar
  - 绑定所有状态和方法
  - Purpose: 完整的 LUI AI Gateway 界面
  - _Leverage: AI Gateway Toolbar, Task Queue Indicator 组件_
  - _Requirements: 全部_
  - _Prompt: Role: Vue Developer | Task: 修改 apps/web/src/views/LUIView.vue，在 PromptInput 上方添加 TaskQueueIndicator 组件，在输入区域添加 AI Gateway Toolbar。绑定 agent、model、temperature 等状态，确保选择器变更时更新 chatConfig | Restrictions: 保持现有布局结构，新组件融入自然 | Success: LUI 界面完整，所有 AI Gateway 功能可用，交互流畅_

- [ ] 17. 更新 API 客户端支持新参数
  - File: `apps/web/src/api/lui.ts` (修改)
  - 扩展 sendMessage 方法接受 agentId、modelId、temperature
  - 添加 getAgents、createAgent、updateAgent、deleteAgent 方法
  - 添加 getModels 方法
  - Purpose: 前端 API 支持 AI Gateway 功能
  - _Leverage: 现有 api/lui.ts 模式_
  - _Requirements: 全部_
  - _Prompt: Role: TypeScript/Frontend Developer | Task: 修改 apps/web/src/api/lui.ts，扩展 sendMessage 以发送 chatConfig 参数，添加 Agent 和 Model 相关的 API 方法（与后端路由对应）| Restrictions: 遵循现有 API 客户端模式，返回类型使用共享类型定义 | Success: API 方法完整，类型正确，调用正常_

- [ ] 18. 创建 Agent 管理对话框
  - File: `apps/web/src/components/lui/agent-dialog.vue`
  - 实现智能体创建/编辑对话框
  - 包含名称、描述、system prompt、工具选择表单
  - Purpose: 管理智能体配置
  - _Leverage: Dialog, Input, Textarea, Checkbox 组件_
  - _Requirements: 1_
  - _Prompt: Role: Vue/shadcn-ui Developer | Task: 创建 apps/web/src/components/lui/agent-dialog.vue，实现智能体管理对话框。表单包含：名称输入、描述输入、system prompt 文本域、工具多选框（现有工具列表）。支持创建和编辑模式 | Restrictions: 表单验证完整，system prompt 支持多行 | Success: 智能体能正常创建和编辑，数据持久化正确_

- [ ] 19. 添加 Mock 数据支持 AI Gateway
  - File: `apps/web/mock/lui/` 目录下新增文件
  - 创建 agents.mock.ts、models.mock.ts、credentials.mock.ts
  - Purpose: 支持 mock 模式下测试 AI Gateway
  - _Leverage: 现有 mock 文件模式_
  - _Requirements: 全部_
  - _Prompt: Role: TypeScript/Mock Developer | Task: 在 apps/web/mock/lui/ 目录下创建 agents.mock.ts（智能体 CRUD）、models.mock.ts（模型列表）mock 文件，参考现有 mock 文件格式，使用 defineMock 导出 mock 配置 | Restrictions: mock 数据符合类型定义，支持所有 CRUD 操作 | Success: mock 模式下 AI Gateway 功能完整可用_

- [ ] 20. TypeCheck 和最终验证
  - 全项目类型检查
  - 构建验证
  - 功能集成测试
  - Purpose: 确保代码质量和功能完整
  - _Leverage: pnpm typecheck, pnpm build_
  - _Requirements: 全部_
  - _Prompt: Role: QA/TypeScript Developer | Task: 运行 pnpm typecheck 检查全项目类型，修复所有类型错误。运行 pnpm build 确保构建成功。验证所有 AI Gateway 功能在 mock 模式下正常工作 | Restrictions: 零类型错误，构建成功，功能正常 | Success: 类型检查通过，构建成功，功能验证通过_

## 进度追踪

| Phase | 任务 | 状态 | 优先级 |
|-------|------|------|--------|
| Phase 1 | 1-6 | ⏳ | 高 |
| Phase 2 | 7-9 | ⏳ | 高 |
| Phase 3 | 10-15 | ⏳ | 高 |
| Phase 4 | 16-20 | ⏳ | 中 |

图例：✅ 已完成 | 🔄 进行中 | ⏳ 待开始 | ❌ 阻塞
