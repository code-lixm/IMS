# Views — 页面视图

**Scope:** `apps/web/src/views/`

## OVERVIEW

页面视图层，9 个 Vue 组件，对应 8 条路由。每个 View 通常由布局组件 + 业务组件构成，状态委托给 Pinia stores，API 调用走 `api/` 客户端。

## STRUCTURE

```
views/
├── LUIView.vue              # AI 对话视图 (2046 行) ⚠️ HOTSPOT
├── CandidatesView.vue        # 候选人列表
├── CandidateDetailView.vue   # 候选人详情
├── ImportView.vue           # 导入流水线
├── SettingsView.vue         # 设置页
├── LoginView.vue           # 登录页 (guestOnly)
├── ScreeningTemplatesView.vue # 筛选模板
├── ServerErrorView.vue     # 500 错误页
└── NotFoundView.vue        # 404 页
```

## KEY FILES

### LUIView.vue — 2046 行 ⚠️ HOTSPOT

**最重要的巨型组件。**

| 分区 | 内容 |
|------|------|
| 模板 | 侧边栏 + 主聊天区 + 工具栏 |
| Script | composables 调用、AI 状态、流式响应处理 |
| 样式 | Scoped CSS |

**关联组件：**
- `components/lui/conversation-list.vue` — 对话列表侧边栏
- `components/lui/workflow-action-card.vue` — 工作流卡片
- `components/lui/workflow-artifacts.vue` — 工作流产物
- `components/lui/gateway-endpoint-dialog.vue` — 端点配置
- `components/lui/agent-selector.vue` — Agent 选择
- `components/lui/model-selector.vue` — 模型选择
- `components/lui/temperature-control.vue` — 温度控制
- `stores/lui.ts` — `useLuiStore` 状态管理
- `api/lui.ts` — `luiApi` 通信

**Spec 关联：**
- `specs/lui-ai-gateway/` — LUI AI Gateway
- `specs/embedded-opencode-service/` — OpenCode 服务

### CandidatesView.vue

候选人列表页，对应路由 `/candidates`。

**关联：**
- `stores/candidates.ts` — 候选人状态
- `api/candidates.ts` — 候选人 API

### CandidateDetailView.vue

候选人详情页，对应路由 `/candidates/:id`。

### ImportView.vue

导入流水线视图，对应路由 `/import`。

**关联：**
- `api/import.ts` — 导入 API
- `specs/import-pipeline/` — 导入流水线规范

### SettingsView.vue

设置页，对应路由 `/settings`。

### LoginView.vue

登录页，对应路由 `/login`，`guestOnly` guard。

### ScreeningTemplatesView.vue

筛选模板页。

### ServerErrorView.vue

500 服务器错误页，对应路由 `/500`。

### NotFoundView.vue

404 页，对应路由 `/:pathMatch(.*)*`。

## CONVENTIONS

- View 只做布局和事件分发，业务逻辑放 stores
- API 调用统一走 `api/` 客户端，禁止直接 fetch
- 状态统一使用 Pinia stores
- 组件使用 `components/ui/` 和 `components/lui/`

## ANTI-PATTERNS

- **巨型组件** — LUIView.vue 2046 行，应拆分但目前是最大热点
- **业务逻辑泄漏** — 避免在 views 写复杂业务逻辑
- **直接 fetch** — 禁止，应使用 `api/` 客户端

## ROUTING

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

## RELATED

- **Stores:** `stores/auth.ts`, `stores/lui.ts`, `stores/candidates.ts`, `stores/sync.ts`, `stores/onboarding.ts`
- **API:** `api/client.ts`, `api/candidates.ts`, `api/lui.ts`, `api/import.ts`
- **Components:** `components/lui/` (AI 对话), `components/ui/` (UI 组件库)
- **Specs:** `specs/lui-ai-gateway/`, `specs/import-pipeline/`, `specs/embedded-opencode-service/`
