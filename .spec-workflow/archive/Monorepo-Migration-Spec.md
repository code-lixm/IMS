# Interview Manager — 项目结构重构需求文档

## 1. 概述

### 1.1 项目背景

Interview Manager 是一款公司内部面试管理桌面工具，支持候选人管理、简历导入、AI 工作台、局域网共享。

### 1.2 当前架构

项目采用 Monorepo 结构，包含 4 个独立维护的包：

| 包 | 职责 | 技术栈 |
|---|---|---|
| `packages/shared` | Server ↔ Web 共享类型契约 | TypeScript |
| `packages/server` | 本地 Bun API 服务 | Bun + Drizzle + bun:sqlite |
| `apps/web` | Vue3 前端界面 | Vue3 + Vite + Tailwind + Pinia |
| `apps/desktop` | Tauri 桌面壳 | Rust + Tauri v2 |

---

## 2. 技术栈

| 层级 | 技术 | 版本要求 |
|------|------|---------|
| Monorepo 工具 | pnpm + workspace | ≥ 9.x |
| 包管理 | pnpm | ≥ 9.x |
| Desktop 壳 | Tauri | v2 |
| Server Runtime | Bun | 最新稳定版 |
| Server 语言 | TypeScript | ≥ 5.x |
| Server ORM | Drizzle ORM + bun:sqlite | latest |
| Web Framework | Vue 3 | ≥ 3.5 |
| Web 构建 | Vite | ≥ 6.x |
| Web UI 组件 | shadcn/vue + Tailwind CSS | latest |
| Web 路由 | Vue Router | latest |
| Web 状态 | Pinia | latest |
| Shared 语言 | TypeScript | ≥ 5.x |

---

## 3. Monorepo 目录结构

```
ims/                              # 项目根目录（workspace root）
├── package.json                  # workspace root package.json
├── pnpm-workspace.yaml           # pnpm workspace 配置
├── turbo.json                   # Turborepo 任务编排配置（可选）
│
├── packages/                    # 共享包
│   ├── shared/                  # 共享类型与 API schema
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts        # 统一导出
│   │       ├── api-types.ts    # API 请求/响应类型（从 Local-API-Spec 生成）
│   │       ├── db-schema.ts    # 数据库 Schema 类型（对应 server schema）
│   │       └── constants.ts     # 共享常量（端口、路径等）
│   │
│   └── server/                 # Bun API 服务
│       ├── package.json
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       └── src/
│           ├── index.ts         # 服务入口
│           ├── config.ts        # 服务配置
│           ├── db.ts           # SQLite 建表 + Drizzle 实例
│           ├── schema.ts       # 数据库 schema（同步到 shared/db-schema.ts）
│           ├── routes.ts        # 路由入口（接入 shared/api-types 类型）
│           ├── utils/
│           │   └── http.ts     # 统一响应格式
│           └── services/
│               ├── sync-manager.ts
│               ├── opencode-manager.ts
│               ├── import/
│               │   ├── types.ts
│               │   ├── extractor.ts
│               │   ├── parser.ts
│               │   └── pipeline.ts
│               ├── imr/
│               │   ├── types.ts
│               │   ├── exporter.ts
│               │   └── importer.ts
│               └── share/
│                   ├── discovery.ts
│                   └── transfer.ts
│
├── apps/                       # 应用
│   ├── desktop/                # Tauri 桌面壳
│   │   ├── package.json       # 仅用于 `pnpm --filter` 过滤，不含依赖
│   │   ├── tauri.conf.json
│   │   ├── Cargo.toml
│   │   ├── build.rs
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   └── main.rs
│   │   ├── capabilities/
│   │   │   └── default.json
│   │   └── icons/
│   │
│   └── web/                   # Vue3 前端
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── index.html
│       ├── public/
│       │   └── favicon.ico
│       └── src/
│           ├── main.ts         # 入口
│           ├── App.vue         # 根组件
│           ├── api/            # API 调用层（调用 packages/server 的 API）
│           │   ├── client.ts   # 统一 fetch 封装（统一响应格式解析）
│           │   ├── auth.ts
│           │   ├── candidates.ts
│           │   ├── import.ts
│           │   ├── share.ts
│           │   ├── sync.ts
│           │   └── opencode.ts
│           ├── components/     # Vue 组件（对应 shadcn/ui）
│           ├── views/          # 页面级组件
│           │   ├── CandidatesView.vue
│           │   ├── CandidateDetailView.vue
│           │   ├── ImportView.vue
│           │   └── SettingsView.vue
│           ├── stores/         # Pinia stores
│           │   ├── auth.ts
│           │   ├── candidates.ts
│           │   └── sync.ts
│           ├── router/
│           │   └── index.ts
│           ├── types/          # 组件 props/emits 类型（从 shared 扩展）
│           └── styles/
│               └── main.css
│
├── docs/                       # 文档
│   ├── SPEC.md
│   ├── STATUS.md
│   ├── Local-API-Spec-v0.1.md
│   └── ...
│
├── README.md
└── .gitignore
```

