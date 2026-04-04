# LUI Agent Decoupling & Interview Agent Evolution

## TL;DR
> **Summary**: 将 IMS 从“LUI≈面试壳”收敛为“多场景 AI 工作台”，先补齐 Agent 生命周期与管理能力，再拆分通用 LUI 与面试 scene，最后把 `.opencode` 面试资产迁入 IMS 并为 `deepagents + workflow` 演进铺路。
> **Deliverables**:
> - Agent 生命周期与管理模型收口
> - LUI 通用工作台 / interview scene 边界落地
> - `.opencode` 资产映射与 interview runtime adapter 方案
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: 1 → 2 → 3 → 6 → 9 → F1-F4

## Context
### Original Request
- 面试应只是一个智能体概念，LUI 后面会接很多其他场景。
- 当前 LUI 对场景扩展形成束缚。
- Agent 管理当前不能修改名称，希望改为可修改。
- 需要把建议细化成可执行任务列表与阶段计划。

### Interview Summary
- 保留 `workflow` 作为 interview 场景的业务模式，不把面试退化为普通 chat。
- 当前默认 interview agent 是 `builtin + workflow`，主要原因是 workflow 主链路实际只接到了 builtin 执行器。
- 长期目标是 `deepagents + workflow`，但不应在 Phase 1 直接切默认引擎。
- `.opencode` 应迁移其 prompt/rules/tools/memory 资产，而不是照搬 OpenCode 运行时。

### Metis Review (gaps addressed)
- 必须先定义 Agent 生命周期矩阵，避免 builtin/custom/imported 继续靠硬编码处理。
- 必须显式定义 `scene` 边界，避免把 Phase 2 变成单纯 UI 改名。
- 必须为历史 conversation / stale agent / default agent fallback 定义兼容策略。
- 必须把 `.opencode` 迁移定义成资产导入，而不是文件复制或运行时嵌入。

## Work Objectives
### Core Objective
- 将 Agent 管理、LUI scene 模型与 interview runtime 三者解耦，让 Interview Agent 成为 IMS 中一个可运营、可演进、可替换执行引擎的场景 Agent。

### Deliverables
- Agent 生命周期模型（builtin/custom/imported、mutable/deletable/defaultable）
- 可修改名称的 Agent 管理能力
- 通用 LUI workspace 与 interview scene 的边界设计与实施计划
- `.opencode` → IMS 资产映射文档与 runtime adapter 方案

### Definition of Done
- `SettingsView` 中 Agent 可以重命名，且 `agentId` 稳定不变。
- Agent 列表能显式区分 builtin/custom/imported，删除/默认规则前后端一致。
- LUI 可在无 candidate context 下加载通用 workspace；Interview Agent 才激活 workflow UI。
- `.opencode` 的 prompts/rules/tools/memory 都有明确归宿，且 workflow 主链路具备尊重 `engine` 的演进路径。

### Must Have
- 兼容已有 conversations 和默认 Agent 数据
- builtin 保护策略不再只靠硬编码 id
- 清理历史 validation agents 的规则有明确边界
- Workflow 语义继续保留给 Interview scene

### Must NOT Have
- 不在本计划内直接做完整 deepagents 切换
- 不把 `.opencode` 当成运行时直接嵌入 IMS
- 不在 Phase 1 做大规模 LUI 视觉重做
- 不引入第二套隐藏的 builtin registry

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after；当前仓库已有 `vue-tsc`、`bun test` 与 `pnpm typecheck`，但无完整场景测试基础设施。
- QA policy: 每个任务都包含可执行检查；涉及 UI 的任务优先用浏览器自动化与接口验证结合。
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
Wave 1: Agent contract hardening（生命周期模型、rename、builtin/custom、default/delete policy）
Wave 2: State and data cleanup（stale agents、fallback、conversation compatibility）
Wave 3: LUI scene boundary design（通用 workspace / interview scene 拆分）
Wave 4: `.opencode` asset mapping + runtime adapter design

### Dependency Matrix
- 1 blocks 2, 3, 4
- 2 blocks 5, 6
- 3 blocks 6, 7
- 4 blocks 8
- 5 blocks 6
- 6 blocks 9
- 7 blocks 9
- 8 blocks 9
- 9 blocks F1-F4

