# Interview Manager Session 02

- Created at: 2026-03-22 (UTC)
- Purpose: 完善文档，补全 schema 与 API 实现

## 今日完成

### 1. schema.ts 补全
- 修复了文件底部重复 import bug
- 新增 8 张缺失的表：
  - `resumes` — 简历文件与 OCR/解析结果
  - `interviews` — 面试记录与评价
  - `artifacts` — AI 产物
  - `artifactVersions` — 产物版本历史
  - `importFileTasks` — 导入文件级任务
  - `shareRecords` — 共享记录
  - `notifications` — 通知
- `candidates` 表新增 `deletedAt` 软删除字段
- `importBatches` 表新增 `autoScreen`、`startedAt` 字段
- 所有表的主键、关联关系、索引均已定义

### 2. Local-API-Spec 升级到 v0.2
- 补充完整 request/response JSON schema（所有端点）
- 补充全部 22 个错误码定义
- 补充各端点的 HTTP 状态码
- 补充查询参数定义（分页、筛选等）

### 3. routes.ts 实现补全
- 实现了规范中所有端点（auth、candidates CRUD、resumes、interviews、artifacts、import、share、notifications、opencode system）
- 所有路由返回统一响应格式 `{ success, data, error, meta }`
- TypeScript typecheck 通过 ✅

## 状态：TODO

- [ ] 实现 drizzle migration（需要执行 `bunx drizzle-kit generate` + `bunx drizzle-kit migrate`）
- [ ] 实现 OpenCode Process Manager（`server/src/services/opencode-manager.ts`）
- [ ] 实现真正的远程同步逻辑（`/api/sync/run` 目前是 stub）
- [ ] 实现简历解析流水线（PDF 文本提取、图片 OCR、结构化解析）
- [ ] 实现 `.imr` 导入/导出
- [ ] 实现局域网设备发现与在线共享
- [ ] 实现自动轮询同步（sync toggle）
- [ ] 实现前端 web 界面
- [ ] Tauri 桌面壳对接
