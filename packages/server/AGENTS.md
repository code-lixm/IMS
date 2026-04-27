# @ims/server — Bun HTTP API

## OVERVIEW

Bun.serve + Drizzle ORM + SQLite。本地 REST API 服务，监听 `:9092`。

## STRUCTURE

```
src/
├── index.ts           # Bun.serve 入口，67 行
├── routes.ts          # 3556 行，巨型单体路由文件
├── routes/            # 模块化子路由（从 routes.ts 拆分）
│   ├── messages.ts              # 消息 CRUD
│   ├── memory.ts                # 记忆存储 (Phase 2.2)
│   ├── session-memory.ts        # 会话记忆 (Phase 2.3)
│   ├── file-resources.ts        # 文件资源
│   ├── email.ts                 # 邮件发送
│   └── interview-assessment.ts  # 面试评估
├── schema.ts          # Drizzle ORM schema (364 行)
├── db.ts              # SQLite 连接 + 启动自举 (357 行)
├── config.ts          # 服务器配置 (27 行)
├── services/          # 业务逻辑层
│   ├── lui-tools.ts           # LUI 工具集 (~967 行)
│   ├── lui-workflow.ts        # LUI 工作流 (~558 行)
│   ├── lui-agents.ts          # Agent 管理
│   ├── lui-context.ts         # 候选人上下文构建
│   ├── lui-immediate-response.ts  # 快速响应
│   ├── message.ts             # 消息服务
│   ├── memory.ts              # 记忆服务
│   ├── session-memory.ts      # 会话记忆服务
│   ├── file-resource.ts       # 文件资源服务
│   ├── email.ts               # 邮件服务
│   ├── document-templates.ts  # 文档模板
│   ├── interview-assessment.ts # 面试评估
│   ├── baobao-*.ts           # 宝耳平台集成
│   ├── import/               # 简历导入流水线
│   │   ├── pipeline.ts       # 导入主管道
│   │   ├── extractor.ts     # 文本提取
│   │   ├── parser.ts         # 解析器
│   │   └── ai-screening.ts   # AI 筛选
│   ├── imr/                  # IMR 文件处理
│   │   ├── importer.ts       # 导入
│   │   └── exporter.ts       # 导出
│   ├── share/                # 设备发现与传输
│   │   ├── discovery.ts      # UDP 广播发现
│   │   └── transfer.ts       # 文件传输
│   └── sync/                 # 远程同步
│       └── sync-manager.ts
└── utils/
    └── http.ts               # HTTP 工具函数
```

## KEY FILES (HOTSPOTS)

| 文件 | 行数 | 说明 |
|------|------|------|
| `routes.ts` | 3556 | 巨型单体文件，应拆分。按功能域分段：health/auth(200) / candidates(600) / interviews(800) / LUI(2200) / workflows(3400) |
| `lui-tools.ts` | ~967 | LUI 工具集，工具定义和执行逻辑都在此 |
| `lui-workflow.ts` | ~558 | 工作流状态机 S0/S1/S2/completed |
| `services/lui-agents.ts` | 大型 | Agent 解析、默认 Agent 管理 |
| `services/deepagents-runtime.ts` | 大型 | Deep Agents 运行时 |

## ROUTES STRUCTURE

`routes.ts` 是主路由入口 (line 1363 `export async function route`)，所有 `/api/*` 请求经过此处后按路径分发到各子路由：

```
/api/
├── health                         # 健康检查
├── auth/
│   └── status                     # 认证状态
├── sync/
│   └── toggle                     # 远程同步开关
├── candidates                     # 候选人 CRUD
├── candidates/:id/workspace       # 候选人工作空间
├── interviews                     # 面试记录
├── import/                        # 导入流水线
├── artifacts                      # 工件
├── lui/
│   ├── chat                      # LUI 对话
│   ├── conversations              # 会话管理
│   ├── agents                    # Agent 配置
│   ├── models                    # 模型列表
│   ├── settings                  # LUI 设置
│   ├── workflows                 # 工作流
│   ├── workflow-agents           # 工作流 Agent
│   └── assessment                # 评估
├── messages/                     # 消息 CRUD (独立路由文件)
├── memory/                       # 记忆 (独立路由文件)
├── session-memory/               # 会话记忆 (独立路由文件)
├── file-resources/               # 文件资源 (独立路由文件)
├── email/                        # 邮件 (独立路由文件)
├── interview-assessment/         # 面试评估 (独立路由文件)
├── share/                        # 设备发现/传输
├── system/opencode               # OpenCode 子进程管理
└── workspace/                    # 工作空间
```

## DATABASE

- **引擎**: SQLite via `bun:sqlite` + Drizzle ORM
- **连接**: `db.ts` 创建单例 `Database` 实例
- **自举**: 启动时直接执行 `CREATE TABLE IF NOT EXISTS`（无独立 migration）
- **Schema 同步**: `ensureColumn()` 函数在每次启动时做 ALTER TABLE 兼容性迁移
- **WAL 模式**: `PRAGMA journal_mode = WAL`
- **外键约束**: `PRAGMA foreign_keys = ON`

**核心表**:
- `users` / `candidates` / `resumes` — 用户和候选人
- `interviews` / `interview_assessments` — 面试和评估
- `conversations` / `messages` — LUI 对话
- `agents` / `lui_workflows` — Agent 和工作流状态
- `memories` / `session_memories` — 记忆存储
- `import_batches` / `import_file_tasks` — 导入流水线
- `remote_users` — 远程账户 (baobao)

## SERVICES

| Service | 职责 |
|---------|------|
| `messageService` | 消息创建/完成/删除 |
| `syncManager` | 远程 baobao 同步 |
| `import/pipeline` | 简历批量导入 + AI 筛选 |
| `imr/importer + exporter` | IMR 包导入导出 |
| `lui-tools` | LUI 工具注册表和执行 |
| `lui-workflow` | 工作流状态推进 S0→S1→S2→completed |
| `lui-agents` | Agent 解析、默认 Agent、protected Agent |
| `lui-context` | 候选人上下文构建 prompt |
| `share/discovery` | UDP 广播设备发现 |
| `share/transfer` | 文件推送到设备 |
| `email` | SMTP 邮件发送 |
| `document-templates` | 评估报告模板 |

## ANTI-PATTERNS

- **13+ 空 catch 块**: `services/` 多处 `.catch({})` silent failure
- **59 `console.*` 调用**: 非结构化日志，遍布 17 个文件
- **3 `as any` 类型断言**: `routes.ts` 绕过 TS 类型检查
- **13x `128000` 魔数**: maxTokens 硬编码 (GPT-4o 等)
- **3556 行巨型 routes.ts**: 应按功能域拆分为 `routes/` 下的独立文件（部分已拆分但主文件仍臃肿）
- **967 行 lui-tools.ts**: 工具定义和执行逻辑未分离
- **hardcoded 平台**: `bun build --compile --target=bun-darwin-arm64` 仅支持 Apple Silicon
- **Turbo 弱用**: root build 用 `&&` 链而非 `turbo run build`

## COMMANDS

```bash
pnpm dev:server    # Bun dev server，监听 :9092
pnpm build:server  # bun build --compile
pnpm typecheck     # tsc --noEmit
```

## DEPENDENCIES

- `bun` — 运行时
- `drizzle-orm` + `bun:sqlite` — 数据库
- `jszip` — ZIP 压缩包处理
- `nodemailer` — 邮件发送
- `unpdf` — PDF 文本提取
- `@ai-sdk/openai` — AI 模型调用 (Vercel AI SDK)
