# @ims/server — Bun HTTP API

## OVERVIEW

Bun.serve + Drizzle ORM + SQLite。本地 REST API 服务。

## STRUCTURE

```
src/
├── index.ts      # Bun.serve 入口
├── routes.ts     # 所有路由 (~3059 行，巨大文件)
├── db.ts         # Drizzle client
├── schema.ts     # DB schema (messages 表在行 205)
├── config.ts     # 服务器配置
├── services/     # 业务逻辑
│   ├── import/   # 简历导入
│   ├── imr/      # IMR 文件处理
│   ├── share/    # 设备发现 (UDP broadcast)
│   ├── lui-tools.ts    # LUI 工具 (~967 行)
│   ├── lui-workflow.ts # LUI 工作流 (~558 行)
│   └── sync/     # 远程同步
└── utils/        # 工具函数
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| API 路由 | `routes.ts` (行 2210 消息 API) |
| DB 操作 | `db.ts`, `schema.ts` (行 205 messages 表) |
| 服务逻辑 | `services/` |
| LUI 工作流 | `services/lui-workflow.ts` |
| LUI 工具 | `services/lui-tools.ts` |

## CONVENTIONS (THIS PACKAGE)

- **Bun runtime** — 无需编译，直接运行
- **Drizzle ORM** — SQLite via `bun:sqlite`
- **路由组织** — 所有路由在 `routes.ts`，按功能域分组
- **端口** — 监听 `:3000`

## ANTI-PATTERNS (THIS PACKAGE)

- **9+ 空 catch 块** — `services/` 多处 silent failure
- **`as any` 类型断言** — `routes.ts` 6 处 bypass TS
- **`console.*` 调用** — 应替换为结构化日志
- **Magic numbers** — 超时/端口/重试次数硬编码
- **巨大单体文件** — `routes.ts` 3059 行，应拆分

## COMMANDS

```bash
pnpm dev:server    # Bun dev server :3000
pnpm build        # bun build --compile
pnpm typecheck    # tsc --noEmit
```

## DEPENDENCIES

- `bun` — Runtime
- `drizzle-orm` + `bun:sqlite` — DB
- `nodemailer` — 邮件发送 (Phase 4)