---

## 4. 包职责与边界

### 4.1 `packages/shared`

**职责**：Server 与 Web 共享 TypeScript 类型定义，是两者之间的"契约"。

**原则**：
- Server 的 `schema.ts` 中的所有表结构，生成对应 TypeScript 类型放入 `shared/src/db-schema.ts`
- `api-types.ts` 中的类型必须与 `Local-API-Spec-v0.1.md` 一致
- Server 通过 `pnpm --filter @ims/shared build` 构建为 npm 包（或直接引用源文件）
- Web 依赖 `shared`，API 响应类型从 `shared` 导入

### 4.2 `packages/server`

**职责**：本地 Bun API 服务，对应原有 `server/`。

**变化**：
- 独立 `package.json` 和 `tsconfig.json`
- 通过 `shared` 导入 API 类型，不再自己定义一遍
- 服务端口固定为 `3000`
- 数据库：`{runtimeDir}/interview.db`（`runtimeDir` 通过 `process.cwd()` 计算）
- Web 通过 `window.location.origin` 或固定 `http://127.0.0.1:3000` 访问

### 4.3 `apps/web`

**职责**：Vue 3 SPA，对用户提供完整的 UI 界面。

**技术选型**：
- **Vue 3**（Composition API + `<script setup>`）
- **Vite**（开发服务器 + 构建）
- **shadcn/vue**（UI 组件库，基于 Radix Vue + Tailwind CSS）
- **Vue Router**（路由：`/` `/candidates/:id` `/import` `/settings`）
- **Pinia**（状态管理）
- **TypeScript**（严格模式）

**shadcn/ui 初始化（首次使用需要）**：
```bash
cd apps/web
npx shadcn@latest init
npx shadcn@latest add button card input label dialog badge table dropdown-menu
```
> 当前视图已使用原生 HTML + Tailwind 实现，可逐步迁移到 shadcn 组件。

**API 层**：
- 所有 API 调用通过 `apps/web/src/api/client.ts`（统一 fetch 封装）
- 响应格式统一解析（`{ success, data, error }`）
- 类型从 `packages/shared` 导入

### 4.4 `apps/desktop`

**职责**：Tauri 桌面壳。

**变化**：
- 从根目录移到 `apps/desktop/`
- 依赖 `packages/server` 的路径通过环境变量或相对路径引用
- 构建后，Server 由 Tauri 启动（`beforeDevCommand` → `bun run dev --filter @ims/server`）

---

## 5. 构建与工作流

### 5.1 工作区配置（`pnpm-workspace.yaml`）

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

### 5.2 根 `package.json` scripts

```json
{
  "scripts": {
    "dev": "pnpm --filter @ims/web dev",
    "dev:server": "pnpm --filter @ims/server dev",
    "dev:desktop": "pnpm --filter @ims/desktop tauri dev",
    "build": "pnpm --filter @ims/shared build && pnpm --filter @ims/server build && pnpm --filter @ims/web build",
    "typecheck": "pnpm --filter @ims/shared check && pnpm --filter @ims/server check && pnpm --filter @ims/web check"
  }
}
```

### 5.3 Tauri 开发时的服务启动顺序

