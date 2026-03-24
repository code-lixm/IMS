# Tasks Document

- [x] 1. 重构统一 API 客户端为协议感知型请求层
  - File: `apps/web/src/api/client.ts`
  - 建立 `requestJson`、`requestForm`、`requestText`、`requestStream` 等基础能力
  - 统一支持错误映射、取消控制、超时与 envelope 解析
  - Purpose: 为前端所有模块提供稳定一致的数据访问基础设施
  - _Leverage: `apps/web/src/api/client.ts`, `apps/web/src/api/auth.ts`, `apps/web/src/api/import.ts`, `apps/web/src/api/lui.ts`_
  - _Requirements: 1, 4, 6_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端基础设施工程师 | Task: 重构统一 API 客户端，使其正确支持 JSON、FormData、流式响应、错误模型、请求取消与超时控制，并保持与现有 `@ims/shared` 响应契约兼容 | Restrictions: 不要在页面或组件里继续散落协议细节；不要使用危险断言绕过类型；不要破坏现有 `auth`、`candidates`、`import` 基础请求能力 | _Leverage: 现有 `api/client.ts` 与各领域 API 模块 | _Requirements: Requirement 1, Requirement 4, Requirement 6 | Success: 新 client 能覆盖现有协议类型；FormData 不再错误设置 JSON header；错误模型统一；调用方接口清晰；完成后先记录实现日志，再把任务从 `[-]` 改为 `[x]`_

- [x] 2. 收口 LUI API 并新增流式消息协议封装
  - File: `apps/web/src/api/lui.ts`, `apps/web/src/api/core/stream.ts`
  - 将消息流发送与事件解析从 store 中迁移到 API/协议层
  - Purpose: 将流式协议与业务状态解耦
  - _Leverage: `apps/web/src/api/lui.ts`, `apps/web/src/stores/lui.ts`_
  - _Requirements: 1, 2, 4_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端协议与实时交互工程师 | Task: 为 LUI 建立专用流式消息 API 与 parser，把消息流解析逻辑移出 store，支持跨 chunk 拼接、事件边界识别、错误事件输出与请求取消 | Restrictions: 不要继续在 store 里直接读取 `ReadableStream`；不要保留静默吞错的解析方式；不要破坏现有会话与文件接口 | _Leverage: 现有 `api/lui.ts`、`stores/lui.ts` 中的流式发送语义 | _Requirements: Requirement 1, Requirement 2, Requirement 4 | Success: LUI API 拥有清晰的流式发送接口；事件解析可靠；上层不再关心底层 stream 细节；完成后记录实现日志并更新任务状态_

- [x] 3. 拆分 LUI store 为按领域职责划分的状态模块
  - File: `apps/web/src/stores/lui.ts` → `apps/web/src/stores/lui/*`
  - 拆出 conversations、messages、files 等状态模块
  - Purpose: 降低 LUI 单文件复杂度并明确边界
  - _Leverage: `apps/web/src/stores/lui.ts`, `apps/web/src/stores/auth.ts`, `apps/web/src/stores/candidates.ts`_
  - _Requirements: 2, 5, 6_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Vue 状态管理工程师 | Task: 将当前 LUI store 按会话、消息、文件资源等领域拆分，建立清晰的状态边界和 action 入口，并保留现有业务语义 | Restrictions: 不要把协议解析逻辑留在 store；不要让新 store 相互循环依赖；不要破坏当前页面可消费的核心能力 | _Leverage: `auth.ts`、`candidates.ts` 的轻量 store 模式 | _Requirements: Requirement 2, Requirement 5, Requirement 6 | Success: LUI 状态职责分明；单文件复杂度明显下降；页面能通过清晰接口访问状态；完成后记录实现日志并更新任务状态_

- [x] 4. 修复 LUI 页面与组件的单向数据流契约
  - File: `apps/web/src/views/LUIView.vue`, `apps/web/src/components/lui/conversation-list.vue`, `apps/web/src/components/lui/prompt-input.vue`
  - 统一会话选择、删除、发送消息、文件上传的父子通信方式
  - Purpose: 消除重复副作用与失效事件契约
  - _Leverage: `apps/web/src/views/LUIView.vue`, `apps/web/src/components/lui/*`_
  - _Requirements: 1, 2, 5_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Vue 组件架构工程师 | Task: 修复 LUI 页面与子组件之间的事件契约，使组件成为纯展示/受控组件，消除重复 store 调用、重复 emit 和失效的上传事件绑定 | Restrictions: 不要让组件内部再同时持有业务副作用与事件上抛；不要保留 `@file-upload` 与 prop callback 语义不一致的问题 | _Leverage: 现有 `LUIView.vue`、`conversation-list.vue`、`prompt-input.vue` | _Requirements: Requirement 1, Requirement 2, Requirement 5 | Success: 会话与消息操作只触发一次；上传事件契约一致；页面和组件职责清晰；完成后记录实现日志并更新任务状态_

