# @ims/web — Vue 3 SPA

## OVERVIEW

Vue 3 + Vite + Pinia + Vue Router 单页应用。负责候选人管理界面。

## STRUCTURE

```
src/
├── api/           # API 客户端 (auth, candidates, import, interviews, system)
├── components/    # 可复用组件
├── views/         # 页面组件 (Candidates, Import, Settings)
├── stores/       # Pinia 状态管理
├── router/       # Vue Router 配置
├── lib/          # 工具函数
└── styles/       # 全局样式
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| 路由配置 | `router/index.ts` |
| 状态管理 | `stores/` |
| API 调用 | `api/` |
| 页面组件 | `views/` |

## CONVENTIONS (THIS PACKAGE)

- **路径别名** — `@/*` → `./src/*`
- **TS 严格** — `noUnusedLocals: true`, `noUnusedParameters: true`
- **Vite proxy** — `/api` → `http://127.0.0.1:3000`
- **Tailwind CSS** — CSS 变量主题，`class` dark mode strategy

## ANTI-PATTERNS

- 组件中避免直接调用 `fetch`，统一使用 `api/` 下的客户端

## COMMANDS

```bash
pnpm dev          # Vite dev server :5173
pnpm build        # 生产构建
pnpm typecheck    # vue-tsc 检查
```
