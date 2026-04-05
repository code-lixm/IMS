# @ims/desktop — Tauri v2 Desktop Shell

**Scope:** `apps/desktop/`

## OVERVIEW

Tauri v2 桌面应用壳。启动时同时拉起前端 dev server 和后端服务，作为独立桌面应用运行。

## STRUCTURE

```
src/
├── main.rs           # 可执行入口（薄封装）
└── lib.rs           # 真实应用入口：Tauri Builder + 内嵌 server

tauri.conf.json      # 窗口、bundle、权限、deep-link 配置
Cargo.toml           # Rust crate 依赖（Tauri 插件）
capabilities/
└── default.json     # 权限模型
```

## ENTRY POINTS

| File | Role |
|------|------|
| `src/main.rs` | 可执行入口，仅做 `.imr` 参数检查后调用库入口 |
| `src/lib.rs` | 真实入口：`tauri::Builder` + `start_server()` |

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Tauri 配置 | `tauri.conf.json` | 窗口、devtools、build 资源 |
| 权限模型 | `capabilities/default.json` | shell:allow-open、deep-link |
| 内嵌 server | `lib.rs::start_server()` | 启动打包后的 server 二进制 |

## DESKTOP-SPECIFIC PATTERNS

- **单实例** — 启用 `tauri-plugin-single-instance`
- **Deep Link** — 注册 `imr://` scheme 和 `.imr` 文件关联
- **内嵌后端** — `lib.rs` 从 Tauri resources 启动 `dist/server` 子进程
- **双端点** — Desktop 既是桌面壳，又是后端服务容器

## BUILD ORCHESTRATION

- `beforeDevCommand` 并行启动 `@ims/server` 和 `@ims/web`
- `devUrl` 指向 `http://127.0.0.1:9091`（前端 dev server）
- 打包时将 `packages/server/dist` 作为资源带入桌面端

## ANTI-PATTERNS

- **Desktop dev ≠ standalone** — 必须通过 `pnpm dev:desktop` 启动，而非单独运行 web/server
- **macOS 特定** — Server 打包目标硬编码为 `bun-darwin-arm64`

## COMMANDS

```bash
pnpm dev:desktop    # Tauri desktop（完整开发链路）
pnpm build          # 桌面端打包
```