- [x] 5. 为 LUI 增加候选人绑定持久化与初始化编排
  - File: `apps/web/src/views/LUIView.vue`, `apps/web/src/api/lui.ts`, `apps/web/src/composables/lui/*`
  - 实现候选人绑定/解绑持久化与会话初始化流程
  - Purpose: 消除本地假成功状态并补齐首屏链路
  - _Leverage: `apps/web/src/views/LUIView.vue`, `apps/web/src/api/lui.ts`_
  - _Requirements: 2, 4_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端业务流程工程师 | Task: 为 LUI 建立明确的初始化流程，并实现候选人绑定的 API 持久化、失败回滚与用户反馈 | Restrictions: 不要继续只在本地修改 `candidateId`；不要让页面自行管理复杂副作用；不要破坏现有会话切换体验 | _Leverage: 现有 LUI 页面与会话数据结构 | _Requirements: Requirement 2, Requirement 4 | Success: LUI 首屏初始化明确；绑定操作可持久化；失败时状态一致并有提示；完成后记录实现日志并更新任务状态_

- [x] 6. 重构导入页面为页面壳层 + 业务 composables
  - File: `apps/web/src/views/ImportView.vue`, `apps/web/src/composables/import/*`, `apps/web/src/api/import.ts`
  - 将轮询、文件选择、冲突处理、状态格式化从页面中抽离
  - Purpose: 控制页面复杂度并统一导入流程实现
  - _Leverage: `apps/web/src/views/ImportView.vue`, `apps/web/src/api/import.ts`, `apps/web/src/api/share.ts`_
  - _Requirements: 3, 4, 5_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端流程与页面重构工程师 | Task: 将导入页面拆分为布局层与业务 composables，收口所有导入相关请求到 `import` 领域 API，并建立串行轮询、文件选择与冲突处理能力 | Restrictions: 不要继续在页面中直接 `fetch`；不要保留 `setInterval(async ...)` 的重入风险；不要把平台细节散落在页面模板脚本中 | _Leverage: 现有 Import 页面与导入/共享 API | _Requirements: Requirement 3, Requirement 4, Requirement 5 | Success: Import 页面职责显著收敛；轮询可靠；文件选择与冲突处理可复用；完成后记录实现日志并更新任务状态_

- [x] 7. 重构候选人页面的交互与副作用组织
  - File: `apps/web/src/views/CandidatesView.vue`, `apps/web/src/composables/candidates/*`, `apps/web/src/components/candidates/*`
  - 将搜索、防抖、导入、导出、工作台打开等副作用从页面中拆出
  - Purpose: 建立候选人模块的可维护页面结构
  - _Leverage: `apps/web/src/views/CandidatesView.vue`, `apps/web/src/stores/candidates.ts`, `apps/web/src/api/opencode.ts`, `apps/web/src/api/share.ts`_
  - _Requirements: 1, 4, 5_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端页面架构工程师 | Task: 将 Candidates 页面拆分为页面头部、搜索、列表、创建弹窗和行为 composables，统一处理搜索取消、防抖、导入、导出与工作台打开反馈 | Restrictions: 不要继续使用 `alert`；不要让页面脚本承担所有副作用；不要破坏当前候选人浏览与创建流程 | _Leverage: 现有 Candidates 页面、candidates store 与相关 API | _Requirements: Requirement 1, Requirement 4, Requirement 5 | Success: Candidates 页面更易维护；用户反馈统一；副作用从页面中抽离；完成后记录实现日志并更新任务状态_

- [x] 8. 建立统一通知与错误处理机制
  - File: `apps/web/src/lib/errors/*`, `apps/web/src/composables/use-app-notifications.ts`, 受影响页面与组件
  - 统一替换 `alert`、静默吞错和零散错误输出
  - Purpose: 提供一致、可观测的错误与反馈体验
  - _Leverage: `apps/web/src/components/app-user-actions.vue`, `apps/web/src/views/CandidatesView.vue`, `apps/web/src/views/ImportView.vue`, `apps/web/src/views/LoginView.vue`_
  - _Requirements: 4, 6_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端可靠性工程师 | Task: 建立统一通知与错误处理机制，替换 `alert`、`.catch(() => undefined)`、空 `catch` 和零散错误输出模式 | Restrictions: 不要仅保留 `console.error` 作为用户反馈；不要引入与现有 UI 体系冲突的提示方式；不要隐藏关键错误上下文 | _Leverage: 现有页面中的错误处理点 | _Requirements: Requirement 4, Requirement 6 | Success: 用户反馈一致；错误可分类、可展示、可记录；危险吞错模式被清理；完成后记录实现日志并更新任务状态_