### Agent Dispatch Summary
- Wave 1 → 4 tasks → quick / unspecified-high
- Wave 2 → 2 tasks → unspecified-high
- Wave 3 → 2 tasks → deep / writing
- Wave 4 → 1 task → deep

## TODOs
> Implementation + Test = ONE task. Never separate.

- [x] 1. Harden agent identity and lifecycle contract

  **What to do**: 在共享类型、服务端 schema/API、前端展示层中定义稳定的 Agent 生命周期模型：至少覆盖 `agentId`、`displayName/name`、`sourceType or isBuiltin`、`isMutable`、`isDefault`、`sceneAffinity`。明确 rename 只改 display-facing 字段，绝不改 durable identity。
  **Must NOT do**: 不要继续用 `agent_builtin_interview` 作为长期唯一 builtin 判断来源；不要只改 UI 而不补类型/后端约束。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 横跨 shared/server/web 的契约性改动
  - Skills: `[]` — 无额外 skill 依赖
  - Omitted: `frontend-dev` — 不是视觉设计任务

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2,3,4] | Blocked By: []

  **References**:
  - Pattern: `packages/shared/src/api-types.ts` — Agent CRUD 类型定义入口
  - Pattern: `packages/server/src/routes.ts` — `/api/lui/agents` create/update/delete 规则
  - Pattern: `packages/server/src/services/lui-agents.ts` — 默认 interview agent seed 与保护逻辑
  - Pattern: `apps/web/src/views/SettingsView.vue` — Agent 管理 UI 展示层

  **Acceptance Criteria**:
  - [ ] `UpdateAgentInput` 明确支持 rename 所需字段，且 `agentId` 不参与更新
  - [ ] Agent list/get/create/update 返回的 builtin/custom 信息一致
  - [ ] 生命周期字段足以表达 builtin/custom/imported 与可编辑/可删除边界

  **QA Scenarios**:
  ```
  Scenario: Lifecycle contract surfaces in API types and routes
    Tool: Bash
    Steps: Run `pnpm typecheck`
    Expected: Shared/server/web 类型检查通过，未引入 agent contract 相关错误
    Evidence: .sisyphus/evidence/task-1-agent-contract.txt

  Scenario: No hardcoded-only builtin policy remains
    Tool: Grep
    Steps: Search for `agent_builtin_interview` and inspect policy call sites
    Expected: builtin policy有显式字段/统一函数支撑，而非仅靠散落硬编码判断
    Evidence: .sisyphus/evidence/task-1-agent-contract-grep.txt
  ```

  **Commit**: YES | Message: `refactor(agent): formalize lifecycle contract` | Files: `packages/shared/src/api-types.ts`, `packages/server/src/routes.ts`, `packages/server/src/services/lui-agents.ts`, `apps/web/src/views/SettingsView.vue`

- [x] 2. Enable agent rename end-to-end

  **What to do**: 打通前端编辑弹窗、API client、服务端 update 接口，使 Agent 名称可修改；保留 `id` 稳定。补充名称冲突与历史会话兼容说明。
  **Must NOT do**: 不要让 rename 影响现有 conversation 的 agent 引用；不要在编辑态继续禁用 name 输入框。

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 目标聚焦，改动集中
  - Skills: `[]`
  - Omitted: `fullstack-dev` — 不需要额外框架指导

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5] | Blocked By: [1]

  **References**:
  - Pattern: `apps/web/src/views/SettingsView.vue:348` — name 输入框当前编辑态禁用
  - Pattern: `apps/web/src/stores/lui/agents.ts` — updateAgent 数据流
  - Pattern: `apps/web/src/api/lui.ts` — PUT `/api/lui/agents/:id`
  - Pattern: `packages/server/src/routes.ts:2460` — update agent 路由

  **Acceptance Criteria**:
  - [ ] 编辑已有 Agent 时可修改名称并保存
  - [ ] 重命名后刷新页面名称持久化
  - [ ] 旧 conversation 仍能通过 `agentId` 正常关联到 agent

  **QA Scenarios**:
  ```
  Scenario: Rename custom agent through settings UI
    Tool: cmux-browser
    Steps: 打开 `/settings` → 编辑一个自定义 Agent → 修改名称 → 保存 → 刷新页面
    Expected: 名称更新，刷新后保持，默认状态不变
    Evidence: .sisyphus/evidence/task-2-agent-rename-ui.txt

  Scenario: Duplicate rename fails deterministically
    Tool: Bash
    Steps: Use API client or curl to rename an agent to an existing name
    Expected: 返回明确的冲突错误，不产生脏写入
    Evidence: .sisyphus/evidence/task-2-agent-rename-api.txt
  ```

  **Commit**: YES | Message: `feat(agent): allow renaming managed agents` | Files: `apps/web/src/views/SettingsView.vue`, `apps/web/src/stores/lui/agents.ts`, `apps/web/src/api/lui.ts`, `packages/server/src/routes.ts`

