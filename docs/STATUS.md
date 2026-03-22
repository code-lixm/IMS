# 开发进展追踪

> 最后更新: 2026-03-22

---

## 模块状态总览

| 模块 | 状态 | 文件 |
|------|------|------|
| `packages/shared` | ✅ 完成 | `packages/shared/src/` |
| `packages/server` | ✅ 完成 | `packages/server/src/` |
| `apps/web` (Vue3) | ✅ 完成 | `apps/web/src/` |
| `apps/desktop` (Tauri) | ✅ 完成 | `apps/desktop/src/` |
| 远程系统适配 | 🔲 待做 | stub — 依赖公司内部 API |

---

## 目录结构（Monorepo）

```
ims/
├── packages/
│   ├── shared/        ← Server ↔ Web 共享类型
│   └── server/       ← Bun API 服务
├── apps/
│   ├── web/          ← Vue3 + Vite + Tailwind
│   └── desktop/      ← Tauri 桌面壳
└── docs/
```

---

## 构建命令

```bash
pnpm install          # 安装所有包依赖
pnpm dev              # 开发前端 (apps/web)
pnpm dev:server       # 开发 Server (packages/server)
pnpm dev:desktop      # 开发 Desktop (apps/desktop)
pnpm build            # 全量构建
pnpm typecheck        # 全量类型检查
```

---

## 依赖关系

```
apps/web
  └── @ims/shared

packages/server
  └── @ims/shared
  └── bun:sqlite / drizzle-orm / jszip / pdf-parse / tesseract.js

apps/desktop
  └── (无直接依赖，通过 beforeDevCommand 启动 web 服务)
```

---

## 剩余待做

- **远程系统适配** — 等公司内部 API 文档，实现 `RemoteClient`
- **shadcn/ui 组件接入** — 需在 `apps/web` 中运行 `npx shadcn@latest init`
- **Tauri 打包签名** — 需配置 macOS/Windows 签名证书
