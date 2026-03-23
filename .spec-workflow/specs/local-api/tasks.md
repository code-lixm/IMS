# Local API Tasks

## Implementation Progress

| 模块 | 状态 | 说明 |
|------|------|------|
| 基础路由骨架 | [x] 完成 | 全部 API 端点已实现 |
| Auth 接口 | [x] 完成 | 宝巴账号集成完成 |
| 候选人 CRUD | [x] 完成 | - |
| 简历/面试接口 | [x] 完成 | - |
| 导入接口 | [x] 完成 | - |
| AI 工作台接口 | [x] 完成 | - |
| 共享接口 | [x] 完成 | - |
| shadcn/ui 组件 | [x] 完成 | 34 个组件已安装在 `components/ui/` |
| shadcn/ui 接入视图 | [ ] 待完成 | 视图尚未迁移使用 shadcn 组件 |
| API 完整测试 | [ ] 待完成 | 集成测试覆盖 |

## Tasks

- [ ] 1. 视图迁移到 shadcn/ui 组件
  - Files: `apps/web/src/views/*.vue`
  - 状态: ⬜ 待完成 - shadcn 组件已安装，视图尚未使用
  - _Prompt: Role: Frontend Developer | Task: Migrate all views to use shadcn components (UiButton, UiCard, UiInput, UiDialog, etc.) | Restrictions: Maintain existing functionality, follow existing view logic | Success: All views use shadcn components, consistent styling

- [ ] 2. API 集成测试覆盖
  - Files: `packages/server/src/routes.ts`
  - 状态: ⬜ 待完成
  - _Prompt: Role: QA Engineer | Task: Write integration tests for all API endpoints, covering success and error paths | Restrictions: Use existing test utilities | Success: >80% endpoint coverage, all error codes tested
