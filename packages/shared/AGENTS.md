# @ims/shared — Shared Types & Constants

**Scope:** `packages/shared/src/`

## OVERVIEW

跨包共享类型、常量和字典。TS `composite` 项目，只产出声明文件供 web/server 引用。

## STRUCTURE

```
src/
├── index.ts           # Barrel export
├── constants.ts       # 共享常量（端口、文件扩展名、APP_ID）
├── api-types.ts       # API 请求/响应类型 (~694 行)
├── db-schema.ts       # DB Schema 类型定义 (~397 行)
├── baobao-types.ts    # 远程系统类型 (~214 行)
└── dictionaries/      # 字典文件
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| API 类型 | `api-types.ts` | 请求/响应类型，web/server 共用 |
| DB Schema | `db-schema.ts` | TypeScript 类型定义（不同于 server/schema.ts Drizzle schema） |
| 常量 | `constants.ts` | 端口、扩展名、APP_ID |
| 字典 | `dictionaries/` | 多语言/领域字典 |

## CONVENTIONS (THIS PACKAGE)

- **TS composite** — `tsc --emitDeclarationOnly`，只生成 `.d.ts`
- **Workspace 引用** — 被 `@ims/web` 和 `@ims/server` 通过 `workspace:*` 引用
- **无运行时代码** — 只包含类型和常量，无业务逻辑

## ANTI-PATTERNS

- **双 Schema 系统** — 此包的 `db-schema.ts` (TS) 与 server 的 `schema.ts` (Drizzle) 需同步维护
- **无运行时代码** — 只包含类型和常量，无业务逻辑（设计决策，非反模式）

## KEY CONSTANTS

```typescript
// packages/shared/src/constants.ts
SERVER_PORT = 9092      // 注意：不同于旧文档中的 3000
IMR_FILE_EXT = ".imr"
APP_ID = "com.company.interview-manager"
```

## NOTES

- Web 和 Server 都引用此包：`references` in tsconfig
- 运行时数据目录 `runtime/` 由 server 在启动时自动创建
