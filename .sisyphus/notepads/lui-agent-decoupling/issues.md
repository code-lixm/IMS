
- 2026-04-05：仓库现有 `pnpm typecheck` 会在 `@ims/web check` 阶段触发 `check-frontend-governance.mjs`，当前仍被多处与本任务无关的历史治理问题阻塞（`alert`、`console.error`、`as any`、空 catch、direct fetch 等）。
- 2026-04-05：`@ims/shared` 的 agent 输入类型在 web 侧存在引用收敛差异，本次通过 web API 层显式扩展 agent create/update/list/get 契约，避免生命周期字段在前端消费时丢失。

- 2026-04-05：运行时缺少 `agentId` 的直接原因不是当前源码 serializer 漏字段，而是 `127.0.0.1:9092` 上残留了一个旧的 `bun run src/index.ts` 进程；重启该进程后，`GET/POST /api/lui/agents` 会返回完整生命周期字段。

- 2026-04-05（Task 2）：编辑表单提交时 update payload 里漏 `name` 字段会导致 rename 无声失败；服务端的 `UpdateAgentInput` 已支持 `name`/`displayName`，前端需显式传入。

- 验证时 `pnpm typecheck` 会经过既有前端治理检查失败；本次改动相关的 TS / bun test / build 均通过，治理失败来自仓库既存问题。
SY|HJ|- 2026-04-05（Task 8）：Runtime Adapter Contract 代码验证待办：
XW|-  deepagents streaming semantics 未文档化，需在 `apps/desktop/src/lib.rs` 或 server session 管理中验证 SSE 事件形状
SW|-  deepagents tool call 分辨流程未文档化，需确认 tool parameters 是否正确通过 session bridge 传递
HJ|-  deepagents memory binding 机制未确认，是 middleware composition 还是 prompt injection，需代码验证
SY|-  deepagents workflow stage 注入可靠性：stage state 通过 prompt context 传递，需验证无状态漂移
QW|-  AdapterErrorCode 与 OpenCode session error 的映射关系未定义，需建立映射表
RK|