- [x] 3. Unify default and delete policy

  **What to do**: 明确默认 Agent、删除策略与 fallback 规则：builtin 不可删除；custom 可删除；删除默认 custom 时必须有确定的默认回退策略；任意时刻最多一个默认 Agent。
  **Must NOT do**: 不要只做前端禁用；不要允许多个默认 Agent 并存。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 涉及持久化与边界条件
  - Skills: `[]`
  - Omitted: `frontend-design` — 非视觉任务

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5] | Blocked By: [1]

  **References**:
  - Pattern: `packages/server/src/routes.ts:2417-2498` — default / delete current behavior
  - Pattern: `packages/server/src/services/lui-agents.ts` — builtin protection helper
  - Pattern: `apps/web/src/views/SettingsView.vue` — setDefault/removeAgent actions

  **Acceptance Criteria**:
  - [ ] builtin agent 前后端均不可删除
  - [ ] custom 默认 Agent 删除后系统有确定 fallback（推荐回落到 builtin interview agent）
  - [ ] 设置默认操作原子化，始终只有一个默认项

  **QA Scenarios**:
  ```
  Scenario: Default switching remains singular
    Tool: Bash
    Steps: 连续调用两个 agent 的 set default 接口，然后拉取 agent 列表
    Expected: 列表中仅一个 `isDefault=true`
    Evidence: .sisyphus/evidence/task-3-default-policy.txt

  Scenario: Builtin delete is blocked
    Tool: Bash
    Steps: 调用 DELETE `/api/lui/agents/:id` 删除 builtin interview agent
    Expected: 返回 4xx 校验错误，不删除记录
    Evidence: .sisyphus/evidence/task-3-delete-policy.txt
  ```

  **Commit**: YES | Message: `fix(agent): unify default and delete policy` | Files: `packages/server/src/routes.ts`, `packages/server/src/services/lui-agents.ts`, `apps/web/src/views/SettingsView.vue`

- [x] 4. Clean stale validation agents and compatibility fallbacks

  **What to do**: 定义并执行历史 validation/workflow gate agents 的清理规则；同时补充 stale agent / missing agent conversation 的回退策略与显式提示。
  **Must NOT do**: 不要静默删掉无法确认来源的用户数据；不要让旧 conversation 因 agent 缺失直接不可打开。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 需要兼顾数据清理与兼容性
  - Skills: `[]`
  - Omitted: `quick` — 涉及策略判断和 fallback

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5] | Blocked By: [1]

  **References**:
  - Pattern: `packages/server/src/services/lui-agents.ts` — 当前 legacy agent 清理规则
  - Pattern: `packages/server/src/routes.ts` — conversation 与 agent 数据读取路径
  - Pattern: `apps/web/src/stores/lui/conversations.ts` — conversation 选择与 agent 配置回填

  **Acceptance Criteria**:
  - [ ] 历史 validation agents 按保守规则清理，不误删正常自定义 Agent
  - [ ] conversation 引用缺失 agent 时仍可打开，并有明确 fallback agent / 提示
  - [ ] 设置页列表不再显示遗留 validation/testing agents

  **QA Scenarios**:
  ```
  Scenario: Stale validation agents disappear after list load
    Tool: cmux-browser
    Steps: 打开 `/settings`，刷新 Agent 管理区块
    Expected: 不再显示 `Resume Sync Validation Agent` / `Workflow Resume Gate *`
    Evidence: .sisyphus/evidence/task-4-stale-agent-ui.txt

  Scenario: Missing-agent conversation degrades gracefully
    Tool: Bash
    Steps: 构造或模拟一个引用缺失 agentId 的 conversation，然后加载详情
    Expected: conversation 可读取，agent 配置有 fallback 或显式空态说明
    Evidence: .sisyphus/evidence/task-4-stale-agent-fallback.txt
  ```

  **Commit**: YES | Message: `fix(agent): clean stale records and add conversation fallback` | Files: `packages/server/src/services/lui-agents.ts`, `packages/server/src/routes.ts`, `apps/web/src/stores/lui/conversations.ts`

