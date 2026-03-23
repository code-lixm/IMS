# 客户端内置 OpenCode 服务设计 v0.1

- 状态: Draft
- 目标: 将 `opencode-ai` 封装进客户端内部，由本地 Bun 服务统一启动与管理

## 1. 设计目标

- 不依赖用户全局安装 `opencode-ai`
- 由客户端内部控制版本与生命周期
- 为每位候选人提供独立 workspace/session
- 为主界面提供稳定的本地 LUI 入口

## 2. 基本结论

`opencode-ai` 不是普通前端组件库，而是本地 CLI/服务能力。

因此“封装到客户端里”的正确实现方式是：

- 将 `opencode-ai` 作为应用内部依赖或资源打包
- 由 `Bun.serve` 进程在内部启动 `opencode` 子进程
- 通过本地 HTTP 接口与其交互
- 在客户端内打开 OpenCode Web 页面

## 3. 推荐运行结构

```text
Tauri App
├── Bun Main Service (:3000)
│   ├── DB / API / Import / Share / Sync
│   └── OpenCode Process Manager
└── Embedded OpenCode Service (:4096)
    ├── OpenCode backend
    └── OpenCode web UI
```

## 4. 打包策略

### 4.1 推荐方案

将 `opencode-ai` 随客户端一起打包到应用资源目录。

好处：

- 用户无感知
- 版本可控
- 不依赖首次联网安装
- 不依赖全局 PATH

### 4.2 不推荐方案

- 首次启动时在线下载
- 依赖用户本机全局安装

原因：

- 网络不稳定
- 版本难控
- 内部工具体验差

## 5. 本地目录规划

建议应用私有目录结构：

```text
~/.interview-manager/
├── app.db
├── files/
│   ├── resumes/
│   ├── artifacts/
│   ├── imports/
│   └── exports/
├── opencode/
│   ├── data/
│   ├── sessions/
│   └── logs/
└── logs/
```

说明：OpenCode 工作目录放在应用私有路径，不污染用户全局 OpenCode 数据目录。

## 6. Process Manager 职责

本地 Bun 服务中的 Process Manager 负责：

- 检查 OpenCode 是否运行
- 启动 OpenCode
- 健康检查
- 崩溃重启
- 关闭时回收子进程
- 管理候选人与 session 的映射关系

## 7. 启动流程

```text
客户端启动
→ 启动 Bun Main Service
→ 用户进入某候选人 AI 工作台
→ 检查 OpenCode 是否已启动
→ 若未启动则拉起 opencode web
→ 健康检查通过
→ 创建或恢复候选人的 session
→ 返回 LUI URL 给前端
```

## 8. 健康检查

### 8.1 就绪检查

- 检查本地端口是否监听
- 调用 OpenCode 健康检查接口
- 若失败则持续重试直到超时

### 8.2 崩溃恢复

- 若子进程退出且非主动停止，自动拉起一次
- 若连续重启失败，记录为 `degraded`
- UI 显示 LUI 服务不可用提示

## 9. 端口策略

### 9.1 默认端口

- 主服务: `3000`
- OpenCode: `4096`

### 9.2 冲突处理

- 默认尝试固定端口
- 若被占用，则尝试回退到下一个可用端口
- 最终端口写入内存状态与数据库配置

## 10. 候选人 workspace 设计

### 10.1 原则

- 每位候选人一个独立 workspace
- 同一候选人再次进入时复用已有 session
- 不要每次打开都创建新 session

### 10.2 需要保存的映射

- `candidateId`
- `opencodeSessionId`
- `workspaceStatus`
- `lastAccessedAt`
- `createdAt`

### 10.3 创建时机

- 第一次进入候选人 AI 工作台
- 若历史 session 丢失或不可恢复，则重建

## 11. session 上下文注入

创建 workspace 时，本地服务应将候选人关键上下文注入 OpenCode：

- 候选人基本信息
- 岗位与年限
- 简历提取文本摘要
- 结构化技能标签
- 过往面试记录摘要
- 已有 AI 产物摘要

目标：保证每个 workspace 具备独立上下文闭环。

## 12. 安全约束

- 只监听 `127.0.0.1`
- 不暴露公司 token 到 OpenCode 页面
- 候选人原始数据由 Bun 服务侧控制注入，不直接开放数据库访问

## 13. 前端接入模式

主界面打开候选人工作台时：

1. 调用本地 API 请求 workspace。
2. 本地服务创建或恢复 session。
3. 返回 LUI URL。
4. Tauri 打开内部 WebView 或切换到内部页面。

## 14. 日志与观测

建议记录：

- OpenCode 启动耗时
- 健康检查失败次数
- session 创建失败次数
- 候选人 workspace 复用率
- 子进程异常退出日志

## 15. 风险与应对

### 15.1 风险

- 子进程异常退出
- 端口冲突
- 资源路径在不同平台不一致
- OpenCode 升级后 session 接口变化

### 15.2 应对

- 做版本检查
- 做端口回退
- 将资源路径抽象成统一 resolver
- 在本地服务层封装 OpenCode API，不让前端直连底层细节

## 16. 结论

本项目的 OpenCode 集成方式应当是“客户端内置服务”，不是“外部依赖”。

这条路线最符合以下目标：

- 用户使用成本最低
- 版本控制最稳
- 与本地候选人 workspace 模型最匹配
- 与 `Tauri + Bun.serve + bun:sqlite + Drizzle` 架构天然兼容
