# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-22
**Commit:** 1bbebb8
**Branch:** master

## OVERVIEW

Interview Manager (IMS) — 候选人管理系统。Tauri v2 桌面壳 + Vue 3 前端 + Bun.serve 本地服务 + SQLite/Drizzle ORM。

## STRUCTURE

```
ims/
├── apps/
│   ├── web/           # Vue 3 + Vite SPA (@ims/web)
│   └── desktop/        # Tauri v2 桌面壳 (@ims/desktop)
├── packages/
│   ├── server/        # Bun HTTP API 服务 (@ims/server)
│   └── shared/        # 共享类型和常量 (@ims/shared)
└── .spec-workflow/    # Spec 驱动开发工作流
    ├── steering/       # 产品/技术愿景
    ├── specs/          # 功能规格（每个功能一个目录）
    └── archive/        # 历史文档归档
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Web 开发 | `apps/web/src/` | Vue SPA，路由在 `router/index.ts` |
| API 开发 | `packages/server/src/` | Bun.serve，路由在 `routes.ts` |
| 共享类型 | `packages/shared/src/` | DB Schema、API 类型、常量 |
| 桌面入口 | `apps/desktop/src/lib.rs` | Tauri 主逻辑 |
| 构建配置 | `apps/desktop/tauri.conf.json` | 窗口、bundle、权限 |

## CONVENTIONS (THIS PROJECT)

- **pnpm workspaces** + Turbo orchestrator
- **TypeScript strict mode** — 所有包均启用
- **路径别名** — `@/*` → `./src/*` (web)
- **无 ESLint/Prettier** — 依赖 TS strict 保证质量
- **无测试** — 当前阶段未配置测试基础设施

## ANTI-PATTERNS (THIS PROJECT)

- **9+ 空 catch 块** — `packages/server/src/services/` 多处 silent failure
- **`as any` 类型断言** — `routes.ts` 中 6 处 bypass 类型安全
- **console.log/error** — 生产代码使用 console 而非结构化日志
- **禁用 linter** — `extractor.ts` 使用 `eslint-disable-next-line`
- **Magic numbers** — 硬编码超时、端口、重试次数（无配置化）

## UNIQUE STYLES

- **.spec-workflow/** — Spec 驱动开发模板系统
- **双包管理器** — pnpm workspace + bun.lock (server runtime)
- **Tauri dev 编排** — `beforeDevCommand` 并行启动 server + web

## COMMANDS

```bash
# 开发
pnpm dev              # Web dev server (Vite :5173)
pnpm dev:server       # Bun API server (:3000)
pnpm dev:desktop      # Tauri desktop (web + server + native)

# 构建
pnpm build            # shared → server → web
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
| `specs/imr-format/` | IMR 包格式规范（共享单位格式） | 大部分完成，artifacts 导入待完善 |
| `specs/local-api/` | 本地 API 规范（全部业务接口） | 后端完成，UI 迁移待完成 |
| `specs/import-pipeline/` | 导入流水线规范（简历导入流程） | 后端完成，UI 进度展示待完善 |
| `specs/embedded-opencode-service/` | 内置 OpenCode 服务设计（AI 工作台） | 后端完成，LUI 页面接入待完成 |

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

## NOTES

- **无 CI/CD** — 无 GitHub Actions/Docker
- **无测试** — 当前阶段未配置测试基础设施
- **opencode-manager** — 基础子进程管理实现（待完善 crash 重启逻辑）
- **.imr 文件关联** — Tauri 配置了 `imr://` deep link 和文件关联
