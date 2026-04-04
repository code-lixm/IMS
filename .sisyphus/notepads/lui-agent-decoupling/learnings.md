
- 2026-04-05：LUI agent 现有 durable identity 实际一直是数据库 `agents.id`，但旧 API/前端把 `name` 同时当展示名和主识别字段使用，导致 rename 语义不清。
- 2026-04-05：将生命周期字段统一收口到 API payload 后，前端 store 最稳妥的接法是通过 `convertAgent()` 做一次集中转换，避免页面继续散读原始字段。
- 2026-04-05：`pnpm typecheck` 在本仓库里会继续串行执行 web 治理脚本；本任务相关的 shared/server/vue-tsc/bun test 均可通过，但总命令仍会被既有治理债务拦截。

- 2026-04-05（Task 2）：rename 功能打通后发现前端 Edit 对话框里 `:disabled="editingAgentId !== null"` 直接把编辑态的名称框锁死，需要同步在 `saveAgent()` 的 update 分支里补 `name` 字段传递才能完整。
- 2026-04-05（Task 3）：运行时验证前必须确认命中的不是旧 `bun run src/index.ts` 进程；本次同时发现 `vite` 与 `bun` 都占用 `:9092`，因此改用独立编译产物进程 `packages/server/dist/server` 挂到 `:9193` 获取可靠证据。

- Task 4: 会话接口现在返回 `agentResolution`，前端用 `resolvedAgentId` 打开旧会话，缺失 agent 时通过 warning 明示回退。

- 2026-04-05（Task 6）：当前本地环境已有后端占用 `:9092`，直接重启 `pnpm dev:server` 会报 `EADDRINUSE`；运行时验收可以复用现成后端，只单独起一个 Vite dev server（本次落在 `http://localhost:9093`）。
- 2026-04-05（Task 6）：浏览器自动化桥接（`chrome-devtools` / `agent-browser`）在当前环境都不可用，最终改用 Safari 打开本地页面 + 系统截图做可视化验收；generic `/lui` 截图确认无 workflow banner，interview `?scene=interview&candidateId=...` 截图确认 workflow banner 与阶段按钮可见，同时 shell 保持可见。
- 2026-04-05（Task 9）：`/api/lui/conversations/:id/messages` 的 workflow 主入口此前只看 `agent.mode === workflow`，实际始终走 builtin `executeAgent()`；只有 `/api/lui/agents/:id/execute` 旁路接口按 `agent.engine` 分支。
- 2026-04-05（Task 9）：`lui-workflow.ts` 与 `deepagents-runtime.ts` 原先各自维护一份 `STAGE_SYSTEM_PROMPTS`，导致 interview stage 语义双份漂移；现已收敛到共享 workflow runtime prompt composer。
- 2026-04-05（Task 9）：运行时验收使用独立编译产物 `packages/server/dist/server` 挂到 `IMS_PORT=19193`；同样的 `/api/lui/conversations/:id/messages` workflow 请求在 builtin 与 deepagents conversation 上都返回上游 `DEPLOYMENT_NOT_FOUND`，但仅 deepagents 请求在服务日志出现 `Error during agent (...) execution`，可证明主入口已按 `agent.engine` 走不同 executor。
