# LUI Scene-Boundary Design

## Overview

LUI (Local AI Workbench) 目前将通用对话能力与 interview 场景深度耦合，导致：
- 通用 workspace 无法独立存在，必须依附 candidate context
- Interview 专用逻辑（workflow banner、stage suggestions、candidate binding）散落在 LUIView.vue 及其子组件中
- `conversations.ts` 强制执行"一个 candidate 一个会话"策略，属于 interview 业务规则而非通用语义

本文档定义 generic workspace shell 与 interview scene module 的边界，使二者可以：
- 独立存在：通用对话不依赖 candidate
- 自由组合：interview 场景复用 generic shell 并注入 scene-specific 策略
- 平滑退化：无 candidate 时降级为纯通用对话体验

## Steering Alignment

### Technical Standards (tech.md)
- TypeScript 严格模式，所有类型需显式声明
- 组件使用 `<script setup>` 语法
- 状态管理通过 Pinia，scene 策略通过可注入的 service 接口传递
- API 调用通过统一的 api client

### Project Structure (structure.md)
- 前端组件放在 `apps/web/src/components/lui/`
- Scene 专属组件放在 `apps/web/src/components/lui/scenes/interview/`
- Store 放在 `apps/web/src/stores/`，scene policy 放在 `apps/web/src/stores/lui/scenes/`
- 视图放在 `apps/web/src/views/`

## Current Coupling Analysis

### 问题 1：LUIView.vue 混合通用 shell 与 interview 专用 UI

**位置**: `apps/web/src/views/LUIView.vue`

| 行号 | 耦合内容 | 性质 |
|------|----------|------|
| 381-423 | workflow banner (阶段标签、状态 badge、stage 选择按钮) | Interview 专用 |
| 861-871 | `currentWorkflowStageLabel` (S0/S1/S2/completed 映射) | Interview 专用 |
| 873-898 | `workflowStatusLabel` / `workflowStatusVariant` | Interview 专用 |
| 900-905 | `workflowStageOptions` (初筛/出题/评估/完成) | Interview 专用 |
| 907-946 | `suggestionTitle` / `suggestionDescription` 含 stage 上下文 | Interview 专用 |
| 991-997 | `visibleConversations` 按 candidateId 过滤 | Interview 策略泄漏到通用层 |
| 1153-1163 | `loadWorkflow()` 调用 | Interview 专用 |
| 1165-1182 | `onWorkflowStageSelect()` | Interview 专用 |
| 1231-1263 | `ensureCandidateWorkspace()` auto-creates conversation | Interview 策略泄漏到通用层 |

### 问题 2：agent-selector.vue 硬编码 interview profile

**位置**: `apps/web/src/components/lui/agent-selector.vue`

| 行号 | 耦合内容 | 性质 |
|------|----------|------|
| 121-129 | `INTERVIEW_AGENT_PROFILE` 作为默认兜底 | Interview 硬编码 |
| 163-182 | `selectedAgentProfile` 始终返回 interview profile | Interview 硬编码 |
| 255-256 | `formatModeLabel` 映射 `workflow` → "工作流" | Interview 语义泄漏 |

### 问题 3：conversations.ts 强制 one-conversation-per-candidate

**位置**: `apps/web/src/stores/lui/conversations.ts`

| 行号 | 耦合内容 | 性质 |
|------|----------|------|
| 169-179 | `createConversation` 中检查 `existingConversation` 并复用 | Interview 业务规则 |
| 168 | `createConversation(title?: string, candidateId?: string)` | Interview 字段污染通用签名 |

### 问题 4：隐藏耦合

| 现象 | 根本原因 |
|------|----------|
| Generic conversation 在 candidate context 下不可见 | `visibleConversations` 按 candidateId 过滤，未考虑 scene 策略 |
| Candidate route 访问时 auto-create workspace | `watch(workspaceCandidateId)` 触发 `ensureCandidateWorkspace` |
| Workflow UI 被 candidate context 隐式激活 | `v-if="workflow"` 无显式 scene 激活判断 |

## Target Architecture

### 分层模型

```
┌──────────────────────────────────────────────────────────────────┐
│                     LUI Workspace Shell (通用)                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ Conversation│  │  Messages  │  │ PromptInput │  │   Model   │ │
│  │    List    │  │   Panel    │  │   + Files   │  │  Selector │ │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              useLuiStore (Generic State)                       │ │
│  │  conversations[], selectedId, messages[], fileResources[]      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │           Scene Registry (激活规则 + 元数据)                   │ │
│  │  scenes: Map<SceneId, SceneDefinition>                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                               │ 注入
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Interview Scene Module                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │WorkflowBanner│  │StageSuggestions│ │CandidateWorkspaceInit │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │         useInterviewScenePolicy (Scene Policy)               │ │
│  │  - visibleConversations 过滤策略                             │ │
│  │  - createConversation 校验逻辑                              │ │
│  │  - workflow.load() / update()                               │ │
│  │  - candidate binding 生命周期                                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 核心接口

#### Scene Policy Interface

```typescript
interface ScenePolicy {
  readonly sceneId: string;
  readonly displayName: string;

