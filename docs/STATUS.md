# 开发进展追踪

> 最后更新: 2026-03-22

---

## 模块状态总览

| 模块 | 状态 | 文件 |
|------|------|------|
| Schema / 建表 | ✅ 完成 | server/src/db.ts, schema.ts |
| API Spec | ✅ 完成 | Local-API-Spec-v0.2.md |
| Routes 实现 | ✅ 完成 | server/src/routes.ts |
| OpenCode 子进程管理 | ✅ 完成 | server/src/services/opencode-manager.ts |
| 自动轮询同步 | ✅ 完成 | server/src/services/sync-manager.ts |
| 简历解析流水线 | ✅ 完成 | server/src/services/import/ |
| IMR 导入/导出 | ✅ 完成 | server/src/services/imr/ |
| 局域网共享 | ✅ 完成 | server/src/services/share/ |
| 前端界面 | ✅ 完成 | web/public/index.html |
| Tauri 桌面壳 | ✅ 完成 | src-tauri/ |
| 远程系统适配 | 🔲 待做 | stub — 依赖公司内部 API |

---

## 已完成模块详情

### 自动轮询同步 `sync-manager.ts`

- `SyncManager` 类管理 `setInterval` timer
- `start(intervalMs)` / `stop()` / `isEnabled()`
- 每 3 次连续错误自动暂停并停止轮询
- 服务退出时自动 `stop()`
- 接入 `routes.ts` 的 `/api/sync/toggle` 和 `/api/sync/run`

### 简历解析流水线 `services/import/`

- `types.ts` — 共享类型定义（FileType、ParseResult 等）
- `extractor.ts` — PDF 文本提取（pdf-parse）+ 图片 OCR（tesseract.js）
- `parser.ts` — 正则结构化解析（姓名/电话/邮箱/岗位/年限/技能/工作经历）
- `pipeline.ts` — 流水线编排：
  1. 分类文件类型（pdf/png/jpg/jpeg/webp）
  2. 提取文本（PDF 或 OCR）
  3. 结构化解析
  4. 候选人归并（手机号 > 邮箱 > 新建）
  5. 写入 resumes 表并更新批次进度

### IMR 导入/导出 `services/imr/`

- `types.ts` — IMR 包格式类型定义
- `exporter.ts` — 将候选人完整档案打包为 `.imr`（JSZip）
  - 包含 manifest.json、checksums.json、candidate.json
  - resumes/、parsed/、interviews/、artifacts/ 子目录
- `importer.ts` — 校验并解压 `.imr` 入库
  - 冲突解决：手机号 > 邮箱 > 新建候选人
  - 自动合并面试记录、AI 产物

### 局域网共享 `services/share/`

- `discovery.ts` — `DiscoveryService`
  - 使用 `node:dgram` UDP 广播/接收设备公告
  - 设备 ID 持久化到 `~/.interview-manager/device-id.txt`
  - 10 秒广播一次，30 秒 TTL 过期清理
  - 单例模式
- `transfer.ts` — `sendToDevice()`
  - 将 `.imr` 文件 POST 到目标设备的 `/api/share/import`
  - 记录 shareRecords 入库

### 前端界面 `web/public/index.html`

- 单文件 vanilla JS SPA，无构建依赖
- Hash-free 路由（通过 navigate() 切换）
- 页面：
  - **候选人列表** — 搜索/筛选/新建/导入文件/导出/AI工作台入口
  - **候选人详情** — 基本信息/简历/面试记录/AI工作台
  - **导入任务** — 批次卡片 + 进度条
  - **设置** — 登录/同步开关/OpenCode 引擎启停

---

## 下一步

### Tauri 桌面壳
- 确认 `src-tauri/Cargo.toml` 依赖完整
- 配置窗口（尺寸、标题、关闭行为）
- 处理 `.imr` 文件打开协议（`imr://` deep link）
- 系统 Tray（可选）

### 远程系统适配
- 获取公司内部 API 文档
- 实现 `RemoteClient` 类对接真实接口
- 实现 token 自动刷新机制

### API Spec 维护
- `Local-API-Spec-v0.2.md` 已完整，需随代码变更同步更新
