# Import Pipeline Tasks

## Implementation Progress

| 模块 | 状态 | 说明 |
|------|------|------|
| 类型定义 | [x] 完成 | ImportBatch, ImportFileTask, 错误码 |
| Pipeline 骨架 | [x] 完成 | 端到端流水线可运行 |
| PDF 文本提取 | [x] 完成 | `unpdf` 实现 |
| 图片 OCR | [x] 已移除 | 删除图片 OCR 依赖路径，仅保留 PDF/ZIP(PDF) |
| 结构化解析 | [x] 完成 | 正则/关键词规则解析 |
| 候选人归并 | [x] 完成 | 手机→邮箱→新建 |
| API 端点 | [x] 完成 | `/api/import/*` |
| UI 进度展示 | [ ] 待完成 | ImportView 需完善 |

## Tasks

- [x] 1. 实现 PDF 文本提取
  - File: `packages/server/src/services/import/extractor.ts`
  - 状态: ✅ 完成 - `extractPdfText()` 使用 unpdf

- [x] 2. 移除图片 OCR 处理
  - File: `packages/server/src/services/import/extractor.ts`
  - 状态: ✅ 完成 - 删除图片 OCR 依赖，图片导入改为明确报错

- [x] 3. 实现结构化解析
  - File: `packages/server/src/services/import/parser.ts`
  - 状态: ✅ 完成 - `parseResumeText()` 正则/关键词解析

- [x] 4. 实现候选人归并逻辑
  - File: `packages/server/src/services/import/pipeline.ts`
  - 状态: ✅ 完成 - `matchOrCreateCandidate()` 手机→邮箱→新建

- [ ] 5. 完善导入进度 UI
  - File: `apps/web/src/views/ImportView.vue`
  - 状态: ⬜ 待完成 - 需完善批次卡片、文件明细、实时进度
  - _Prompt: Role: Frontend Developer | Task: Enhance ImportView with batch cards showing progress, file list with status icons, retry functionality | Restrictions: Follow existing view patterns, use shadcn components | Success: User can see real-time progress, retry failed files
