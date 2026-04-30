# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-25
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
│   └── shared/       # 共享类型和常量 (@ims/shared)
├── .spec-workflow/    # Spec 驱动开发工作流
├── archive/           # 历史文档归档
└── runtime/          # 本地运行时数据（SQLite、日志等）
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
- **双锁文件** — pnpm-lock.yaml + bun.lock（pnpm管理workspace + Bun运行时）

## ANTI-PATTERNS (THIS PROJECT)

- **13+ 空 catch 块** — `services/` 多处 silent failure (`.catch(() => {})`)
- **`as any` 类型断言** — `routes.ts` 3 处 bypass 类型安全
- **57+ console.* 调用** — server 代码使用 console 而非结构化日志
- **禁用 linter** — `extractor.ts` 使用 `eslint-disable-next-line`
- **Magic numbers** — 硬编码超时、端口、重试次数、maxTokens (15x 128000)
- **`@ts-ignore`** — `apps/web/src/auto-imports.d.ts:85`
- **`@ts-expect-error`** — `apps/web/src/auto-imports.d.ts` 多处
- **Entry point 业务逻辑泄漏** — `apps/web/src/main.ts` 混杂 E2E 测试重置逻辑
- **lib.rs 巨型单体** — `apps/desktop/src/lib.rs` 1294 行混合 server 管理、tray、deep-link
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

## DEBUG / VERIFICATION LESSONS

- **区分代码修复与数据生效** — 修改导入、初筛、同步等后端流水线时，必须说明该改动只影响“后续重新触发的流程”，不会自动补齐旧数据。若用户在页面上看不到效果，先确认是否需要重新导入、重跑 AI 初筛、重新同步或执行补数据脚本。
- **后端改动后确认服务真实重载** — `pnpm typecheck` 只能证明代码可编译，不代表运行中的 Bun/Tauri 服务已加载新代码。验证前先确认 server 已重启或 dev watcher 已重新加载，再通过 API/DB 验证实际字段。
- **验证路径要覆盖最终数据源** — UI 不显示时，不要只看前端页面；按“业务流程触发 → API 响应 → DB 字段 → UI 展示”逐层验证。例如院校信息应检查 `candidates.organizationName` 是否真的写入，而不是只确认 `candidateSchools` 或 `universityVerification` 存在于导入任务 JSON。
- **完成说明必须写清生效条件** — 每次修复后固定交代：是否需要重启服务、是否需要重新触发业务流程、是否影响历史数据、用户应如何验证。避免只说“已修复/typecheck 通过”，导致用户刷新旧页面仍看不到变化。

## RELEASE / COMMIT LESSONS

- **功能提交必须同步维护 CHANGELOG** — 生成 commit 前先判断本次变更是否面向用户可见；若是，必须先更新 `CHANGELOG.md` 的 `[Unreleased]` 或当前版本条目，再生成 `apps/web/src/assets/whats-new.json`（`pnpm changelog:build`）。不要只提交代码而漏掉 changelog，否则 release notes / updater notes / What's New 弹窗会缺内容。
- **提交前必须完成 changelog 检查** — 任何 commit 前都必须检查本次变更是否需要记录到 `CHANGELOG.md`；用户可见的功能、修复、文案、发布链路、导入/初筛/同步行为变化都必须写入 `[Unreleased]`，并运行 `pnpm changelog:build` 同步 `apps/web/src/assets/whats-new.json`。未完成该检查不得进入 commit 流程。
- **commit 信息要能反推 changelog 分类** — 提交信息使用清晰 scope + 动词，便于 `git-cliff` 草稿归类；常用映射：`feat`→新增，`fix`→修复，`perf/refactor`→优化，`change`/破坏兼容→变更，`remove`→移除。不要写笼统的 `update stuff`、`misc changes`。
- **提交前检查 changelog 派生产物** — 与 changelog 相关改动提交前至少执行 `pnpm changelog:build`、`pnpm release:check`、`pnpm typecheck`；涉及 UI 展示时再跑对应 Vitest/E2E。确认 `CHANGELOG.md` 是唯一人工维护源，`whats-new.json`、GitHub Release body、Tauri updater notes 都只从它派生。
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

## ENTRY POINT NOTES

- **Web (`apps/web/src/main.ts`)** — 61 行，混杂 localStorage 重置逻辑和 URL query 处理，应提取到 `composables/use-state-reset.ts`
- **Server (`packages/server/src/index.ts`)** — 138 行，auth 恢复逻辑和 DB 查询在模块加载时执行，应拆分到 `services/startup.ts`
- **Desktop (`apps/desktop/src/lib.rs`)** — 1294 行巨型单体，应拆分为 `server.rs`, `logger.rs`, `tray.rs`, `updater.rs`, `deep_link.rs`
- **Shared (`packages/shared/src/index.ts`)** — 38 行，存在冗余的选择性重导出（`export *` 已覆盖部分仍单独列出）

## TESTING

- **Playwright E2E** — 6 spec files in `e2e/`
- **Vitest 单元测试** — 24 .test.ts files across web/server/shared packages
- **Vitest Workspace** — root `vitest.config.ts` 聚合 3 个子项目配置
- **Remote CDP** — 支持通过 Chrome DevTools Protocol 复用已登录浏览器
- **环境变量驱动** — Playwright 配置通过 `PLAYWRIGHT_*` 环境变量控制
- **无 Vitest Vue 组件测试** — Web 包使用 `happy-dom` 而非真实 Vue
- **无 CI 测试任务** — 测试仅本地运行，CI 不执行测试

## KNOWN ISSUES

- **端口** — Server 监听 `:9092`，Web dev server `:9091`（旧文档可能写 3000/5173，需以配置为准）
- **测试基础设施** — Playwright E2E 已配置 + Bun test 单元测试，但无 Vitest、无 CI 测试任务
- **runtime/ 未忽略** — SQLite 和日志在仓库内，应配置 `.gitignore`
- **packages/runtime 幽灵包** — 目录存在但非 workspace 成员（pnpm-workspace.yaml 未声明）
- **双 schema 系统** — `server/schema.ts` (Drizzle) + `shared/db-schema.ts` (TS) 需同步维护
