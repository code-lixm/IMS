
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

#- 2026-04-05（Blocker A/B fix）：修复 `sceneAffinity` 字段的 API 与 UI 支持
- **Blocker A (UI badge)**：SettingsView.vue 原 `v-if="agent.isBuiltin"` 只给 builtin 显示 badge；现已改为完整三元式 `{{ agent.sourceType === 'builtin' ? '内置' : agent.sourceType === 'custom' ? '自定义' : '导入' }}`，支持 custom/imported 的 badge 显示。
- **Blocker B (API 输入)**：`POST /api/lui/agents` 原 hardcode `sceneAffinity: "general"`，导致无法创建 interview 场景的 custom agent。修复：
  - `packages/shared/src/api-types.ts`：向 `CreateAgentInput` 和 `UpdateAgentInput` 添加 `sceneAffinity?: AgentSceneAffinity`
  - `packages/server/src/routes.ts`：POST body 添加 `sceneAffinity`，insert 时使用 `body.sceneAffinity ?? "general"`；PUT body 和 updates 同理；protected check 添加 `|| body.sceneAffinity !== undefined`
  - `apps/web/src/stores/lui/agents.ts`：本地 `CreateAgentInput`/`UpdateAgentInput` 接口和 `createAgent()`/`updateAgent()` 调用添加 `sceneAffinity`
  - `apps/web/src/views/SettingsView.vue`：`agentForm` 添加 `sceneAffinity` 字段；`resetAgentForm()`/`fillAgentForm()` 添加赋值；`saveAgent()` 的 create/update 调用添加字段；dialog 模板添加 scene affinity 下拉框
- **踩坑记录**：`edit` 工具在处理 LINE#ID 格式时会产生 hash 拼接错误；改用 `awk` 单遍扫描 + `perl -i -pe` 做精确字符串替换更可靠。
- **重要**：shared 包是 TypeScript composite 项目，修改 `src/*.ts` 后必须 `pnpm --filter @ims/shared build` 重建 `dist/*.d.ts`，否则 web 的 vue-tsc 仍读旧声明文件导致类型错误。

#- 2026-04-05（Blocker A/B 后续：LUI interview scene 隔离 + agent-selector 修复）
- **Blocker 1 (generic `/lui` 被 candidate context 污染)**：原 `workspaceCandidateId` watcher 无条件设置 `interviewConversationPolicy` 并调用 `ensureWorkspace`，导致只要有 candidate-bound conversation 就激活 interview 场景。修复：在 watcher 内增加 `interviewSceneActive = routeScene.value === "interview" || isInterviewAgent(activeSuggestionAgent.value)` 判断，仅当 interview scene 显式激活时才设置 policy 和调用 ensureWorkspace。
- **Blocker 2 (agent-selector 无选择功能)**：原组件只有详情展示，emit 被注释掉，没有可点击的 agent 列表。修复：激活 emit 定义，添加「切换 Agent」列表区域，点击 agent 时调用 `selectAgent(agent)` → 设置 `selectedAgent.value` → emit `update:modelValue` + `select` → 关闭 popover。
- **验证逻辑**：Generic `/lui?candidateId=xxx` 只读候选人会话，不激活 interview policy/workspace；需 `?scene=interview` 或选择 `sceneAffinity: interview` 的 agent 才激活。agent-selector 现在显示 agent 列表并能正确发出选择事件。

#- 2026-04-05（后续追加：showCandidateSelector/agentSelectorProfile 仍污染 generic UI）
- **残留问题**：`showCandidateSelector` 的 computed 仍包含 `hasInterviewContext.value` 作为 OR 条件，导致 generic `/lui?candidateId=...` 时仍显示 interview profile selector UI；`agentSelectorProfile` 派生自 `showCandidateSelector`，同样受影响。
- **修复**：移除 `showCandidateSelector` 中的 `hasInterviewContext.value`；`agentSelectorProfile` 改为直接使用 `routeScene.value === "interview" || isInterviewAgent(activeSuggestionAgent.value)` 表达式。
- **激活规则**：`showInterviewSceneUi`（workflow banner）保留 `hasInterviewContext && (routeScene === interview || isInterviewAgent(...))` 因为它控制的是 interview 特有的 UI 元素；`showCandidateSelector` 和 `agentSelectorProfile` 只受显式 interview scene 激活驱动。
- **Python 替代工具**：复杂多行字符串替换用 Python 脚本比 perl/awk 更可靠，避免 hash 前缀干扰。
2026-04-05：LUI scene 激活要把“显式路由 candidate 上下文”和“当前选中会话的 candidate 归属”分开。前者才能驱动 interview policy / ensureWorkspace / workflow UI，后者最多用于被动展示；否则 generic /lui 会被自动选中的 candidate-bound conversation 反向污染。