- [x] 9. 统一 Markdown/HTML 安全渲染链路
  - File: `apps/web/src/lib/render/render-safe-markdown.ts`, `apps/web/src/components/lui/chat-message.vue`, `apps/web/src/components/lui/file-resources.vue`
  - 统一所有 `v-html` 的生成路径与安全净化策略
  - Purpose: 建立单一安全基线，降低渲染风险
  - _Leverage: `apps/web/src/components/lui/file-resources.vue`, `apps/web/src/components/lui/chat-message.vue`_
  - _Requirements: 4, 6_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端安全工程师 | Task: 为项目建立统一的 Markdown/HTML 安全渲染器，并将所有 `v-html` 使用点迁移到该能力上 | Restrictions: 不要保留 regex sanitize 与 DOMPurify 并存的模式；不要让组件继续各自定义渲染与净化逻辑 | _Leverage: 现有 markdown 渲染实现与 DOMPurify 引入 | _Requirements: Requirement 4, Requirement 6 | Success: 全部 HTML 渲染走统一入口；净化策略一致；组件职责更纯；完成后记录实现日志并更新任务状态_

- [x] 10. 引入平台文件选择适配与显式类型建模
  - File: `apps/web/src/composables/use-file-picker.ts`, 受影响页面与组件
  - 显式封装桌面场景文件路径与浏览器文件对象的适配
  - Purpose: 消除页面中散落的 `File & { path?: string }` 断言
  - _Leverage: `apps/web/src/views/ImportView.vue`, `apps/web/src/views/CandidatesView.vue`, `apps/web/src/composables/use-file-upload.ts`_
  - _Requirements: 3, 5, 6_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端平台适配工程师 | Task: 封装统一文件选择能力与文件类型适配器，为桌面场景下的本地路径与浏览器 `File` 建立显式模型 | Restrictions: 不要继续在页面里零散使用 `File & { path?: string }`；不要把 DOM input 创建逻辑保留在多个页面里 | _Leverage: 现有文件上传/导入逻辑 | _Requirements: Requirement 3, Requirement 5, Requirement 6 | Success: 文件选择能力统一；类型更明确；页面摆脱平台细节；完成后记录实现日志并更新任务状态_

- [x] 11. 抽取通用页面壳层与重复布局组件
  - File: `apps/web/src/components/layout/*`, 受影响 views
  - 抽象重复 header / shell / 顶部操作结构
  - Purpose: 降低页面模板重复度并统一页面组织方式
  - _Leverage: `apps/web/src/views/CandidatesView.vue`, `apps/web/src/views/ImportView.vue`, `apps/web/src/views/SettingsView.vue`, `apps/web/src/views/CandidateDetailView.vue`_
  - _Requirements: 5_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端 UI 架构工程师 | Task: 从多个页面中抽取统一页面壳层、头部与顶栏操作组件，减少重复布局与重复模板结构 | Restrictions: 不要改变现有核心交互语义；不要在抽象过程中引入过度通用、难以理解的 layout 体系 | _Leverage: 当前各 views 中重复的 header 与 top action 结构 | _Requirements: Requirement 5 | Success: 页面模板更短、更一致；重复布局被抽离；不影响现有业务路径；完成后记录实现日志并更新任务状态_

- [x] 12. 补齐测试与前端治理规则
  - File: 测试文件、前端规则配置文件、相关文档
  - 为 API client、stream parser、关键 composable、关键组件交互补测试，并建立治理规则
  - Purpose: 防止重构后回归并阻止旧问题再次进入代码库
  - _Leverage: `apps/web/package.json`, 现有 `typecheck` 脚本, 本次新增模块_
  - _Requirements: 6_
  - _Prompt: Implement the task for spec web-frontend-architecture-hardening, first run spec-workflow-guide to get the workflow guide then implement the task: Role: 前端质量工程师 | Task: 为本次整改涉及的关键基础设施和高风险交互补充测试，并建立最小必要的前端治理规则，防止直接 `fetch`、`alert`、空 `catch` 与危险断言再次出现 | Restrictions: 不要引入与当前项目不匹配的过重测试体系；不要只补表面测试而忽略高风险逻辑；不要让规则无法落地 | _Leverage: 现有 `typecheck` 与本次重构后的模块 | _Requirements: Requirement 6 | Success: 关键链路有测试覆盖；基础治理规则可执行；后续开发可遵循；完成后记录实现日志并更新任务状态_
