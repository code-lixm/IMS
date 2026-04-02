# IMS 总体规划 - 详细技术文档索引（修正版 v2）

> **完整规划文档已分解到各 Phase 详细文件**
>
> **总工期**: 约 53 天（各 Phase 可部分并行）
>
> **修正说明**: 
> - Phase 3 改为 DeepAgents（非 LangGraph）
> - Phase 1 前端使用现有工厂模式
> - 删除已确认正常的 Bug 修复任务

---

## 文档清单

| 文档 | Phase | 内容 | 工期 |
|------|-------|------|------|
| [phase-1-detailed.md](./phase-1-detailed.md) | Phase 1 | 消息持久化 + UI Bug 修复 + Agent 简化 | 8 天 |
| [phase-2-detailed.md](./phase-2-detailed.md) | Phase 2 | Agent 文件工具 + 记忆系统 | 12 天 |
| [phase-3-detailed.md](./phase-3-detailed.md) | Phase 3 | DeepAgents 多 Agent 架构重构 | 14 天 |
| [phase-4-detailed.md](./phase-4-detailed.md) | Phase 4 | 邮件发送 + 面试结果填报 | 10 天 |
| [phase-5-6-detailed.md](./phase-5-6-detailed.md) | Phase 5-6 | 键盘监听 + 引导优化 + 修复 | 7 天 |

**总计**: 53 天

---

## 关键修正说明

### 1. 技术选型修正（Phase 3）

| 原规划 | 修正后 | 依据 |
|--------|--------|------|
| LangGraph | **DeepAgents** | `docs/Agent-Extension-Architecture.md` 明确拒绝 LangGraph |

**决策依据**:
- LangGraph 复杂度高，学习曲线陡峭
- DeepAgents 轻量、与现有 Vercel AI SDK 栈兼容
- DeepAgents 内置 Swarm 多 Agent 编排

### 2. 前端架构修正（Phase 1）

| 原规划 | 修正后 | 依据 |
|--------|--------|------|
| `defineStore('message')` + `messageApi` | `createLuiMessageModule` + `luiApi` | `stores/lui/messages.ts:27` |

### 3. 已确认正常的功能

| 功能 | 原规划任务 | 状态 |
|------|------------|------|
| candidate-selector 显示 | 修复 Bug | ✅ 无需修复 |
| reasoning 展开/收起 | 实现 Collapsible | ⚪ 不适用（AI Gateway 不输出 reasoning）|

---

## 与现有系统的对齐说明

### 现有架构（保持不变）

```
现有系统组件                    | 规划使用
-------------------------------|----------
packages/server/src/schema.ts   | 扩展现有表，新增 messages 等
packages/server/src/routes.ts   | 扩展现有路由
apps/web/src/agents/host.ts    | 基于现有 AgentHost 扩展（DeepAgents）
apps/web/src/stores/lui.ts     | 复用现有 lui store + 工厂模式
packages/shared/src/db-schema.ts | 扩展现有类型
```

---

## 依赖关系总图

```
Phase 1 (基础能力) ──────────────────────────────────────────┐
├── 消息持久化 ──┬── Schema 扩展 ─┬── API 扩展 ─┬── Store 扩展 ─┤
└── Bug 修复 ────┴────────────────┴─────────────┴──────────────┤
                                                              ▼
Phase 2 (Agent 增强) ─────────────────────────────────────────┤
├── 文件工具 ────┬── Server 路由 ──┬── 工具定义 ───┬── 组件 ────┤
└── 记忆系统 ────┴── MemoryService ─┴── 注入逻辑 ──┴───────────┤
                                                              ▼
Phase 3 (架构重构) ───────────────────────────────────────────┤
├── Supervisor ──┬── Swarm Agents ──┬── 4 个专业 Agent ────────┤
└── DeepAgents ─┴── 工作流集成 ─────┴── AgentHost 集成 ────────┤
                                                              ▼
Phase 4 (业务功能) ───────────────────────────────────────────┤
├── 邮件系统 ────┬── SMTP 配置 ────┬── 模板 ───┬── 发送 ───────┤
└── 面试评估 ────┴── 评分系统 ─────┴── 报告 ───┴───────────────┤
                                                              ▼
Phase 5-6 (优化) ─────────────────────────────────────────────┤
├── 键盘监听 ────┬── Tauri 窗口 ───┬── 快捷键 ───┬── UI ───────┤
├── 引导页面 ────┴── 端点配置 ─────┴── 登录 ─────┴─────────────┤
└── 问题修复 ────┬── 候选人选择 ───┬── PDF 资源 ───────────────┘
                └─────────────────┴───────────────────────────▶ 完成
```

---

## 实施建议

### 执行顺序

1. **Phase 0**: Schema 对齐评审 (2d)
2. **Phase 1**: 消息持久化 (8d)
3. **Phase 2**: 文件工具 + 记忆系统 (12d)
4. **Phase 3**: DeepAgents 多 Agent (14d)
5. **Phase 4**: 邮件 + 评估 (10d)
6. **Phase 5-6**: 优化 (7d，可与 3-4 并行)

### 里程碑

| 周数 | 里程碑 |
|------|--------|
| Week 2 | Phase 1 完成 |
| Week 5 | Phase 2-3 完成 |
| Week 8 | Phase 4 完成 |
| Week 9 | Phase 5-6 完成 |

---

## 技术栈汇总

| 领域 | 技术/库 | 用途 |
|------|---------|------|
| 状态管理 | Pinia (现有 lui.ts 工厂模式) | 前端状态 + 本地存储 |
| 后端 | Bun + Hono + Drizzle (现有) | API + ORM |
| 数据库 | SQLite (现有) | 持久化存储 |
| AI 框架 | **DeepAgents** + Vercel AI SDK | 多 Agent 工作流 |
| 邮件 | nodemailer | SMTP 发送 |
| 桌面 | Tauri v2 (现有) | 全局快捷键 + 浮动窗口 |
| UI | Vue 3 + shadcn-vue (现有) | 组件库 |

---

**修正版本完成** ✅
