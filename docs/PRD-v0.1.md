# 面试管理工具 PRD v0.1

- 状态: Draft
- 更新时间: 2026-03-22
- 产品范围: 本地优先的内部面试管理客户端

## 1. 产品定义

### 1.1 产品定位

这是一个部署为桌面客户端的公司内部面试管理工具。

产品核心不是单纯的聊天工具，而是一个完整的候选人工作台：

1. 从公司内部系统登录并拉取面试数据。
2. 管理远程候选人和纯本地候选人。
3. 导入、解析、筛选简历。
4. 进入每位候选人的 AI 面试工作台。
5. 共享完整候选人档案给局域网内其他面试官。

### 1.2 目标用户

- 技术面试官
- 招聘负责人
- 招聘协调同学

### 1.3 核心价值

- 统一远程数据、本地导入数据与 AI 产物。
- 为每位候选人建立一个持续的、可回溯的工作空间。
- 让简历导入、初筛、出题、评价、共享形成闭环。
- 保持本地优先，降低对远程系统能力的依赖。

## 2. 已确定的关键决策

### 2.1 技术决策

- 桌面壳: `Tauri`
- 本地服务: `Bun.serve`
- 本地数据库: `bun:sqlite`
- ORM: `Drizzle ORM`
- AI/LUI 引擎: 内置 `opencode-ai`
- AI 页面形态: 客户端内部启动 OpenCode Web 服务，并在客户端内打开页面

### 2.2 产品决策

- 公司内部系统通过网页登录，获取长期有效但会过期的 token。
- token 过期后必须提示，并支持用户点击重新验证，形成闭环。
- 客户端内部同时存在服务端和网页部分。
- 每位候选人对应一个独立的 OpenCode workspace/session。
- 共享单位是完整候选人档案，并附带面试记录与 AI 产物。
- 允许纯本地候选人存在，不要求必须绑定远程面试记录。
- AI 产物不支持直接手工改正文，用户通过反馈驱动 agent 生成新版本。

## 3. 整体架构

### 3.1 逻辑架构

```text
┌────────────────────────────────────────────────────────────┐
│                        Tauri Client                         │
│                                                            │
│  ┌─────────────────────────┐   ┌─────────────────────────┐ │
│  │ Main Web UI             │   │ Candidate LUI          │ │
│  │ 主列表/导入/共享/设置    │   │ OpenCode Web UI        │ │
│  │ 由本地 Bun 服务提供      │   │ 由内置 opencode-ai 提供 │ │
│  └──────────────┬──────────┘   └──────────────┬──────────┘ │
│                 │                             │            │
│  ┌──────────────┴─────────────────────────────┴──────────┐ │
│  │                  Local Bun Service                    │ │
│  │                                                       │ │
│  │  Bun.serve + Drizzle + bun:sqlite                    │ │
│  │                                                       │ │
│  │  - 认证与 token 生命周期管理                           │ │
│  │  - 远程系统适配层                                      │ │
│  │  - 导入/解压/OCR/解析/筛选任务队列                     │ │
│  │  - 搜索、筛选、共享、通知                              │ │
│  │  - 启动/管理 opencode-ai 子进程                        │ │
│  └─────────────────────┬─────────────────────────────────┘ │
│                        │                                   │
│  ┌─────────────────────┴─────────────────────────────────┐ │
│  │                    Local Storage                      │ │
│  │  - bun:sqlite 数据库                                  │ │
│  │  - 本地文件目录（简历/产物/导出包/缓存）                │ │
│  │  - OS Keyring（token）                                │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                 │                    │                    │
                 ▼                    ▼                    ▼
          公司内部系统接口         本地文件导入          局域网其他客户端
```

### 3.2 运行方式

- `Bun.serve` 提供本地业务 API 与主界面静态资源。
- `opencode-ai` 被封装进客户端资源，由本地 Bun 服务在内部启动。
- OpenCode 作为客户端内部二级服务运行，不依赖用户全局安装。
- 主界面与 LUI 页面可分别使用独立 WebView 或同一客户端内路由切换。

