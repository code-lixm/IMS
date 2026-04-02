# Server Services — 业务服务层

**Scope:** `packages/server/src/services/`

## OVERVIEW

后端业务逻辑实现层。按功能域划分为多个子服务，处理候选人导入、IMR 文件、远程同步等核心业务。

## STRUCTURE

```
services/
├── import/             # 简历导入流水线
│   ├── extractor.ts    # OCR/文本提取
│   └── parser.ts       # 结构化解析
├── imr/                # IMR 包格式处理
│   ├── packer.ts       # 打包
│   └── unpacker.ts     # 解包
├── share/              # 局域网设备发现
├── lui-tools.ts        # LUI 工具函数 (~967 行，巨大)
├── lui-workflow.ts     # LUI 工作流 (~558 行)
├── baobao-client.ts    # 远程 API 客户端
├── baobao-login.ts     # 登录/Token 管理
├── lui-context.ts      # LUI 上下文管理
└── sync-manager.ts     # 数据同步管理
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 简历导入 | `import/` | 支持 zip/pdf/图片批量导入 |
| IMR 处理 | `imr/` | 候选人档案打包/解包 |
| 设备发现 | `share/` | UDP 广播局域网发现 |
| LUI 工具 | `lui-tools.ts` | Agent 工具定义 (~967 行) |
| LUI 工作流 | `lui-workflow.ts` | 工作流编排 (~558 行) |
| 远程 API | `baobao-client.ts` | 公司内部系统 API 调用 |

## CONVENTIONS (THIS DIRECTORY)

- **功能域分离** — 相关功能放在同一子目录
- **单职责文件** — 每个文件处理单一功能（如 `extractor.ts` 只做提取）
- **Bun runtime** — 所有代码针对 Bun 运行时编写
- **SQLite via Drizzle** — 数据库操作通过 Drizzle ORM

## ANTI-PATTERNS (THIS DIRECTORY)

- **空 catch 块** — 多处 `catch (e) {}` 静默失败
- **`console.*` 调用** — 使用 console 而非结构化日志
- **Magic numbers** — 硬编码超时、重试次数
- **巨大文件** — `lui-tools.ts` 967 行、`lui-workflow.ts` 558 行

## NOTES

- **错误处理薄弱** — 当前大量 silent catch，需要改进
- **日志记录不足** — 缺乏结构化日志系统
- **导入流水线** — 是核心业务流，支持多种格式和 OCR
- **IMR 格式** — 项目自定义的候选人档案交换格式
- **LUI 工具系统** — 基于 Vercel AI SDK，定义 Agent 可调用的工具
