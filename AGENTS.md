# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-20
**Commit:** 8df4ec7
**Branch:** master

## OVERVIEW

Interview Manager (IMS) — 候选人管理系统。Tauri v2 桌面壳 + Vue 3 前端 + Bun.serve 本地服务 + SQLite/Drizzle ORM。

## STRUCTURE

```
ims/
├── apps/
│   ├── web/           # Vue 3 + Vite SPA (@ims/web)
│   └── desktop/       # Tauri v2 桌面壳 (@ims/desktop)
├── packages/
│   ├── server/        # Bun HTTP API 服务 (@ims/server)
│   └── shared/        # 共享类型和常量 (@ims/shared)
├── .spec-workflow/    # Spec 驱动开发工作流
├── archive/           # 历史文档归档
└── runtime/           # 本地运行时数据（SQLite、日志等）
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Web 开发 | `apps/web/src/` | Vue SPA，路由在 `router/index.ts` |
| UI 组件 | `apps/web/src/components/ui/` | shadcn-vue 风格的组件库 |
| LUI 组件 | `apps/web/src/components/lui/` | AI 对话界面组件 |
| API 开发 | `packages/server/src/` | Bun.serve，路由在 `routes.ts` |
| 服务层 | `packages/server/src/services/` | 业务逻辑：导入、IMR、同步等 |
| 共享类型 | `packages/shared/src/` | DB Schema、API 类型、常量 |
| 桌面入口 | `apps/desktop/src/lib.rs` | Tauri 主逻辑 |
| 构建配置 | `apps/desktop/tauri.conf.json` | 窗口、bundle、权限、deep-link |

## CONVENTIONS (THIS PROJECT)

- **pnpm workspaces** + Turbo orchestrator
- **TypeScript strict mode** — 所有包均启用 `strict: true`
- **路径别名** — `@/*` → `./src/*` (web)
- **无 ESLint/Prettier** — 依赖 TS strict 保证质量（刻意选择）
- **无测试** — 当前阶段未配置测试基础设施
- **双锁文件** — pnpm-lock.yaml + bun.lock（pnpm管理workspace + Bun运行时）

## ANTI-PATTERNS (THIS PROJECT)

- **13+ 空 catch 块** — `services/` 多处 silent failure (`.catch(() => {})`)
- **`as any` 类型断言** — `routes.ts` 3 处 bypass 类型安全
- **57+ console.* 调用** — server 代码使用 console 而非结构化日志
- **禁用 linter** — `extractor.ts` 使用 `eslint-disable-next-line`
- **Magic numbers** — 硬编码超时、端口、重试次数、maxTokens (15x 128000)
- **`@ts-ignore`** — `apps/web/src/auto-imports.d.ts:85`
- **hardcoded 平台** — server `bun build --compile --target=bun-darwin-arm64` 只能跑 Apple Silicon
- **无 CI/CD** — 没有 GitHub Actions/Docker
- **Turbo 弱用** — root build 用 `&&` 链而非 `turbo run build`

## UNIQUE STYLES

- **.spec-workflow/** — Spec 驱动开发模板系统
- **双包管理器** — pnpm workspace + bun.lock (server runtime)
- **Tauri dev 编排** — `beforeDevCommand` 并行启动 server + web
- **运行时数据在仓库内** — `runtime/` 目录存放 SQLite 和日志
- **双 schema 系统** — `server/src/schema.ts` (Drizzle) + `shared/src/db-schema.ts` (TS 类型)
- **应用启动时自举** — 无独立 migration 目录，`db.ts` 直接执行 `CREATE TABLE IF NOT EXISTS`

## WORK LOG HABIT

- **任务完成后同步记录到思源 Todo** — 每次完成任务后，都要把完成项追加到思源笔记文档 `20260331222315-kmk5hvx`（`IMS Todo List`）中。
- **按当天日期归档** — 优先写入当天对应的日期小节；若当天小节不存在，则先创建日期标题再追加内容。
- **避免重复记录** — 插入前先检查当天是否已存在语义重复的完成项；若已有同类记录，不重复追加。
- **采用 changelog 风格** — 记录格式统一为 `scope：description`，例如：`导出：完成 IMR 全量导入导出与 overwrite 覆盖导入`。
- **只记录已完成事项** — 仅同步已经完成并验证过的任务，不记录进行中或未验证的事项。

## RELEASE / COMMIT LESSONS

- **发版提交前必须同步所有版本文件** — 不要只改 root `package.json` 和 `apps/desktop/package.json`。发布 tag 前必须确认以下文件版本一致：`package.json`、`apps/web/package.json`、`apps/desktop/package.json`、`packages/server/package.json`、`packages/shared/package.json`、`apps/desktop/Cargo.toml`、`apps/desktop/Cargo.lock`、`apps/desktop/tauri.conf.json`、`apps/desktop/tauri.local.conf.json`。否则 GitHub Actions 虽会被 tag 触发，但构建产物版本可能错误，甚至 release 失败。
- **发版前先跑检查** — tag/push 前至少执行 `pnpm release:check`、`pnpm typecheck`、`cargo fmt --check && cargo check`、`git diff --check`；涉及 Web 构建时再跑 `pnpm build:web`。`release:check` 的版本一致性必须 PASS。
- **已推送失败 tag 不要覆盖** — 如果远端 `vX.Y.Z` 已触发失败，优先修复后发新的 patch tag（例如 `v1.0.6`），避免 force 更新已推送 tag。
- **不要提交本地签名私钥** — `apps/desktop/sparkle_private_key.txt`、Tauri/Sparkle 私钥、`.env`、secret 文件只用于本地或 GitHub Secrets，不能纳入 commit。

## COMMANDS

```bash
# 开发
pnpm dev:ui           # 仅启动 Web UI (Vite :5173)
pnpm dev:server       # 仅启动 Bun API server (:9092)
pnpm dev:web          # 启动完整 Web 链路（server + ui）
pnpm dev:desktop      # 启动完整 Desktop 链路（web + server + native)

# 构建
pnpm build:ui         # 仅构建 Web UI
pnpm build:server     # 仅构建本地 API server
pnpm build:web        # 构建完整 Web 链路（shared → server → ui）
pnpm build:desktop    # 构建桌面安装包
pnpm build:desktop:local # 构建本地桌面包（local config / no-sign）
pnpm typecheck        # 全量类型检查
pnpm check            # typecheck + build (跳过 desktop)

# 清理
pnpm clean            # Turbo clean + rm node_modules
```

## DOCUMENTATION

所有功能文档位于 `.spec-workflow/` 目录下，采用 Spec 驱动开发工作流。

### Spec 索引

| Spec | 说明 | 状态 |
|------|------|------|
| `steering/product.md` | 产品全景图（愿景、用户、核心功能） | 现行 |
| `specs/lui-ai-gateway/` | LUI AI Gateway（Vercel AI SDK 集成） | 进行中 |
| `specs/local-ai-workbench/` | 本地 AI 工作台 | 进行中 |
| `specs/web-frontend-architecture-hardening/` | 前端架构加固 | 进行中 |
| `specs/imr-format/` | IMR 包格式规范（共享单位格式） | 大部分完成 |
| `specs/local-api/` | 本地 API 规范（全部业务接口） | 后端完成 |
| `specs/import-pipeline/` | 导入流水线规范（简历导入流程） | 后端完成 |
| `specs/embedded-opencode-service/` | 内置 OpenCode 服务设计（AI 工作台） | 后端完成 |

### Spec 开发流程

1. **Requirements** — 定义需求（用户故事 + 验收标准）
2. **Design** — 技术设计（架构、接口、数据结构）
3. **Tasks** — 任务分解（原子任务 + 文件路径 + 进度追踪）
4. **Implementation** — 实现（使用 `spec-status` 检查进度）

### 历史文档

已归档到 `.spec-workflow/archive/`：
- `PRD.md` — 原产品需求文档 → `steering/product.md`
- `IMR-Spec.md` → `specs/imr-format/design.md`
- `Local-API-Spec.md` → `specs/local-api/design.md`
- `Import-Pipeline-Spec.md` → `specs/import-pipeline/design.md`
- `Embedded-OpenCode-Service-Spec.md` → `specs/embedded-opencode-service/design.md`
- `Monorepo-Migration-Spec.md` — 已完成迁移
- `STATUS.md` — 废弃，由各 spec 的 `tasks.md` 替代

## ENTRY POINTS

| 应用 | 入口文件 | 说明 |
|------|----------|------|
| Web | `apps/web/src/main.ts` | Vue SPA 入口 |
| Server | `packages/server/src/index.ts` | Bun.serve 启动 |
| Desktop | `apps/desktop/src/main.rs` → `lib.rs` | Rust 薄入口 → Tauri 应用 |
| Shared | `packages/shared/src/index.ts` | Barrel 导出 |

## KNOWN ISSUES

- **端口** — Server 监听 `:9092`，Web dev server `:9091`（旧文档可能写 3000/5173，需以配置为准）
- **测试基础设施** — Playwright E2E 已配置 + Bun test 单元测试，但无 Vitest、无 CI 测试任务
- **runtime/ 未忽略** — SQLite 和日志在仓库内，应配置 `.gitignore`
- **packages/runtime 幽灵包** — 目录存在但非 workspace 成员（pnpm-workspace.yaml 未声明）
- **双 schema 系统** — `server/schema.ts` (Drizzle) + `shared/db-schema.ts` (TS) 需同步维护