## 4. 核心业务流程

### 4.1 登录与 token 闭环

```text
用户点击登录
→ 客户端打开公司网页登录页
→ 用户完成登录
→ 客户端接收 token
→ 保存 token 到 OS Keyring
→ 拉取用户信息
→ 进入主界面
```

#### token 过期流程

```text
任意远程接口返回鉴权失败
→ 本地服务标记 token_status = expired
→ UI 顶部提示重新验证
→ 用户点击“重新登录”
→ 再次打开登录页并完成认证
→ 登录成功后自动恢复同步与当前工作流
```

### 4.2 远程数据同步流程

```text
本地启动后
→ 获取当前用户信息
→ 获取面试列表
→ 获取候选人详情摘要
→ 获取可下载简历或评价信息
→ 合并到本地数据库
```

### 4.3 简历导入流程

```text
用户导入 zip/pdf/图片
→ 创建导入批次任务
→ ZIP 解压与文件过滤
→ PDF 文本提取 / 图片 OCR
→ 简历结构化解析
→ 匹配已有候选人或创建新候选人
→ 写入搜索索引
→ 可选进入 AI 初筛队列
```

### 4.4 AI 工作台流程

```text
点击候选人
→ 本地服务检查该候选人的 workspace 是否存在
→ 不存在则创建新的 OpenCode session
→ 存在则复用旧 session
→ 打开候选人专属 LUI 页面
→ 用户让 agent 生成初筛文档/题目/评价
→ 产物写回本地数据库与文件系统
→ 用户通过反馈驱动新版本生成
```

### 4.5 共享流程

```text
点击共享
→ 选择在线设备或导出为 .imr
→ 打包候选人档案
→ 在线发送或离线导出
→ 接收方导入并校验
→ 提示合并/覆盖/新建
→ 完成入库与通知
```

## 5. 核心页面

### 5.1 主列表页

#### 顶部区域

- 搜索框
- 批量筛选按钮
- 同步按钮
- 通知信号灯

#### 列表字段

- 时间
- 姓名
- 面试轮次
- 岗位
- 年限
- 会议链接
- 来源（远程 / 本地 / 混合）
- 状态

#### 单列操作

- 导出
- 面试出题
- 共享

### 5.2 导入任务页

- 显示批次任务与文件级子任务
- 展示阶段、进度、成功数、失败数
- 支持取消、重试失败项、查看明细

### 5.3 共享弹窗

- 最近联系人置顶
- 当前发现的局域网设备
- 在线发送
- 导出 `.imr`
- 导入 `.imr`

### 5.4 候选人详情页 / AI 工作台

- 左侧或顶部展示候选人概要
- 中部为聊天区
- 侧边为 AI 产物区
- 支持查看、下载、反馈优化
- 每位候选人一个独立 workspace

## 6. 数据模型

### 6.1 User

- `id`
- `name`
- `email`
- `tokenStatus`: `valid | expired | unauthenticated`
- `lastSyncAt`
- `settingsJson`

### 6.2 Candidate

- `id`：本地主键，使用 UUID
- `source`：`remote | local | hybrid`
- `remoteId`
- `name`
- `phone`
- `email`
- `position`
- `yearsOfExperience`
- `tagsJson`
- `createdAt`
- `updatedAt`

说明：手机号和邮箱是候选人归并索引，不直接作为数据库主键。

### 6.3 Resume

- `id`
- `candidateId`
- `fileName`
- `fileType`
- `fileSize`
- `filePath`
- `extractedText`
- `parsedDataJson`
- `ocrConfidence`
- `createdAt`

### 6.4 Interview

- `id`
- `candidateId`
- `remoteId`
- `round`
- `status`
- `scheduledAt`
- `meetingLink`
- `interviewerIdsJson`
- `manualEvaluationJson`
- `createdAt`
- `updatedAt`