  // 过滤器：给定 candidateId，返回可见的 conversation 列表
  filterConversations(
    conversations: Conversation[],
    candidateId: string | null,
  ): Conversation[];

  // 工厂：创建新 conversation 前的校验
  beforeCreateConversation(
    existing: Conversation[],
    candidateId: string | null,
  ): { reuse?: string; error?: string };

  // Scene 专用状态（可选）
  sceneState?: Record<string, unknown>;
}
```

#### Scene Registry

```typescript
interface SceneRegistry {
  scenes: Map<string, ScenePolicy>;
  activeScene: Ref<ScenePolicy | null>;
  activate(sceneId: string): void;
  deactivate(): void;
}
```

### Coexistence: Generic vs Candidate-bound Conversations

Generic 对话与 candidate-bound 对话可以同时存在，通过 scene policy 控制可见性：

```
Generic Workspace (无 candidateId):
  - 可见所有未绑定 candidate 的 conversations
  - 可自由创建/切换/删除

Interview Scene (有 candidateId):
  - 可见当前 candidate 绑定的 conversations
  - 可见未绑定 candidate 的 conversations（漫游对话）
  - Scene policy 控制 "一个 candidate 一个会话" 逻辑
```

**关键**：generic workspace 永远可见未绑定 candidate 的 conversations，不因进入 interview scene 而隐藏。interview scene 通过 policy 额外暴露 candidate-bound 的 conversations。

## Boundary Matrix

### 文件/组件分类

| 文件路径 | 分类 | 说明 |
|----------|------|------|
| `views/LUIView.vue` | Shell + Scene | 主视图承载 shell layout，scene 组件通过 slot/条件渲染注入 |
| `components/lui/conversation-list.vue` | Shell | 通用会话列表，无 candidate 假设 |
| `components/lui/agent-selector.vue` | Shell | 通用 Agent 选择器，profile 通过 scene policy 注入 |
| `components/lui/candidate-selector.vue` | Scene | Interview 专用，选择候选人 |
| `components/lui/workflow-status.vue` | Scene | Interview 专用，workflow 状态展示 |
| `stores/lui/conversations.ts` | Shell + Policy Hook | 提供 `createConversation()` 等通用方法，scene policy 通过 wrapper 注入约束 |
| `stores/lui/conversations.ts::beforeCreateConversation` | Scene Policy | 提取 one-conversation-per-candidate 逻辑到 scene policy |
| `stores/lui/messages.ts` | Shell | 通用消息状态 |
| `stores/lui/scenes/interview/policy.ts` | Scene | Interview 场景策略实现 |

### Store 字段分类

| Store / 字段 | 分类 | 说明 |
|---------------|------|------|
| `conversations[]` | Shell | 通用会话列表 |
| `selectedId` | Shell | 通用选中态 |
| `messages{}` | Shell | 通用消息映射 |
| `fileResources{}` | Shell | 通用文件资源 |
| `conversation.candidateId` | Scene | Interview 绑定字段 |
| `visibleConversations` | Shell + Policy | Shell 定义结构，policy 决定过滤策略 |
| `workflow` | Scene | Interview 专用状态 |

### API 边界

| 接口 | 分类 | 说明 |
|------|------|------|
| `GET/POST /api/lui/conversations` | Shell | 通用会话 CRUD |
| `POST /api/lui/conversations/:id/messages` | Shell | 通用消息发送 |
| `GET/POST /api/lui/workflows` | Scene | Interview 专用 |
| `PATCH /api/lui/workflows/:id` | Scene | Interview 专用 |

## Activation Rules

### Scene 激活条件

1. **URL 触发**: `/lui?scene=interview&candidateId=xxx` → 激活 interview scene
2. **Route 触发**: `/candidates/:id/lui` → 自动激活 interview scene
3. **手动切换**: 用户在 workspace 内切换 scene（未来支持）

### Scene 初始化顺序

```
1. Shell 初始化（conversations, messages, models）
2. Scene Registry 检查 URL/route 参数
3. 若存在 scene 参数：
   a. 激活对应 scene policy
   b. Scene policy 应用 filterConversations 规则
   c. Scene 组件挂载（WorkflowBanner, StageSuggestions）
4. 若无 scene 参数：
   a. 使用 generic policy（不过滤 conversations）
   b. Scene 组件不挂载
