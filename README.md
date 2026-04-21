# Interview Manager (Scaffold)

本仓库当前包含第一版可运行骨架：

- `Tauri` 目标架构文档
- `Tauri v2` 桌面壳最小工程 (`src-tauri`)
- `Bun.serve` 本地服务
- `bun:sqlite + Drizzle` 本地数据层
- 内置 `opencode-ai` 子进程管理骨架

## 目录

```
ims/
├── apps/
│   ├── web/           # Vue3 前端界面
│   └── desktop/       # Tauri 桌面壳
├── packages/
│   ├── shared/        # 共享类型与 API schema
│   └── server/        # Bun API 服务
└── docs/              # 项目文档
```

### 文档索引

| 文档 | 说明 |
|------|------|
| `docs/PRD.md` | 产品需求文档 |
| `docs/Monorepo-Migration-Spec.md` | Monorepo 结构重构规范 |
| `docs/IMR-Spec.md` | IMR 包格式规范 |
| `docs/Local-API-Spec.md` | 本地 API 规范 |
| `docs/Import-Pipeline-Spec.md` | 导入流水线规范 |
| `docs/Embedded-OpenCode-Service-Spec.md` | 内置 OpenCode 服务设计 |
| `docs/STATUS.md` | 开发进展追踪 |

## 快速启动

1. 安装依赖

```bash
bun install
```

2. 启动完整 Web 开发链路

```bash
pnpm dev:web
```

如需分别启动，也可以使用：

```bash
pnpm dev:server
pnpm dev:ui
```

默认地址：

- Web：`http://127.0.0.1:9091`
- API：`http://127.0.0.1:9092`

## E2E 测试

仓库已接入基于 `Playwright` 的端到端测试骨架，默认使用：

- Web：`http://127.0.0.1:9091`
- API：`http://127.0.0.1:9092`

运行 E2E：

```bash
pnpm run test:e2e
```

默认直接使用本机已安装的 `Google Chrome`。

如果你要指定浏览器和端口，可以在命令前传环境变量：

```bash
PLAYWRIGHT_BROWSER=chrome PLAYWRIGHT_WEB_PORT=9091 PLAYWRIGHT_API_PORT=9092 pnpm run test:e2e
```

可用浏览器值：

- `chrome`
- `chromium`
- `firefox`
- `webkit`
- `msedge`

常用示例：

```bash
# 用本机 Chrome，Web 端口 3001，API 端口 3002
PLAYWRIGHT_BROWSER=chrome PLAYWRIGHT_WEB_PORT=3001 PLAYWRIGHT_API_PORT=3002 pnpm run test:e2e

# 用 Firefox
PLAYWRIGHT_BROWSER=firefox PLAYWRIGHT_WEB_PORT=9091 PLAYWRIGHT_API_PORT=9092 pnpm run test:e2e

# 直接指定完整前端地址和健康检查地址
PLAYWRIGHT_BROWSER=webkit PLAYWRIGHT_BASE_URL=http://127.0.0.1:4000 PLAYWRIGHT_API_HEALTH_URL=http://127.0.0.1:5000/api/health pnpm run test:e2e
```

如果你的前端和后端已经自己跑起来了，想直接测现成地址，例如 `http://localhost:9091/candidates`，可以关闭 `Playwright` 自动起服务：

```bash
PLAYWRIGHT_USE_EXISTING_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:9091 pnpm run test:e2e -- e2e/candidates-route.spec.ts
```

如果还要指定浏览器：

```bash
PLAYWRIGHT_USE_EXISTING_SERVER=1 PLAYWRIGHT_BROWSER=chrome PLAYWRIGHT_BASE_URL=http://localhost:9091 pnpm run test:e2e -- e2e/candidates-route.spec.ts
```

如果你已经在本机手动登录，并且 Chrome 通过 `9333` 暴露了远程调试端口，推荐直接复用这份**已登录浏览器上下文**：

```bash
PLAYWRIGHT_REMOTE_DEBUG_URL=http://127.0.0.1:9333 PLAYWRIGHT_REMOTE_TARGET_URL=http://localhost:9091/candidates pnpm run test:e2e:remote
```

也可以自定义等待的页面标识：

```bash
PLAYWRIGHT_REMOTE_DEBUG_URL=http://127.0.0.1:9333 PLAYWRIGHT_REMOTE_TARGET_URL=http://localhost:9091/candidates PLAYWRIGHT_REMOTE_WAIT_FOR='text=候选人' pnpm run test:e2e:remote
```

还可以追加多条断言，使用 `;;` 分隔：

```bash
PLAYWRIGHT_REMOTE_DEBUG_URL=http://127.0.0.1:9333 \
PLAYWRIGHT_REMOTE_TARGET_URL=http://localhost:9091/candidates \
PLAYWRIGHT_REMOTE_EXPECT_URL=http://localhost:9091/candidates \
PLAYWRIGHT_REMOTE_WAIT_FOR='text=候选人' \
PLAYWRIGHT_REMOTE_ASSERTS='text=候选人;;input[name="candidate-search"]' \
pnpm run test:e2e:remote
```

这条命令不会验证登录流程，而是直接接管你当前已登录的 Chrome，适合“从登录后开始测试”的场景。

可视化调试：

```bash
pnpm run test:e2e:headed
pnpm run test:e2e:debug
```

3. 启动桌面端（Tauri）

```bash
pnpm dev:desktop
```

桌面窗口会加载 `http://127.0.0.1:9091`。

## 环境要求

- `Bun` (推荐最新稳定版)
- `Rust` + `Cargo`
- 系统依赖满足 Tauri v2 要求

## 桌面发布与自动更新

当前仓库已接入：

- GitHub Actions 发布流水线：`.github/workflows/release-desktop.yml`
- Tauri Updater（设置页手动检查与安装，不强制打断用户）

首次启用前请完成 3 步：

1. 生成 updater 签名密钥

```bash
pnpm --filter @ims/desktop tauri signer generate --ci -p "YOUR_STRONG_PASSWORD" -w ~/.tauri/ims-updater.key -f
```

2. 配置 `apps/desktop/tauri.conf.json` 的 updater 公钥

- 将 `plugins.updater.pubkey` 从 `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY` 替换为生成得到的 `publicKey`

3. 在 GitHub 仓库 Secrets 配置：

- `TAURI_SIGNING_PRIVATE_KEY`：私钥文件内容（PEM 文本）
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成密钥时设置的密码

发布方式：

```bash
git tag v1.0.1
git push origin v1.0.1
```

触发后会自动构建并发布 Windows + macOS 安装包，并生成 updater 所需元数据（`latest.json`）。

发布前自检：

```bash
pnpm release:check
```

该命令会检查版本一致性、updater 配置、发布 workflow、Git 状态，并在可用时校验 GitHub secrets 是否存在。

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