- [x] 5. Publish LUI scene-boundary design

  **What to do**: 盘点并输出 LUI 通用层与 interview scene 专属层边界文档，明确哪些状态/组件留在通用 workspace，哪些下沉到 interview scene。
  **Must NOT do**: 不要直接开始大规模代码迁移；不要把 scene 边界停留在口头说明。

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: 先形成可审阅边界文档
  - Skills: `[]`
  - Omitted: `unspecified-high` — 先不实施，只做边界定义

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [6,7] | Blocked By: [2,3,4]

  **References**:
  - Pattern: `apps/web/src/views/LUIView.vue` — 当前通用壳与 interview UI 混杂点
  - Pattern: `apps/web/src/stores/lui.ts` — LUI 全局状态入口
  - Pattern: `apps/web/src/components/lui/agent-selector.vue` — Agent 入口语义

  **Acceptance Criteria**:
  - [ ] 输出文档明确列出通用 workspace 与 interview scene 的组件/状态边界
  - [ ] 文档明确 scene 激活条件、无 candidate 时的行为、future scenes 的扩展位

  **QA Scenarios**:
  ```
  Scenario: Boundary document covers all current LUI interview couplings
    Tool: Grep
    Steps: 搜索 `workflow|candidateId|selectedAgentId` 在 LUI 相关文件中的分布，对照边界文档核查
    Expected: 文档覆盖主要耦合点，无明显遗漏
    Evidence: .sisyphus/evidence/task-5-lui-boundary.txt

  Scenario: Boundary document is implementation-ready
    Tool: Read
    Steps: 审阅文档是否明确组件、状态、接口边界与非目标范围
    Expected: 后续执行者无需再做大的结构判断
    Evidence: .sisyphus/evidence/task-5-lui-boundary-review.txt
  ```

  **Commit**: YES | Message: `docs(lui): define generic workspace and interview scene boundary` | Files: `docs/` or `.spec-workflow/` design document

- [x] 6. Refactor LUI into generic workspace shell + interview scene module

  **What to do**: 按 task 5 的边界文档实施第一轮拆分：通用会话/消息/模型/Agent 选择留在 LUI shell；workflow stage、candidate-bound panels、interview-specific actions 下沉到 interview scene 模块。
  **Must NOT do**: 不要重做整套导航；不要影响已有 Interview Agent 的用户可见行为。

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 涉及 store、view、component 边界重构
  - Skills: `[]`
  - Omitted: `visual-engineering` — 重心是结构而非样式

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [9] | Blocked By: [3,5]

  **References**:
  - Pattern: `apps/web/src/views/LUIView.vue` — 主壳体
  - Pattern: `apps/web/src/stores/lui.ts` — state 聚合点
  - Pattern: `apps/web/src/stores/lui/conversations.ts` — create/select conversation 行为
  - Pattern: `apps/web/src/components/lui/*.vue` — 现有 interview-specific 组件

  **Acceptance Criteria**:
  - [ ] 无 candidate context 时可加载 generic workspace 并创建普通会话
  - [ ] 只有 Interview Agent 激活时才显示 workflow/interview-specific UI
  - [ ] Interview scene 的当前用户可见行为不退化

  **QA Scenarios**:
  ```
  Scenario: Generic workspace works without candidate context
    Tool: cmux-browser
    Steps: 进入 LUI，选择非 interview Agent，新建会话并发送消息
    Expected: 会话创建成功，不要求 candidateId，不显示 interview workflow UI
    Evidence: .sisyphus/evidence/task-6-generic-workspace.txt

  Scenario: Interview scene preserves workflow panels
    Tool: cmux-browser
    Steps: 选择 Interview Agent 并绑定候选人进入会话
    Expected: workflow 状态与 interview-specific 面板仍然显示并可用
    Evidence: .sisyphus/evidence/task-6-interview-scene.txt
  ```

  **Commit**: YES | Message: `refactor(lui): separate generic workspace from interview scene` | Files: `apps/web/src/views/LUIView.vue`, `apps/web/src/stores/lui.ts`, interview-specific modules

