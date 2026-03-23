# IMR Format Tasks

## Implementation Progress

| 模块 | 状态 | 说明 |
|------|------|------|
| 类型定义 | [x] 完成 | `imr/types.ts` 已定义完整类型 |
| Exporter | [x] 完成 | `exportCandidate()` 可执行导出 |
| Importer | [-] 部分 | 候选人/简历/面试可导入，artifacts 未完成 |
| API 集成 | [x] 完成 | `/api/share/export`, `/api/share/import` 已接入 |
| 冲突合并 UI | [ ] 待完成 | 合并确认对话框 |

## Tasks

- [x] 1. 实现 IMR 类型定义
  - File: `packages/server/src/services/imr/types.ts`
  - 状态: ✅ 完成

- [x] 2. 实现 IMR Exporter
  - File: `packages/server/src/services/imr/exporter.ts`
  - 状态: ✅ 完成 - `exportCandidate(candidateId)` 可执行

- [-] 3. 完善 IMR Importer (artifacts 导入)
  - File: `packages/server/src/services/imr/importer.ts`
  - 状态: ⚠️ 部分完成 - 候选人/简历/面试已导入，artifacts/artifactVersions 未处理
  - _Prompt: Role: Backend Developer | Task: Complete importer to handle artifacts and artifactVersions import per design.md | Restrictions: Follow existing import patterns | Success: All IMR package contents imported correctly

- [x] 4. 集成到 API 路由
  - File: `packages/server/src/routes.ts`
  - 状态: ✅ 完成

- [ ] 5. 实现冲突合并 UI
  - File: `apps/web/src/views/ShareView.vue`
  - 状态: ⬜ 待完成
  - _Prompt: Role: Frontend Developer | Task: Create merge confirmation dialog when IMR import detects conflicts | Restrictions: Follow existing UI patterns | Success: User can review and decide merge strategy
