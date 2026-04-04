#KM|
- 2026-04-05：采用 `agentId = agents.id` 作为 durable identity，不新增第二套持久化 identity 列；rename 语义仅允许改 display-facing `name/displayName`，永不修改 `agentId`。
- 2026-04-05：在 agents 表补充 `source_type`、`is_mutable`、`scene_affinity` 三个最小生命周期字段，通过 `db.ts` 启动自举的 `ensureColumn()` 做兼容升级，不引入额外 migration 机制。
- 2026-04-05：API 层同时返回 `id` 与 `agentId`、`name` 与 `displayName`，保留旧前端兼容面，同时显式暴露 `isBuiltin`、`isMutable`、`isDefault`、`sceneAffinity`，便于后续逐步淘汰 ad hoc builtin 判断。

- 2026-04-05（Task 2）：服务端对自定义 agent 的重命名增加 duplicate name 检查（409 CONFLICT），内置/受保护 agent 因 `isProtectedAgent()` 已有变更拦截不会走到该检查。
- 2026-04-05（Task 2）：前端编辑时 hint 改为"重命名仅影响显示名称，不影响历史会话关联"，明确 rename 的语义边界。
- 2026-04-05（Task 3）：默认 Agent 规则统一收口到 `packages/server/src/services/lui-agents.ts`：任意时刻只允许一个 `isDefault=true`；builtin agent 不可删除；删除默认 custom agent 时强制回退到 builtin interview agent。

- Task 4: stale agent 清理改为保守匹配，仅删除 `sourceType=custom`、`isMutable=true` 且同时命中已知 validation/gate 名称与描述的历史产物。

- 2026-04-05（Task 5）：Scene 边界设计决策：
  - generic workspace shell = ConversationList + Messages + PromptInput + ModelSelector（无 candidate 假设）
  - interview scene module = WorkflowBanner + StageSuggestions + CandidateWorkspaceInit + ScenePolicy
  - scene 激活通过 URL/route 参数（`?scene=interview&candidateId=xxx`）触发
  - visibleConversations 合并规则：interview scene 同时可见 candidate-bound + 未绑定 candidate 的 conversations（漫游对话）
  - conversations.ts 的 one-conversation-per-candidate 逻辑提取为 ScenePolicy.beforeCreateConversation() 接口
  - agent-selector.vue 的 INTERVIEW_AGENT_PROFILE 硬编码移除，profile 通过 scene context 注入
#QP|- 2026-04-05（Task 7）：`.opencode` 资产导入契约决策：
##QW|- direct-reuse: memory templates、scoring templates（内容模板仅替换插值语法）
#JM|- rewrite: agent manager prompt、skills（orchestrator/screening/questioning/assessment/records/memory），语义参考但按 IMS 模型重写
#HP|- unsupported/deprecated: policy skill（语法不兼容）、parse scripts（运行时工具链）、OpenCode 运行时假设（skill()/context.ask()/session/plugin）
#KM|- 导入资产以 `ImportedInterviewPack` 模型管理，携带 provenance、assetVersion 字段
#XK|- 明确禁止将 `.opencode` runtime/plugin/session 行为嵌入 IMS
BN|QW|- 2026-04-05（Task 8）：Runtime Adapter Contract 设计决策：
RZ|-  adapter 作为 engine-neutral 委托层，接收 RuntimeExecuteRequest，返回 RuntimeExecuteResponse 和 RuntimeEvent 流
JK|-  路由策略：preferredEngine 优先，无则默认 builtin，builtin 不可用时 fallback 到 deepagents（fallback 永远朝向 builtin）
HZ|-  CapabilityProfile 由各 engine executor 声明，adapter 在委托前验证 request 与 engine capabilities 的兼容性
MX|-  Prompt Composition Order 遵循 oracle 指导：global base → scene instruction → workflow state → imported assets → conversation context
QW|-  Workflow stage state 保持在 workflow service 中，adapter 仅接收 stage 信息作为 prompt context，不承担状态管理职责
JK|-  Error semantics 统一为 AdapterError(code, statusCode, engine, isRetryable)，所有 engine 错误在传播到 workflow 前完成映射
RM|-  deepagents 特殊注意：tools 通过 session direct config 注入；memory 通过 middleware 加载；无 native stage 概念；streaming/tool-call 语义需代码验证

- 2026-04-05（Task 6）：第一轮拆分采用最小 seam：`stores/lui/scenes/interview/scene.ts` 承载 candidate workspace init + workflow load/update，`stores/lui/scenes/interview/policy.ts` 承载 candidate conversation policy 与 interview profile，`LUIView.vue` 只负责根据 scene 条件注入 interview 组件。
- 2026-04-05（Task 6）：generic shell 的可见会话规则收敛为“仅显示 `candidateId=null` 的漫游会话”；candidate context 存在时通过 interview policy 扩展为“当前 candidate 绑定会话 + 漫游会话”的 union。
- 2026-04-05（Task 6）：workflow banner / stage suggestions 仅在 `candidateId` 存在且 interview agent 或 `scene=interview` 激活时展示；但 candidate workspace init 与 conversation policy 仍由 candidate context 驱动，避免已有关联候选人的工作流退化。