- [x] 7. Produce `.opencode` asset mapping and import contract

  **What to do**: 建立 `.opencode` 资产映射文档与导入契约，明确 prompts/rules/tools/memory/templates 分别如何进入 IMS；定义 provenance、version、unsupported capability 的处理方式。
  **Must NOT do**: 不要直接复制 `.opencode` 文件到运行目录；不要把 OpenCode plugin/tool 协议直接当成 IMS runtime。

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 资产与运行时边界需要完整设计
  - Skills: `[]`
  - Omitted: `quick` — 非简单盘点

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [8,9] | Blocked By: [4,5]

  **References**:
  - Pattern: `/Users/lixiaoming/Desktop/desktop/personal/interview/.opencode/agents/interview-manager.md` — 总控契约
  - Pattern: `/Users/lixiaoming/Desktop/desktop/personal/interview/.opencode/skills/interview-*.md` — S0/S1/S2 规则
  - Pattern: `/Users/lixiaoming/Desktop/desktop/personal/interview/.opencode/tools/interview.js` — 纯工具语义
  - Pattern: `packages/server/src/services/lui-workflow.ts` / `deepagents-runtime.ts` — IMS 当前 runtime

  **Acceptance Criteria**:
  - [ ] 每类 `.opencode` 资产都有明确归宿：直接复用 / 需改写 / 废弃
  - [ ] 导入契约包含 provenance、assetVersion、unsupported capability 策略
  - [ ] 明确禁止把 `.opencode` 当运行时直接嵌入 IMS

  **QA Scenarios**:
  ```
  Scenario: Every opencode asset has a destination
    Tool: Read
    Steps: 审阅映射文档，逐项核对 prompts/rules/tools/memory/templates
    Expected: 无“待定归宿”的核心资产
    Evidence: .sisyphus/evidence/task-7-opencode-mapping.txt

  Scenario: Unsupported runtime assumptions are called out
    Tool: Grep
    Steps: 搜索 `.opencode` 中 tool/plugin/workspace/session assumptions，对照映射文档
    Expected: 所有 OpenCode runtime 假设都被标记为需改写或废弃
    Evidence: .sisyphus/evidence/task-7-opencode-runtime-gaps.txt
  ```

  **Commit**: YES | Message: `docs(interview): define opencode asset import contract` | Files: mapping/design document

- [x] 8. Define interview runtime adapter contract

  **What to do**: 设计统一的 interview runtime adapter，要求 workflow 模式下统一注入 candidate context、workflow stage、allowed tools、prompt assets、memory bindings，再按 engine 分配执行器；输出 capability contract 而不是实现细节说明。
  **Must NOT do**: 不要直接在本任务里把默认引擎切成 deepagents；不要让 adapter 只包一层名字，不解决 capability 边界。

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 核心架构设计任务
  - Skills: `[]`
  - Omitted: `artistry` — 这是常规架构抽象问题

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: [9] | Blocked By: [7]

  **References**:
  - Pattern: `packages/server/src/services/lui-workflow.ts:executeAgent` — builtin workflow path
  - Pattern: `packages/server/src/services/deepagents-runtime.ts:executeDeepAgent` — deepagents path
  - Pattern: `packages/server/src/routes.ts` — 主消息入口与独立 execute 路由的分裂

  **Acceptance Criteria**:
  - [ ] adapter contract 明确定义输入、输出、capabilities、fallback 与 error semantics
  - [ ] workflow 模式下尊重 `engine` 的迁移路径清晰
  - [ ] adapter 设计可支持将来把默认 Interview Agent 切到 `deepagents + workflow`

  **QA Scenarios**:
  ```
  Scenario: Adapter contract covers both builtin and deepagents path
    Tool: Read
    Steps: 对照 `executeAgent` 与 `executeDeepAgent` 的上下文注入点审阅 adapter 文档
    Expected: 两条路径的共同能力与差异点都被覆盖
    Evidence: .sisyphus/evidence/task-8-runtime-adapter.txt

  Scenario: Engine-respecting workflow path is specified at main route
    Tool: Grep
    Steps: 检查计划中的 route touchpoints 对应 `routes.ts` 主消息入口与 `/agents/:id/execute`
    Expected: 主 workflow 链路尊重 engine 的改造点被明确列出
    Evidence: .sisyphus/evidence/task-8-route-paths.txt
  ```

  **Commit**: YES | Message: `docs(runtime): define interview engine adapter contract` | Files: design document

