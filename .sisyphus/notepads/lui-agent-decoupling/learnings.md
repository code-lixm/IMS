
- 2026-04-05：LUI agent 现有 durable identity 实际一直是数据库 `agents.id`，但旧 API/前端把 `name` 同时当展示名和主识别字段使用，导致 rename 语义不清。
- 2026-04-05：将生命周期字段统一收口到 API payload 后，前端 store 最稳妥的接法是通过 `convertAgent()` 做一次集中转换，避免页面继续散读原始字段。
- 2026-04-05：`pnpm typecheck` 在本仓库里会继续串行执行 web 治理脚本；本任务相关的 shared/server/vue-tsc/bun test 均可通过，但总命令仍会被既有治理债务拦截。
