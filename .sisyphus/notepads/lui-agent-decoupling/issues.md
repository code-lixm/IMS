
- 2026-04-05：仓库现有 `pnpm typecheck` 会在 `@ims/web check` 阶段触发 `check-frontend-governance.mjs`，当前仍被多处与本任务无关的历史治理问题阻塞（`alert`、`console.error`、`as any`、空 catch、direct fetch 等）。
- 2026-04-05：`@ims/shared` 的 agent 输入类型在 web 侧存在引用收敛差异，本次通过 web API 层显式扩展 agent create/update/list/get 契约，避免生命周期字段在前端消费时丢失。

- 2026-04-05：运行时缺少 `agentId` 的直接原因不是当前源码 serializer 漏字段，而是 `127.0.0.1:9092` 上残留了一个旧的 `bun run src/index.ts` 进程；重启该进程后，`GET/POST /api/lui/agents` 会返回完整生命周期字段。
