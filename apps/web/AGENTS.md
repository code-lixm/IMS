# @ims/web — Vue 3 SPA

## OVERVIEW

Vue 3 + Vite + Pinia + Vue Router 单页应用。负责候选人管理界面、AI 对话（LUI）、导入流水线等核心功能的前端呈现。

## STRUCTURE

```
apps/web/src/
├── main.ts              # Vue SPA 入口
├── App.vue              # 根组件
├── router/index.ts      # 路由配置
├── components/
│   ├── ui/             # shadcn-vue 风格组件库 (55 files)
│   └── lui/            # AI 对话界面组件 (12 files)
├── views/               # 页面视图
├── stores/              # Pinia 状态管理
├── api/                 # API 客户端 (13 files)
└── assets/             # 静态资源
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 路由配置 | `router/index.ts` | 8 routes，含 auth guard |
| 状态管理 | `stores/` | auth, lui, candidates, sync, onboarding |
| LUI 组件 | `components/lui/` | 12 个 AI 对话组件 |
| AI 对话视图 | `views/LUIView.vue` | 2046 行，巨型组件 |
| UI 组件库 | `components/ui/` | 55 个 shadcn-vue 风格组件 |
| API 客户端 | `api/` | 13 个模块化客户端 |
| 认证状态 | `stores/auth.ts` | authStore.ensureStatus() |

## CONVENTIONS (THIS PACKAGE)

- **路径别名** — `@/*` → `./src/*`
- **TS 严格模式** — `noUnusedLocals: true`, `noUnusedParameters: true`
- **Vite 开发服务器** — `:5173`，`/api` 代理到 `http://127.0.0.1:9092`
- **Tailwind CSS** — CSS 变量主题，`class` dark mode strategy
- **工厂模式** — `createLuiMessageModule` 而非 Pinia defineStore
- **无 ESLint/Prettier** — 依赖 TS strict 保证质量

## COMPONENT STRUCTURE

### UI 组件库 (`components/ui/`)

55 个 shadcn-vue 风格组件，按功能分组：

| 类别 | 组件 |
|------|------|
| 基础 | button, input, label, textarea, checkbox, badge, skeleton |
| 布局 | scroll-area, separator, resizable-panel(-group/-handle) |
| 数据展示 | table(/-head/-body/-row/-cell/-header), card, progress, circular-progress |
| 导航 | tabs(/-list/-trigger/-content) |
| 反馈 | alert(/-title/-description), tooltip(/-trigger/-content), dialog(/-title/-description/-close/-header/-footer) |
| 选择 | select(/-trigger/-content/-item/-label/-value), popover(/-trigger/-content), dropdown-menu(/-trigger/-content/-item/-label/-separator/-group) |
| 高级 | slider, empty-state |

### LUI 组件库 (`components/lui/`)

AI 对话界面专用组件：

| 组件 | 说明 |
|------|------|
| `LUIView.vue` | 主视图，2046 行，包含完整 AI 对话 UI |
| `conversation-list.vue` | 对话列表 |
| `gateway-endpoint-dialog.vue` | Gateway 端点配置 |
| `workflow-action-card.vue` | 工作流操作卡片 |
| `workflow-artifacts.vue` | 工作流产物展示 |
| `file-resources.vue` | 文件资源管理 |
| `task-queue-indicator.vue` | 任务队列指示器 |
| `agent-selector.vue` | Agent 选择器 |
| `candidate-selector.vue` | 候选人选择器 |
| `model-selector.vue` | 模型选择器 |
| `temperature-control.vue` | 温度参数控制 |
| `interview-score-upload-dialog.vue` | 面试评分上传 |
| `auth-dialog.vue` | 认证对话框 |

## ROUTING

`router/index.ts` 定义 8 条路由：

```typescript
/                   → redirect to /candidates
/login              → LoginView (guestOnly)
/candidates         → CandidatesView (requiresAuth)
/candidates/:id     → CandidateDetailView (requiresAuth)
/import             → ImportView (requiresAuth)
/settings           → SettingsView (requiresAuth)
/lui                → LUIView (requiresAuth)
/500                → ServerErrorView
/:pathMatch(.*)*    → NotFoundView
```

**Auth Guard** — `beforeEach` 调用 `authStore.ensureStatus()`，检查 `status === "valid"`。

## STATE MANAGEMENT

Pinia stores 在 `stores/`：

| Store | 文件 | 职责 |
|-------|------|------|
| auth | `auth.ts` | 认证状态，ensureStatus() |
| lui | `lui.ts` | AI 对话状态，createLuiMessageModule 工厂 |
| candidates | `candidates.ts` | 候选人列表和详情 |
| sync | `sync.ts` | 同步状态 |
| onboarding | `onboarding.ts` | 引导流程状态 |
| index | `index.ts` | pinia 实例导出 |

## API LAYER

`api/` 下 13 个模块化客户端，统一使用 `client.ts` 基础封装：

| 模块 | 文件 | 职责 |
|------|------|------|
| client | `client.ts` | 基础 fetch 封装，统一错误处理 |
| auth | `auth.ts` | 登录、登出、状态查询 |
| candidates | `candidates.ts` | 候选人 CRUD |
| interviews | `interviews.ts` | 面试记录 |
| lui | `lui.ts` | LUI AI 对话 |
| sync | `sync.ts` | 同步控制 |
| import | `import.ts` | 导入流水线 |
| share | `share.ts` | 分享功能 |
| screening-templates | `screening-templates.ts` | 筛选模板 |
| interview-assessment | `interview-assessment.ts` | 面试评估 |
| email | `email.ts` | 邮件相关 |
| message | `message.ts` | 消息处理 |

**Anti-pattern 警告** — `components/` 中避免直接调用 `fetch`，统一走 `api/` 下的客户端。

## ANTI-PATTERNS

- **`@ts-ignore`** — `src/auto-imports.d.ts:85` 需修复
- **路由代理端口** — 旧文档可能写 `:9091`，当前 Vite 代理到 `:9092`
- **组件业务逻辑** — 避免在 `views/` 放置业务逻辑，应委托给 stores 或 composables
- **直接 fetch** — 组件中禁止直接调用 `fetch`，统一使用 `api/` 客户端

## COMMANDS

```bash
pnpm dev:ui         # Vite dev server :5173
pnpm build:ui        # 生产构建
pnpm typecheck       # vue-tsc 类型检查
```

## TESTING

- **Playwright E2E** — 3 spec files in `e2e/` (17+ tests)
- **Bun test** — 7 unit test files in `src/**/*.test.ts`
- **Remote CDP** — 支持通过 Chrome DevTools Protocol 复用已登录浏览器
- **无 Vitest** — Vue 组件测试未配置（计划中）

## AGENTS

前端不再维护本地 AgentHost/Swarm 原型。Agent / Workflow 能力统一通过服务端 `packages/server/src/services/lui-workflow.ts` 与 `deepagents-runtime.ts` 执行。Web 端只负责 UI、配置与 API 调用。
