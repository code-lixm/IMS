# @ims/desktop — Tauri v2 Desktop Shell

**Scope:** `apps/desktop/`

## OVERVIEW

Tauri v2 桌面应用壳，同时拉起前端 dev server 和后端服务，作为独立桌面应用运行。支持 `.imr` 文件关联、`imr://` deep link、系统托盘、自动更新。

## STRUCTURE

```
apps/desktop/src/
├── main.rs              # 可执行入口（薄封装）
├── lib.rs               # 真实入口：Tauri Builder + 内嵌 server
├── Cargo.toml           # Rust crate 依赖（Tauri 插件）
├── tauri.conf.json      # 窗口、bundle、权限、deep-link 配置
└── capabilities/
    └── default.json     # 权限模型
```

## ENTRY POINT

```
main.rs
  └── lib.rs::run()
        ├── tauri_plugin_single_instance（单实例）
        ├── tauri_plugin_deep_link（imr:// 协议）
        ├── tauri_plugin_updater（自动更新）
        ├── tauri_plugin_shell（进程管理）
        ├── start_server()（启动内嵌 server 子进程）
        └── setup_tray()（系统托盘）
```

## TAURI CONFIG

| 配置项 | 值 |
|--------|-----|
| productName | IMS |
| identifier | com.company.interview-manager |
| version | 1.0.2 |
| devUrl | http://127.0.0.1:9091 |
| frontendDist | ../web/dist |
| beforeDevCommand | `pnpm --filter @ims/server dev & pnpm --filter @ims/web dev` |
| beforeBuildCommand | `pnpm --filter @ims/shared build && pnpm --filter @ims/server build && pnpm --filter @ims/web build` |

## WINDOW CONFIG

| 属性 | 值 |
|------|-----|
| label | main |
| width | 1280 |
| height | 840 |
| minWidth | 900 |
| minHeight | 600 |
| center | true |
| resizable | true |
| decorations | true |
| dragDropEnabled | true |

## DEEP LINKS

**Protocol:** `imr://`

- 注册通过 `tauri.conf.json` → `plugins.deep-link.schemes`
- 处理流程：`deep-link://new-url` 事件 → `handle_imr_open()` → 前端 `imr-file-opened` 事件

**单实例：** `tauri_plugin_single_instance` 插件捕获 argv 中的 `.imr` 文件路径并转发给主实例。

## FILE ASSOCIATIONS

| 属性 | 值 |
|------|-----|
| ext | imr |
| name | IMR Candidate Package |
| mimeType | application/x-imr |
| description | 面试管理候选人档案包 |

## COMMANDS

```bash
pnpm dev:desktop          # Tauri desktop 开发（完整链路：server + web + native）
pnpm dev:reset-desktop-file  # 清空 desktop 数据后启动
pnpm build:desktop        # 构建桌面安装包
pnpm build:desktop:local  # 构建本地桌面包（local config / no-sign）
```

## WINDOW MANAGEMENT

| 命令 | 说明 |
|------|------|
| `show_main_window` | 显示并聚焦主窗口 |
| `hide_main_window` | 隐藏主窗口到托盘 |
| `is_quitting` | 查询是否正在退出 |

**关闭行为：** 点击关闭按钮时隐藏到托盘，而非退出。真正退出通过托盘菜单 "退出" 或 `app.exit(0)` 实现。

## SYSTEM TRAY

托盘菜单项：
- 显示窗口 / 隐藏窗口
- 打开日志目录
- 导出日志
- 版本信息（只读）
- 退出

左键单击托盘图标：切换窗口显示/隐藏。

## SERVER EMBEDDING

- Server 运行在 `127.0.0.1:9092`
- 启动前检查端口是否被占用，释放残留的 IMS server 进程
- 前端通过 `http://127.0.0.1:9091` 访问 dev server
- 打包后 server 二进制作为 Tauri resources 嵌入

## AUTO UPDATE

- 使用 `tauri-plugin-updater`
- updater 配置在 `tauri.conf.json` → `plugins.updater`
- GitHub Releases 作为更新源
- 前端调用 `check_for_app_update` / `install_app_update` / `restart_desktop_app`

## ANTI-PATTERNS

- **Desktop dev ≠ standalone** — 必须通过 `pnpm dev:desktop` 启动
- **macOS 特定** — Server 打包目标硬编码为 `bun-darwin-arm64`
- **beforeDevCommand** — 使用 shell `&` 后台启动，可能导致僵尸进程
