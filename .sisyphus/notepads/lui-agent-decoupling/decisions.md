
- 2026-04-05：采用 `agentId = agents.id` 作为 durable identity，不新增第二套持久化 identity 列；rename 语义仅允许改 display-facing `name/displayName`，永不修改 `agentId`。
- 2026-04-05：在 agents 表补充 `source_type`、`is_mutable`、`scene_affinity` 三个最小生命周期字段，通过 `db.ts` 启动自举的 `ensureColumn()` 做兼容升级，不引入额外 migration 机制。
- 2026-04-05：API 层同时返回 `id` 与 `agentId`、`name` 与 `displayName`，保留旧前端兼容面，同时显式暴露 `isBuiltin`、`isMutable`、`isDefault`、`sceneAffinity`，便于后续逐步淘汰 ad hoc builtin 判断。

- 2026-04-05（Task 2）：服务端对自定义 agent 的重命名增加 duplicate name 检查（409 CONFLICT），内置/受保护 agent 因 `isProtectedAgent()` 已有变更拦截不会走到该检查。
- 2026-04-05（Task 2）：前端编辑时 hint 改为"重命名仅影响显示名称，不影响历史会话关联"，明确 rename 的语义边界。
- 2026-04-05（Task 3）：默认 Agent 规则统一收口到 `packages/server/src/services/lui-agents.ts`：任意时刻只允许一个 `isDefault=true`；builtin agent 不可删除；删除默认 custom agent 时强制回退到 builtin interview agent。
