# IMS Agent 工作说明

本文件是 IMS 仓库的协作入口。执行任务前先理解本文，再按具体包目录下的 `AGENTS.md` 补充规则执行。

---

## 1. 项目概览

Interview Manager（IMS）是候选人管理系统：Tauri v2 桌面壳 + Vue 3 前端 + Bun 本地 API 服务 + SQLite/Drizzle ORM。

```text
ims/
├── apps/
│   ├── web/           Vue 3 + Vite SPA
│   └── desktop/       Tauri v2 桌面壳
├── packages/
│   ├── server/        Bun HTTP API 服务
│   └── shared/        共享类型、常量、DB 类型
├── runtime/           本地运行时数据
├── guideline.md       IMS 设计语言与组件规范
└── .spec-workflow/    Spec 驱动开发工作流
```

---

## 2. 常用入口

| 任务 | 位置 | 备注 |
|---|---|---|
| Web 页面 | `apps/web/src/views/` | 候选人、导入、设置、LUI 等页面 |
| Web 组件 | `apps/web/src/components/` | UI、LUI、业务组件 |
| UI 基础组件 | `apps/web/src/components/ui/` | shadcn-vue 风格组件库 |
| 状态管理 | `apps/web/src/stores/` | Pinia stores |
| API 客户端 | `apps/web/src/api/` | 前端请求封装 |
| Server 路由 | `packages/server/src/routes.ts` | Bun API 路由入口 |
| Server 服务 | `packages/server/src/services/` | 导入、同步、IMR、AI 等业务逻辑 |
| 共享类型 | `packages/shared/src/` | 跨包类型和常量 |
| 桌面入口 | `apps/desktop/src/lib.rs` | Tauri 主逻辑 |
| 设计规范 | `guideline.md` | UI 改动前必须阅读 |

设计相关任务新增硬规则：

- 只要任务涉及 UI、视觉、布局、交互、文案呈现、信息层级、弹窗、表单、页面结构，开始前必须先读取 `guideline.md`，不能凭感觉直接改。

---

## 3. 技术约定

- 包管理：pnpm workspaces + Turbo。
- 运行时：Server 使用 Bun。
- 类型：全包 TypeScript strict。
- Web 路径别名：`@/*` → `apps/web/src/*`。
- 样式：Tailwind CSS + CSS 变量主题。
- 前端请求：组件不要直接 `fetch`，统一走 `apps/web/src/api/`。
- 没有统一 ESLint/Prettier，主要依赖类型检查和现有代码风格。

---

## 4. 设计语言执行规则

任何用户可见 UI 改动都要遵守 `guideline.md`。

### 4.1 IMS UI 的方向

- IMS 是桌面工作台，不是营销网页。
- 设计目标是高效、清晰、稳定、有轻微层次感。
- 页面应保持信息密度，避免大面积 Hero、渐变标题、玻璃拟态和厚重阴影。
- 默认使用浅蓝灰画布 + 白色模块 + 钴蓝主操作。

### 4.2 组件设计语言

- 主按钮：钴蓝 `#0062FF`，36px 高，6px 圆角，无阴影。
- 面板：白底、6-8px 圆角、无默认阴影，用父级浅底建立边界。
- 表单：分组白底模块，输入高度约 34px，说明文字 12px。
- 列表：行式密集布局优先，避免把每一行做成大营销卡片。
- 状态：浅底胶囊，颜色必须绑定语义。
- 筛选模板权重：使用单条三段式拖拽条，2 个控制点切分 100%，不要再使用 3 个独立数字输入框。

### 4.3 UI 改动流程

1. 先读 `guideline.md`。
2. 找到现有相似页面或组件，延续设计语言。
3. 做最小必要改动，避免重写无关区域。
4. 改完至少跑对应包的类型检查。
5. 如果是视觉问题，优先用页面快照或截图确认结构生效。

---

## 5. 常用命令

```bash
# 开发
pnpm dev:ui              # 仅启动 Web UI
pnpm dev:server          # 仅启动 Bun API server
pnpm dev:web             # 启动 Web + Server
pnpm dev:desktop         # 启动桌面链路

# 构建与检查
pnpm --filter @ims/web typecheck
pnpm typecheck
pnpm build:web
pnpm check

# 桌面
pnpm build:desktop
pnpm build:desktop:local
```

注意：`pnpm typecheck` 只证明代码可编译，不代表运行中的 Bun/Tauri 服务已热重载。

---

## 6. 验证策略

按最轻有效方式验证。

| 改动类型 | 推荐验证 |
|---|---|
| Web 类型 / 组件改动 | `pnpm --filter @ims/web typecheck` |
| 跨包 TS 改动 | `pnpm typecheck` |
| Server 逻辑 | 对应 API/DB/日志验证，必要时重启服务 |
| UI 视觉 | Chrome DevTools MCP 页面快照或截图 |
| 数据流程 | 业务触发 → API 响应 → DB 字段 → UI 展示 |

不要主动跑完整测试套件，除非用户明确要求。

---

## 7. 调试经验

- 后端导入、初筛、同步类修复通常只影响后续流程，不会自动补齐旧数据。
- UI 没显示时，不要只看页面。按事件、API、DB、渲染分支逐层确认。
- 运行中服务可能没加载新代码。验证前确认 dev watcher 或服务是否真实重载。
- 遇到“点击无效 / 页面没反应”，优先补最小日志确认事件链。
- 完成说明必须写清：是否需要重启、是否需要重新触发业务流程、是否影响历史数据、用户如何验证。

---

## 8. 已知技术债

- `apps/desktop/src/lib.rs` 仍偏大，混合 server 管理、tray、updater、deep-link。
- Server 层存在空 `catch`、`console.*`、少量 `as any`。
- `apps/web/src/main.ts` 包含部分启动/测试重置逻辑，可继续拆分。
- 双 schema：`packages/server/src/schema.ts` 与 `packages/shared/src/db-schema.ts` 需同步维护。
- `runtime/` 存放本地 SQLite 和日志，处理提交时要特别注意。
- 测试基础设施以本地为主，没有完整 CI 测试链路。

---

## 9. 发布与提交约束

- 用户没有明确要求时，不要提交代码。
- 提交前必须检查是否需要更新 `CHANGELOG.md`。
- 用户可见功能、修复、文案、导入/初筛/同步行为变化都应写入 `[Unreleased]`。
- 更新 changelog 后运行 `pnpm changelog:build` 同步 `apps/web/src/assets/whats-new.json`。
- 发布前必须确认所有版本文件一致：root、web、desktop、server、shared、Cargo、Tauri config。
- 不要提交私钥、`.env`、Tauri/Sparkle key 或本地 secret。
- 已推送失败 tag 不要覆盖，优先修复后发新的 patch tag。

---

## 10. 工作记录习惯

任务完成且验证后，同步记录到思源笔记 `IMS Todo List`：

- 文档 ID：`20260331222315-kmk5hvx`
- 按当天日期小节归档。
- 避免重复记录语义相同事项。
- 格式：`scope：description`
- 只记录已完成、已验证事项。

示例：

```text
设计：将筛选模板权重编辑改为双控制点三段式拖拽条，并通过 Web typecheck 验证
```

---

## 11. 快速决策

- 不知道文件在哪：先用 CodeGraph 或文件结构查询。
- UI 改动：先读 `guideline.md`，再找相似组件。
- API 行为不确定：看 `packages/server/src/routes.ts` 和对应 service。
- 数据字段不确定：同时看 server schema 与 shared db-schema。
- 依赖 API 不确定：查官方文档，不凭记忆猜。
- 环境不稳定：先报告环境 blocker，不要盲目继续。