```
# 方式一：分别启动（推荐）
# 终端 1
pnpm dev:server   # Bun Server → http://127.0.0.1:3000
# 终端 2
pnpm dev          # Vite dev server → http://127.0.0.1:5173

# 方式二：Tauri dev 自动启动两者
pnpm dev:desktop  # beforeDevCommand: "pnpm dev:server & pnpm dev:web"
                   # Tauri WebView 加载 http://127.0.0.1:5173
```

---

## 6. 迁移原则

### 6.1 文件迁移映射

| 原路径 | 新路径 |
|--------|--------|
| `server/src/` | `packages/server/src/` |
| `server/package.json` | `packages/server/package.json` |
| `web/public/index.html` | `apps/web/index.html` |
| `src-tauri/` | `apps/desktop/` |
| — | `packages/shared/src/`（新建）|

### 6.2 迁移原则

1. **不重写逻辑** — 所有业务代码（routes、services）原样迁移，只调整 import 路径
2. **逐步拆分** — 先建结构，再迁移代码，最后验证
3. **保持 git 历史** — 使用 `git mv` 保留文件历史
4. **类型驱动** — 先完成 `packages/shared` 类型定义，Server 和 Web 依赖之

### 6.3 验证标准

- `pnpm dev` 能同时启动 Server + Web（热更新）
- `pnpm --filter @ims/web typecheck` 无错误
- `pnpm --filter @ims/server typecheck` 无错误
- `pnpm --filter @ims/desktop cargo check` 无错误（Tauri）
- 浏览器能正常加载页面，API 请求能到达 Server

---

## 7. 实施步骤（已完成 ✅）

### Step 1 — 创建 Monorepo 根结构 ✅

- [x] 创建 `pnpm-workspace.yaml`
- [x] 配置根 `package.json`（workspaces 字段 + scripts）
- [x] 创建 `apps/`、`packages/` 目录

### Step 2 — 创建 `packages/shared` ✅

- [x] `package.json` + `tsconfig.json`（composite: true）
- [x] 迁移 `server/src/schema.ts` → `packages/shared/src/db-schema.ts`
- [x] 根据 `Local-API-Spec-v0.1.md` 生成 `packages/shared/src/api-types.ts`
- [x] 创建 `packages/shared/src/constants.ts`（端口、路径常量）

### Step 3 — 迁移 `packages/server` ✅

- [x] `package.json`（依赖 `shared`） + `tsconfig.json`
- [x] 迁移所有 `server/src/` 文件
- [x] 修改 import：从 `shared` 导入类型
- [x] `pnpm exec tsc --noEmit` ✅

### Step 4 — 创建 `apps/web` ✅

- [x] `package.json`（依赖 `shared`）+ `tsconfig.json`
- [x] Vite 配置 + Tailwind 配置
- [x] 安装依赖（`radix-vue` + `tailwind`）
- [x] API 调用层（`apps/web/src/api/`）
- [x] 实现 Views（候选人列表、详情、导入、设置）
- [x] 实现 Router + Pinia stores
- [x] `vue-tsc --noEmit` ✅
- [ ] shadcn/ui 组件接入（TODO：需运行 `npx shadcn@latest init` 并添加组件）

### Step 5 — 迁移 `apps/desktop` ✅

- [x] 移动 `src-tauri/` → `apps/desktop/`
- [x] 更新 `tauri.conf.json` 中的路径（`devUrl` → `http://127.0.0.1:5173`）
- [x] `cargo check` ✅

### Step 6 — 收尾 ✅

- [x] 删除原 `server/`、`web/`、`src-tauri/` 目录
- [x] 更新根 `.gitignore`
- [x] 全量 `pnpm install` ✅
- [x] 全量 typecheck 验证 ✅

---

## 8. 关键约束

1. **Server 不引用 Web** — Server 完全独立，无 Vue/Vite 依赖
2. **Web 不直接操作数据库** — 所有数据通过 Server API 访问
3. **Shared 包保持纯净** — 仅 TypeScript 类型，不含运行时逻辑
4. **端口约定** — Server 始终 `127.0.0.1:3000`，Web 开发 `localhost:5173`，Tauri 内嵌 Server URL 通过配置注入
