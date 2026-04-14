# LUI Components — AI 对话界面

**Scope:** `apps/web/src/components/lui/`

## OVERVIEW

LUI (Large-scale User Interface) 组件集。AI Agent 对话界面，包括会话管理、Agent 选择、模型配置等。

## STRUCTURE

```
lui/
├── agent-selector.vue     # Agent 选择器
├── candidate-selector.vue # 候选人选择器
├── conversation-list.vue  # 会话列表
├── model-selector.vue     # 模型选择器
├── file-resources.vue     # 文件资源列表
├── temperature-control.vue # 温度控制
├── task-queue-indicator.vue # 任务队列指示器
├── workflow-action-card.vue # 工作流卡片
└── workflow-artifacts.vue # 工作流产物
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Agent 选择 | `agent-selector.vue` | `INTERVIEW_AGENT_PROFILE` |
| 候选人选择 | `candidate-selector.vue` | 显示 `{{ currentCandidate?.name }}` |
| 会话管理 | `conversation-list.vue` | 会话列表和切换 |
| 工作流 | `workflow-action-card.vue` | 工作流执行卡片 (11776 行) |
| 产物 | `workflow-artifacts.vue` | 工作流输出展示 (8016 行) |

## CONVENTIONS (THIS DIRECTORY)

- **Vue 3 Composition API** — `<script setup lang="ts">`
- **Tailwind CSS** — 样式通过 Tailwind 类
- **lucide-vue-next** — 图标库
- **流式响应** — 使用 `fetch` + `ReadableStream`

## KEY IMPLEMENTATIONS

### Agent 架构
- 前端不再维护本地 AgentHost/Swarm 原型组件
- 统一走 `stores/lui.ts` + `luiApi` + 服务端 `lui-workflow.ts`
- `deepagents-runtime.ts` 在服务端执行 Agent/Workflow 能力

### candidate-selector.vue
- 正确显示候选人姓名：`{{ currentCandidate?.name }}`

## ANTI-PATTERNS

- **无 reasoning 展示** — 当前实现不支持
- **本地消息状态** — 刷新页面丢失（需配合后端持久化）

## NOTES

- LUI 组件依赖 `stores/lui.ts` 中的 `useLuiStore`
- `createLuiMessageModule` 工厂模式管理消息
- `luiApi` 是 API 客户端（非 `messageApi`）
