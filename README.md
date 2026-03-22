# Interview Manager (Scaffold)

本仓库当前包含第一版可运行骨架：

- `Tauri` 目标架构文档
- `Tauri v2` 桌面壳最小工程 (`src-tauri`)
- `Bun.serve` 本地服务
- `bun:sqlite + Drizzle` 本地数据层
- 内置 `opencode-ai` 子进程管理骨架

## 目录

- `server/src`: Bun 服务入口、路由、数据库、OpenCode 管理
- `web/public`: 主界面占位页面
- `src-tauri`: Tauri 桌面壳工程
- `PRD-v0.1.md`: 产品需求文档
- `IMR-Spec-v0.1.md`: 共享包规范
- `Import-Pipeline-Spec-v0.1.md`: 导入流水线规范
- `Local-API-Spec-v0.1.md`: 本地 API 规范
- `Embedded-OpenCode-Service-Spec-v0.1.md`: 内置 OpenCode 服务设计

## 快速启动

1. 安装依赖

```bash
bun install
```

2. 启动本地服务

```bash
bun run dev
```

默认地址：`http://127.0.0.1:3000`

3. 启动桌面端（Tauri）

```bash
bun run desktop:dev
```

桌面窗口会加载 `http://127.0.0.1:3000`。

## 环境要求

- `Bun` (推荐最新稳定版)
- `Rust` + `Cargo`
- 系统依赖满足 Tauri v2 要求

## 已实现接口（骨架）

- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/sync/toggle`
- `GET /api/candidates`
- `POST /api/candidates`
- `GET|POST /api/candidates/:id/workspace`
- `GET /api/system/opencode/status`
- `POST /api/system/opencode/start`
- `POST /api/system/opencode/stop`

## 注意

- OpenCode 管理器当前是基础实现，后续会接入真实 session 创建流程。
- 目前尚未包含前端业务界面、远程系统适配与完整导入流水线执行器。
- 首次运行 `tauri dev` 前请确保本机已安装 Rust 工具链。