- [x] 9. Implement engine-aware workflow path and stage prompt convergence

  **What to do**: 基于 tasks 6-8，将 Interview workflow 主链路改造成尊重 `agent.engine` 的统一入口，并合并 stage prompts 资产，避免 builtin/deepagents 维护两套 interview prompt 语义。
  **Must NOT do**: 不要直接删除 builtin path；不要在未完成 capability 对齐前强切默认 Interview Agent。

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 主链路执行模型改造
  - Skills: `[]`
  - Omitted: `quick`

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [F1,F2,F3,F4] | Blocked By: [6,7,8]

  **References**:
  - Pattern: `packages/server/src/routes.ts` — 主 workflow 分流点
  - Pattern: `packages/server/src/services/lui-workflow.ts` — stage prompt 和 workflow state
  - Pattern: `packages/server/src/services/deepagents-runtime.ts` — deepagents stage prompt 与 context
  - External: `.opencode` interview prompt assets — 作为统一 prompt 收敛来源之一

  **Acceptance Criteria**:
  - [ ] workflow 主消息入口可在 `mode=workflow` 下按 `engine` 分配执行器
  - [ ] stage prompts 收敛为统一资产来源，builtin/deepagents 语义不再漂移
  - [ ] 在不切默认引擎的前提下，可灰度创建 `deepagents + workflow` Interview Agent

  **QA Scenarios**:
  ```
  Scenario: Workflow mode respects engine selection
    Tool: Bash
    Steps: 为两个 workflow agents 分别配置 builtin/deepagents，调用主消息接口
    Expected: 响应日志/行为显示两者走了不同执行器，但共享同一 workflow contract
    Evidence: .sisyphus/evidence/task-9-engine-aware-workflow.txt

  Scenario: Deepagents interview agent can run staged flow in gray mode
    Tool: cmux-browser
    Steps: 在设置页选择灰度 Interview Agent，运行一轮带候选人的 workflow 会话
    Expected: S0/S1/S2 路径可执行，UI 不退化，文档/状态更新正常
    Evidence: .sisyphus/evidence/task-9-deepagents-gray.txt
  ```

  **Commit**: YES | Message: `feat(interview): add engine-aware workflow runtime` | Files: `packages/server/src/routes.ts`, runtime services, prompt assets

## Final Verification Wave (MANDATORY)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ browser automation for settings/LUI paths)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit 1: `refactor(agent): formalize lifecycle contract`
- Commit 2: `feat(agent): allow renaming managed agents`
- Commit 3: `fix(agent): unify default and delete policy`
- Commit 4: `fix(agent): clean stale records and add conversation fallback`
- Commit 5: `docs(lui): define generic workspace and interview scene boundary`
- Commit 6: `refactor(lui): separate generic workspace from interview scene`
- Commit 7: `docs(interview): define opencode asset import contract`
- Commit 8: `docs(runtime): define interview engine adapter contract`
- Commit 9: `feat(interview): add engine-aware workflow runtime`

## Success Criteria
- Agent 管理成为真正可运营对象：可重命名、可区分 builtin/custom、规则一致。
- LUI 不再把“面试”当成唯一默认场景，而是通用 AI workspace + interview scene 的结构。
- `.opencode` 被当成 interview 资产来源导入 IMS，而不是新的运行时孤岛。
- 默认 Interview Agent 保留 `workflow` 语义，并具备向 `deepagents + workflow` 平滑演进的明确路径。
