# Interview Manager Session 02 (续)

- Updated: 2026-03-22 (UTC)
- Purpose: 完善文档，补全 schema 与 API 实现

## 今日上午完成

- schema.ts v0.2 — 10 张表定义
- Local-API-Spec v0.2 — 完整 request/response schema + 错误码
- routes.ts — 所有端点实现，typecheck ✅

## 今日下午完成

### 模块一：自动轮询同步
- `server/src/services/sync-manager.ts` — SyncManager 类
  - `start(intervalMs)` / `stop()` / `isEnabled()`
  - 连续 3 次错误自动暂停
  - 服务退出时停止轮询

### 模块二：简历解析流水线
- `services/import/types.ts` — 共享类型
- `services/import/extractor.ts` — pdf-parse + tesseract.js OCR
- `services/import/parser.ts` — 正则结构化解析
- `services/import/pipeline.ts` — 完整流水线编排
  - 文件分类 → 文本提取 → 结构化解析 → 候选人归并 → 写入 DB

### 模块三：IMR 导入/导出
- `services/imr/types.ts` — IMR 包格式类型
- `services/imr/exporter.ts` — JSZip 打包 .imr
- `services/imr/importer.ts` — .imr 校验 + 解析 + 入库
  - 冲突解决：手机号 > 邮箱 > 新建

### 模块四：局域网共享
- `services/share/discovery.ts` — DiscoveryService（UDP广播/接收）
- `services/share/transfer.ts` — sendToDevice() 在线发送 .imr

### 模块五：前端界面
- `web/public/index.html` — 完整单文件 SPA
  - 候选人列表（搜索/新建/导入/导出/AI工作台）
  - 候选人详情（基本信息/简历/面试记录）
  - 导入任务页（批次卡片 + 进度条）
  - 设置页（登录/同步/OpenCode）

### 文档
- `docs/STATUS.md` — 模块状态追踪文档

## 状态：TODO

- [ ] Tauri 桌面壳对接
- [ ] 远程系统适配（stub，等公司 API 文档）
- [ ] API Spec v0.2 补充 `SHARE_EXPORT_FAILED` 错误码
- [ ] drizzle config 清理（目前我们用 bun:sqlite 直连，不用 drizzle migrate）