### 6.5 Artifact

- `id`
- `candidateId`
- `interviewId`（可空）
- `type`: `screening | questions | evaluation | summary`
- `roundNumber`（可空）
- `currentVersion`
- `createdAt`
- `updatedAt`

### 6.6 ArtifactVersion

- `id`
- `artifactId`
- `version`
- `promptSnapshot`
- `feedbackText`
- `structuredDataJson`
- `markdownPath`
- `pdfPath`
- `createdAt`

说明：正文不直接手工编辑，只通过反馈产生新版本。

### 6.7 CandidateWorkspace

- `id`
- `candidateId`
- `opencodeSessionId`
- `workspaceStatus`
- `lastAccessedAt`
- `createdAt`

### 6.8 ImportBatch / ImportFileTask

- 批次负责一次导入动作。
- 文件任务负责单文件状态。
- 支持 `queued / running / success / failed / cancelled / partial_success`。

### 6.9 ShareRecord

- `id`
- `type`: `send | receive`
- `candidateId`
- `targetDeviceJson`
- `exportFilePath`
- `status`
- `resultJson`
- `createdAt`
- `completedAt`

## 7. 功能清单

### 7.1 P0

- 登录与 token 管理
- 用户信息获取
- 远程面试列表同步
- 主列表展示与搜索
- 本地候选人创建
- 简历导入与解析
- 候选人 AI 工作台
- 产物下载与版本化反馈

### 7.2 P1

- 自动轮询同步
- 局域网在线共享
- `.imr` 导出导入
- 通知信号灯
- 批量筛选

### 7.3 P2

- 更细粒度权限
- 数据脱敏导出
- 多设备备份/恢复
- 更复杂的规则配置

## 8. 非功能要求

### 8.1 安全

- token 只进 OS Keyring，不落明文。
- OpenCode 服务只监听 `127.0.0.1`。
- 本地共享需要校验来源与完整性。
- 导出包支持校验与后续可扩展加密。

### 8.2 性能

- 搜索响应目标 `< 500ms`。
- 主列表支持 1000 条以上候选人浏览。
- 导入处理使用队列并发，不阻塞 UI。
- OpenCode 服务按需启动，避免无用常驻开销。

### 8.3 可恢复性

- 应用重启后恢复 token 状态、最近页面、任务记录。
- 未完成导入任务支持用户手动恢复。
- OpenCode 子进程异常退出可自动重启。

## 9. 验收标准

### 9.1 登录

- 能成功打开网页登录并获取 token。
- token 过期时有明确提示。
- 重新验证后不丢失当前候选人上下文。

### 9.2 列表

- 能同时显示远程候选人与本地候选人。
- 支持姓名、岗位、技能、全文模糊搜索。
- 支持面试轮次、年限、来源等筛选。

### 9.3 导入

- 支持 `zip/pdf/png/jpg/jpeg/webp`。
- ZIP 文件可以正确解压和过滤。
- OCR/解析失败不拖垮整个批次。

### 9.4 AI 工作台

- 每位候选人都有独立 workspace。
- 再次进入同一候选人复用原 workspace。
- 反馈可生成新版本产物。

### 9.5 共享

- 可导出完整 `.imr` 档案包。
- 可在线发送给局域网设备。
- 接收方可完成冲突判断与导入。

## 10. 版本规划

### MVP

- 登录闭环
- 主列表
- 手动同步
- 本地候选人
- 简历导入
- 候选人工作台

### V1.0

- `.imr` 规范落地
- 在线共享
- 自动轮询
- 通知信号灯
- 反馈驱动的产物版本化

### V1.5

- 更细粒度共享与审计
- 更强大的任务恢复能力
- 更完善的本地数据治理

## 11. 配套文档

- `IMR-Spec-v0.1.md`
- `Import-Pipeline-Spec-v0.1.md`
- `Local-API-Spec-v0.1.md`
- `Embedded-OpenCode-Service-Spec-v0.1.md`
