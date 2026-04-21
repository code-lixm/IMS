# LUI Components — AI 对话界面

**Scope:** `apps/web/src/components/lui/`

## OVERVIEW

LUI (Language User Interface) 组件集负责 AI Agent 对话界面的呈现。组件通过 `stores/lui.ts` 中的 `useLuiStore` 管理状态，使用 `luiApi`（而非 `messageApi`）与服务端通信。

## STRUCTURE

```
lui/
├── agent-selector.vue              # Agent 选择器（Popover 触发）
├── auth-dialog.vue                 # 认证对话框
├── candidate-selector.vue         # 候选人选择器
├── conversation-list.vue           # 会话列表（侧边栏）
├── file-resources.vue              # 文件资源列表
├── gateway-endpoint-dialog.vue     # Gateway 端点配置弹窗
├── interview-score-upload-dialog.vue # 面试评分上传弹窗
├── interview-score-utils.ts        # 面试评分解析工具函数
├── model-selector.vue              # 模型选择器（DropdownMenu 触发）
├── scenes/                        # 场景类型定义
├── task-queue-indicator.vue        # 任务队列指示器
├── temperature-control.vue         # 温度控制
├── workflow-action-card.vue        # 工作流操作卡片
└── workflow-artifacts.vue          # 工作流产物展示
```

## KEY COMPONENTS

| 组件 | 行数 | 职责 |
|------|------|------|
| `conversation-list.vue` | 227 | 会话列表，含重命名/删除功能 |
| `agent-selector.vue` | 229 | Agent 选择，调用 `luiApi.listAgents()` |
| `model-selector.vue` | 96 | 模型选择，按提供商分组显示授权状态 |
| `gateway-endpoint-dialog.vue` | 425 | 完整 Gateway 端点配置（Provider/Key/Model） |
| `temperature-control.vue` | - | 三档 + 精确滑块 |
| `task-queue-indicator.vue` | - | 任务队列状态展示 |
| `workflow-action-card.vue` | - | 工作流执行卡片 |
| `workflow-artifacts.vue` | - | 工作流产物展示 |
| `file-resources.vue` | - | 文件资源管理 |

## LUIView STRUCTURE

**主视图:** `views/LUIView.vue` (2046 行)

包含完整 AI 对话 UI 布局：
- 侧边栏（conversation-list）
- 主聊天区域（消息列表 + 输入区）
- 顶部工具栏（agent-selector, model-selector, temperature-control）
- 底部工具栏（文件上传、工作流操作）

**关键区域：**
- 消息渲染区 — 流式响应渲染
- 输入区 — 消息发送 + 文件附件
- 工作流区 — workflow-artifacts + workflow-action-card

## AI GATEWAY INTEGRATION

### 架构

```
LUIView
  ├── agent-selector.vue      → luiApi.listAgents() / getAgent()
  ├── model-selector.vue      → providers (from useLuiStore)
  ├── temperature-control.vue → temperature (0.0 - 1.0)
  ├── task-queue-indicator.vue → tasks (useLuiStore.taskQueueModule)
  └── gateway-endpoint-dialog.vue → luiApi.listModels()

stores/lui.ts (useLuiStore)
  ├── createLuiMessageModule  → 消息管理 + 流式发送
  ├── createLuiModelModule   → 模型配置 + Gateway 端点
  ├── createLuiAgentModule    → Agent 配置
  ├── createLuiCredentialModule → 凭证管理
  └── createLuiTaskQueueModule → 任务队列

luiApi (@/api/lui.ts)
  └── 服务端 /api/lui/* 端点
```

### Gateway 端点配置

`gateway-endpoint-dialog.vue` 支持：
- Provider 选择（presetProviders）
- API Key 输入（可显示/隐藏）
- 默认模型选择（按厂商动态加载）
- 连接测试（`luiApi.listModels()` 验证）

### Model Selector 状态

```typescript
interface ModelSelectorProps {
  providers: ModelProvider[]        // 按厂商分组的模型列表
  selectedId?: string | null        // 当前选中模型 ID
  authorizedProviders?: string[]     // 已授权厂商列表
}
```

## STREAMING

### 流式响应处理

组件使用 `fetch` + `ReadableStream` 处理流式响应：

```typescript
// 典型流式调用模式
const response = await fetch('/api/lui/chat', {
  method: 'POST',
  body: JSON.stringify({ messages, config }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

// 逐块读取
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // 处理 chunk
}
```

### 流式状态

- `isProcessing` — 标识 AI 正在生成响应
- `tasks` — 长时间运行任务的状态跟踪
- `workflows` — 工作流执行状态

## MESSAGE MANAGEMENT

### 工厂模式

`createLuiMessageModule` 是消息管理的核心工厂：

```typescript
const messageModule = createLuiMessageModule({
  selectedId,
  messages,
  fileResources,
  workflows,
  selectedAgentId,
  selectedModelId,
  selectedModelProvider,
  temperature,
  customEndpoints,
  customModelName,
});
```

### 消息状态

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
  // ...
}
```

消息按 conversationId 分组存储在 `messages: Record<string, Message[]>`。

### 面试评分工具

`interview-score-utils.ts` 提供解析函数：
- `stripMarkdownFormat()` — 移除 Markdown 格式
- `extractWechatCopyText()` — 提取微信复制块
- `extractInterviewResultLabel()` — 面试评价标签
- `extractRecommendedRank()` — 推荐职级
- `extractInterviewRound()` — 面试轮次

## CONVENTIONS (THIS DIRECTORY)

- **Vue 3 Composition API** — `<script setup lang="ts">`
- **Tailwind CSS** — 样式通过 Tailwind 类
- **lucide-vue-next** — 图标库
- **工厂模式** — `createLuiMessageModule` 等管理状态，非直接 Pinia defineStore
- **API 客户端** — 统一使用 `luiApi`（`@/api/lui.ts`），禁止直接 fetch
- **类型导入** — 从 `@/stores/lui` 导入共享类型

## ANTI-PATTERNS

- **无 reasoning 展示** — 当前实现不支持 reasoning 过程展示
- **本地消息状态** — 刷新页面丢失，需配合后端持久化
- **直接 fetch** — 组件中禁止直接调用 fetch，统一走 `luiApi`

## RELATED SPECS

| Spec | 状态 | 说明 |
|------|------|------|
| `specs/lui-ai-gateway/` | 进行中 | LUI AI Gateway 设计（Vercel AI SDK 集成） |
| `specs/embedded-opencode-service/` | 进行中 | 内置 OpenCode 服务设计 |

## DEPENDENCIES

- **状态管理** — `stores/lui.ts` (useLuiStore)
- **API 客户端** — `@/api/lui.ts` (luiApi)
- **UI 组件** — `@/components/ui/` (shadcn-vue 风格)
- **共享类型** — `@ims/shared` (formatInterviewRoundLabel 等)
