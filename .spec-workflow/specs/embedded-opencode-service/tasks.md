# Embedded OpenCode Service Tasks

## Implementation Progress

| 模块 | 状态 | 说明 |
|------|------|------|
| Manager 骨架 | [x] 完成 | 进程启动/健康检查/crash 重启 |
| 候选人 Workspace | [x] 完成 | active 状态复用，否则新建 |
| 上下文注入 | [x] 完成 | `buildCandidateContext()` 注入候选人信息 |
| 健康检查 | [x] 完成 | `waitUntilHealthy()` 轮询健康端点 |
| API 集成 | [x] 完成 | `/api/system/opencode/*` |
| LUI 页面打开 | [ ] 待完成 | 详情页需接入 workspace URL |

## Tasks

- [x] 1. 实现 OpenCode 进程管理
  - File: `packages/server/src/services/opencode-manager.ts`
  - 状态: ✅ 完成 - `start/spawn/waitUntilHealthy/autoRestart`

- [x] 2. 实现候选人 Workspace 创建/复用
  - File: `packages/server/src/services/opencode-manager.ts`
  - 状态: ✅ 完成 - `ensureWorkspace()` active 复用、新建逻辑

- [x] 3. 实现上下文注入
  - File: `packages/server/src/services/opencode-manager.ts`
  - 状态: ✅ 完成 - `buildCandidateContext()` 注入候选人信息

- [x] 4. 实现健康检查与监控
  - File: `packages/server/src/services/opencode-manager.ts`
  - 状态: ✅ 完成 - 30s 超时、3 次重试、crash 检测

- [ ] 5. 完善 LUI 页面打开
  - File: `apps/web/src/views/CandidateDetailView.vue`
  - 状态: ⬜ 待完成 - 需调用 API 获取 workspace URL 并打开
  - _Prompt: Role: Frontend Developer | Task: Integrate AI workspace - call POST /api/candidates/:id/workspace, get URL, open in WebView or route | Restrictions: Handle not-ready state gracefully | Success: LUI page opens with correct candidate context