```

### 无 Candidate 行为（Generic Workspace）

- `workspaceCandidateId` 为 null
- `visibleConversations` 返回所有未绑定 candidate 的 conversations
- `createConversation()` 不接受 candidateId 参数（generic policy）
- Workflow banner / stage suggestions 不渲染
- Agent selector 使用 generic profile（而非 interview hardcoded profile）

### Candidate-bound Interview 行为

- `workspaceCandidateId` 有值
- `visibleConversations` 返回 candidate 绑定的 + 未绑定 candidate 的 conversations
- `createConversation()` 接受 candidateId 参数（interview policy 实现 one-conversation-per-candidate）
- Workflow banner / stage suggestions 正常渲染
- Agent selector 使用 interview profile

## Refactor Order

### Phase 1: Scene Registry 基础设施
1. 创建 `stores/lui/scene-registry.ts`
2. 定义 `ScenePolicy` 接口
3. 实现 `useSceneRegistry()` composable
4. 将 scene 激活状态暴露为可观察状态

### Phase 2: 提取 Interview Scene Policy
1. 创建 `stores/lui/scenes/interview/policy.ts`
2. 实现 `filterConversations()` (candidate-bound + generic conversations 合并)
3. 实现 `beforeCreateConversation()` (one-conversation-per-candidate 校验)
4. 将 workflow loading/updating 封装到 policy 内

### Phase 3: LUIView.vue 拆分
1. 提取 `WorkflowBanner.vue` 到 `components/lui/scenes/interview/`
2. 提取 `StageSuggestions.vue` 到 `components/lui/scenes/interview/`
3. LUIView.vue 通过 scene registry 条件渲染 scene 组件
4. 删除 `loadWorkflow()` / `onWorkflowStageSelect()` 从 LUIView 直接调用，改为 scene policy 方法

### Phase 4: conversations.ts Policy 改造
1. `createConversation()` 接收可选的 `scenePolicy` 参数
2. 调用前通过 scene policy 的 `beforeCreateConversation()` 校验
3. 删除 `conversations.ts` 内的 one-conversation-per-candidate 硬编码逻辑

### Phase 5: agent-selector.vue 改造
1. `INTERVIEW_AGENT_PROFILE` 移除硬编码
2. Agent profile 通过 scene context 或 prop 注入
3. Generic scene 使用简化 profile（无 skills/tools 描述）

## Non-Goals

- **不修改** `routes.ts` API 契约（conversations CRUD 接口保持不变）
- **不修改** 数据库 schema（candidateId 字段保持现状）
- **不迁移** 现有 conversations 数据（向后兼容）
- **不实现** 其他 scene（仅实现 interview scene 边界分离，为未来扩展预留接口）
- **不重构** `AgentChat.vue` 等子组件（仅处理 LUIView.vue 层级的耦合）

## Future Scene Extensibility

Scene architecture 设计为可扩展，未来可支持新 scene：

### 扩展接口

```typescript
// 只需实现 ScenePolicy 接口即可注册新 scene
const myScenePolicy: ScenePolicy = {
  sceneId: 'resume-review',
  displayName: '简历回顾',
  filterConversations(conversations, context) {
    // 自定义过滤逻辑
  },
  beforeCreateConversation(existing, context) {
    // 自定义校验
  },
  sceneState: ref({}),
};
```

### 注册新 Scene

```typescript
// stores/lui/scene-registry.ts
registry.register('resume-review', myScenePolicy);
```

### 预留给未来 scene 的场景

| Scene | 触发条件 | 专用 UI |
|-------|----------|---------|
| `resume-review` | `/lui?scene=resume-review` | 简历标注工具、摘录面板 |
| `offer-negotiation` | `/lui?scene=offer` | Offer 对比卡片、deadline 提醒 |
| `team-briefing` | `/lui?scene=team` | 多 candidate 视图、批量操作 |

## Risks

### 风险 1：Scene Policy 注入复杂度

**描述**: 将 scene policy 注入到 conversations.ts 的 `createConversation()` 需要 API 改变或 context 传递。

**缓解**: Phase 4 中采用 scene policy wrapper 模式，scene policy 通过 `provide/inject` 传递，不需要改变 API 契约。

### 风险 2：Workflow Service 与 Engine 耦合

**描述**: 当前 `loadWorkflow()` 直接调用 `luiApi.listWorkflows()`，属于 interview 专用接口。

**缓解**: Phase 3 中将 workflow 调用封装到 `useInterviewScenePolicy` 内，对 Shell 层隐藏。Shell 不感知 workflow 存在。

### 风险 3：Backward Compatibility

**描述**: 现有 conversations 包含 candidateId 字段，现有 users 已在 interview context 中。

**缓解**: 迁移期间 generic policy 对 candidateId 字段做兼容处理，candidateId 不为空视为 interview conversation，不做强制过滤。

### 风险 4：Visible Conversations 过滤逻辑歧义

**描述**: 当前 `visibleConversations` 按 candidateId 过滤，interview scene 需要同时看到 candidate-bound 和 generic conversations。

**缓解**: Phase 2 中 `filterConversations()` 显式定义合并规则：generic + candidate-bound union，清晰无歧义。
