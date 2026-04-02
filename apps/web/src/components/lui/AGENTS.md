# LUI Components — AI 对话界面

**Scope:** `apps/web/src/components/lui/`

## OVERVIEW

LUI (Large-scale User Interface) 组件集。AI Agent 对话界面，包括会话管理、Agent 选择、模型配置等。

## STRUCTURE

```
lui/
├── AgentChat.vue          # 核心聊天界面（~286 行）
├── agent-selector.vue     # Agent 选择器
├── candidate-selector.vue # 候选人选择器
├── conversation-list.vue  # 会话列表
├── model-selector.vue     # 模型选择器
├── file-resources.vue     # 文件资源列表
├── HandoffBanner.vue      # Agent Handoff 提示
├── workflow-status.vue   # 工作流状态
├── temperature-control.vue # 温度控制
├── task-queue-indicator.vue # 任务队列指示器
└── ActiveAgentIndicator.vue # 活跃 Agent 指示器
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 核心聊天 | `AgentChat.vue` | 流式消息，Agent 调用 |
| Agent 选择 | `agent-selector.vue` | `INTERVIEW_AGENT_PROFILE` 行 121-129 |
| 候选人选择 | `candidate-selector.vue` | 正确显示 `{{ currentCandidate?.name }}` |
| 会话管理 | `conversation-list.vue` | 会话列表和切换 |

## CONVENTIONS (THIS DIRECTORY)

- **Vue 3 Composition API** — `<script setup lang="ts">`
- **Tailwind CSS** — 样式通过 Tailwind 类
- **lucide-vue-next** — 图标库
- **流式响应** — 使用 `fetch` + `ReadableStream`

## KEY IMPLEMENTATIONS

### AgentChat.vue
- 本地 `ref<Message[]>` 存储消息（非 Pinia store）
- 流式响应通过 `updateStreamingMessage` 更新
- 无 `reasoning` 字段（当前 AI Gateway 不输出）
- 无 `Collapsible` 组件

### candidate-selector.vue
- 正确显示候选人姓名：`{{ currentCandidate?.name }}`
- Bug 已修复，无需修改

## ANTI-PATTERNS

- **无 reasoning 展示** — 当前实现不支持
- **本地消息状态** — 刷新页面丢失（需配合后端持久化）

## NOTES

- LUI 组件依赖 `stores/lui.ts` 中的 `useLuiStore`
- `createLuiMessageModule` 工厂模式管理消息
- `luiApi` 是 API 客户端（非 `messageApi`）
