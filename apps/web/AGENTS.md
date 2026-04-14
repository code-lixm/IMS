# @ims/web — Vue 3 SPA

## OVERVIEW

Vue 3 + Vite + Pinia + Vue Router 单页应用。负责候选人管理界面。

## STRUCTURE

```
src/
├── api/              # API 客户端
├── components/       # 可复用组件
│   ├── ui/           # shadcn-vue 组件库
│   └── lui/          # LUI AI 对话组件
├── views/             # 页面组件
│   ├── LUIView.vue   # AI 对话页面 (~2046 行，巨大)
│   ├── Candidates.vue
│   ├── ImportView.vue
│   └── SettingsView.vue
├── stores/           # Pinia 状态管理
│   ├── lui.ts        # LUI 状态管理
│   └── lui/           # LUI 子模块 (messages.ts 等)
├── router/          # Vue Router 配置
├── lib/             # 工具函数
└── styles/          # 全局样式
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| 路由配置 | `router/index.ts` |
| 状态管理 | `stores/lui.ts` |
| LUI 组件 | `components/lui/` |
| AI 对话 | `views/LUIView.vue` (2046 行) |

## CONVENTIONS (THIS PACKAGE)

- **路径别名** — `@/*` → `./src/*`
- **TS 严格** — `noUnusedLocals: true`, `noUnusedParameters: true`
- **Vite proxy** — `/api` → `http://127.0.0.1:3000`
- **Tailwind CSS** — CSS 变量主题，`class` dark mode strategy
- **工厂模式** — `createLuiMessageModule` 而非 Pinia defineStore

## ANTI-PATTERNS

- 组件中避免直接调用 `fetch`，统一使用 `api/` 下的客户端
- 避免在 `views/` 放置业务逻辑
- **`@ts-ignore`** — `src/auto-imports.d.ts:85` 应修复

## TESTING

- **Playwright E2E** — 3 spec files in `e2e/` directory (17+ tests)
- **Bun test** — 7 unit test files in `src/**/*.test.ts`
- **Remote CDP** — 支持通过 Chrome DevTools Protocol 连接已登录浏览器
- **无 Vitest** — Vue 组件测试未配置（计划中）

## COMMANDS

```bash
pnpm dev          # Vite dev server :5173
pnpm build        # 生产构建
pnpm typecheck    # vue-tsc 检查
```

## AGENTS

前端不再维护本地 AgentHost/Swarm 原型。当前统一通过服务端 `packages/server/src/services/lui-workflow.ts`
与 `deepagents-runtime.ts` 执行 Agent / Workflow 能力，Web 端只负责 UI、配置与 API 调用。
