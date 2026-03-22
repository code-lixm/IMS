# @ims/server — Bun HTTP API

## OVERVIEW

Bun.serve + Drizzle ORM + SQLite。本地 REST API 服务。

## STRUCTURE

```
src/
├── index.ts      # Bun.serve 入口
├── routes.ts     # 所有路由处理
├── db.ts         # Drizzle client
├── schema.ts     # DB schema
├── config.ts     # 服务器配置
├── services/     # 业务逻辑
│   ├── import/   # 简历导入
│   ├── imr/      # IMR 文件处理
│   ├── share/    # 设备发现 (UDP broadcast)
│   └── sync/     # 远程同步
└── utils/        # 工具函数
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| API 路由 | `routes.ts` |
| DB 操作 | `db.ts`, `schema.ts` |
| 服务逻辑 | `services/` |
| 配置 | `config.ts` |

## CONVENTIONS (THIS PACKAGE)

- **Bun runtime** — 无需编译，直接运行
- **Drizzle ORM** — SQLite via `bun:sqlite`
- **结构化日志缺失** — 使用 console.* 而非 logger

## ANTI-PATTERNS (THIS PACKAGE)

- **9+ 空 catch 块** — `services/` 多处 silent failure
- **`as any` 类型断言** — `routes.ts` 6 处 bypass TS
- **console.* 调用** — 应替换为结构化日志
- **Magic numbers** — 超时/端口/重试次数硬编码

## COMMANDS

```bash
pnpm dev          # Bun dev server :3000
pnpm build        # echo 'no build step needed for bun'
pnpm typecheck    # tsc --noEmit
```

## DEPENDENCIES

- `bun` — Runtime
- `drizzle-orm` + `bun:sqlite` — DB
- `better-sqlite3` 或 `bun:sqlite` — SQLite 驱动
