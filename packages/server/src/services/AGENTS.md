# @ims/server — Services Layer

**Scope:** `packages/server/src/services/`

## OVERVIEW

业务逻辑实现层。按功能域划分为多个子服务，处理候选人导入、IMR 文件、LUI 工作流、远程同步等核心业务。所有代码针对 Bun 运行时编写，数据库操作通过 Drizzle ORM。

## STRUCTURE

```
services/
├── import/                  # 简历导入流水线
│   ├── pipeline.ts          # 导入流程编排 (851 行)
│   ├── extractor.ts        # PDF 文本提取
│   ├── parser.ts            # 结构化解析
│   ├── ai-screening.ts      # AI 初筛
│   └── types.ts             # 共享类型定义
├── imr/                     # IMR 包格式处理
│   ├── importer.ts          # 候选人档案导入
│   ├── exporter.ts          # 候选人档案导出
│   └── types.ts             # IMR 格式类型
├── share/                   # 局域网设备发现
│   ├── transfer.ts          # 文件传输
│   └── discovery.ts          # UDP 广播发现
├── lui-tools.ts             # LUI 工具函数 (1035 行) ⚠️ HOTSPOT
├── lui-workflow.ts          # LUI 工作流 (1082 行)
├── lui-workflow-runtime.ts  # 工作流运行时
├── lui-context.ts           # LUI 上下文管理
├── lui-agents.ts            # LUI Agent 定义
├── lui-agent-contract.ts    # Agent 契约
├── deepagents-runtime.ts     # Deep Agent 运行时
├── baobao-client.ts         # 远程 API 客户端
├── baobao-login.ts          # 登录/Token 管理
├── baobao-resume.ts         # 简历同步
├── baobao-http-login.ts     # HTTP 登录
├── sync-manager.ts          # 数据同步管理 (250 行)
├── sync-reset.ts            # 同步重置
├── message.ts               # 消息服务 (588 行)
├── document-templates.ts    # 文档模板
├── workflow-meta.ts         # 工作流元数据
├── workflow-artifacts.ts    # 工作流产物
├── session-memory.ts        # Session 记忆
├── memory.ts                # 通用记忆
├── file-resource.ts         # 文件资源
├── interview-assessment.ts   # 面试评估
├── workspace-agent-loader.ts # Workspace Agent 加载
├── workspace-agent-yaml.ts  # Workspace Agent YAML
├── agent-tools.ts           # Agent 工具
└── email.ts                 # 邮件服务
```

## SERVICES LIST

### Core Workflow Services

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| **LUI Tools** | `lui-tools.ts` | 1035 | AI 模型调用封装、工具注册表、流式响应处理 |
| **LUI Workflow** | `lui-workflow.ts` | 1082 | Agent 编排、S0/S1/S2 多阶段面试流程 |
| **LUI Context** | `lui-context.ts` | - | 候选人上下文构建 |
| **Deep Agents Runtime** | `deepagents-runtime.ts` | 409 | Deep Agent 执行引擎 |

### Import Pipeline

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| **Import Pipeline** | `import/pipeline.ts` | 851 | 批量导入流程编排 |
| **Extractor** | `import/extractor.ts` | - | PDF 文本提取 |
| **Parser** | `import/parser.ts` | - | 简历结构化解析 |
| **AI Screening** | `import/ai-screening.ts` | - | AI 初筛评估 |

### IMR Package Handling

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| **IMR Importer** | `imr/importer.ts` | 210 | 候选人档案包导入 |
| **IMR Exporter** | `imr/exporter.ts` | - | 候选人档案包导出 |

### Sync Services

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| **Sync Manager** | `sync-manager.ts` | 250 | 远程数据同步轮询 |
| **Sync Reset** | `sync-reset.ts` | - | 同步状态重置 |

### Remote API Integration

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| **Baobao Client** | `baobao-client.ts` | - | 公司内部系统 API 调用 |
| **Baobao Login** | `baobao-login.ts` | - | 登录/Token 管理 |
| **Baobao Resume** | `baobao-resume.ts` | - | 简历同步 |
| **HTTP Login** | `baobao-http-login.ts` | - | HTTP 登录方式 |

### Supporting Services

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| **Message** | `message.ts` | 588 | 消息管理 |
| **Document Templates** | `document-templates.ts` | - | 文档模板生成 |
| **Workflow Meta** | `workflow-meta.ts` | - | 工作流元数据同步 |
| **Workflow Artifacts** | `workflow-artifacts.ts` | - | 工作流产物管理 |

---

## LUI-TOOLS (1035 行) — HOTSPOT

### 职责

AI 模型调用封装，工具注册表，流式响应处理，错误处理和重试。是 LLM Agent 的核心工具层。

### 核心工具定义

| Tool Name | Description |
|-----------|-------------|
| `generate_wechat_summary` | 生成面试评估的微信 copy 文本 |
| `interview_buildWechatCopyText` | generate_wechat_summary 的 OpenCode 兼容别名 |
| `interview_resolveRound` | 解析面试轮次（支持第 X 轮、Round X、R X 格式） |
| `scan_resume` | 扫描 PDF，返回提取文本和质量评估 |
| `sanitize_interview_notes` | 清理面试笔记中的注入/噪声标记 |
| `screen_resumes` | 批量筛选：接受 PDF/ZIP，提取并发生成汇总表 |

### 关键函数

```typescript
// 工具执行入口
executeTool(toolName: string, args: Record<string, unknown>, context: ToolContext): Promise<string>

// 数据库感知工具
getCandidateDetails(candidateId: string)           // 获取候选人详情
getCandidateResumeText(candidateId: string)        // 获取简历文本
getCandidateInterviews(candidateId: string)         // 获取面试历史
updateWorkflowDocument(workflowId, stage, doc)     // 更新工作流文档

// PDF 处理
executeScanPdf(args, context)                      // 单个 PDF 扫描
executeBatchScreenResumes(args, context)           // 批量筛选

// 内容处理
executeBuildWechatCopyText(args)                   // 微信 copy 生成
executeSanitizeInterviewNotes(args)                 // 笔记清理
```

### ToolContext 接口

```typescript
interface ToolContext {
  directory: string;        // 工作目录
  candidateId?: string;     // 可选候选人 ID
  workflowId?: string;       // 可选工作流 ID
}
```

### 质量评估逻辑

`executeScanPdf` 和 `executeBatchScreenResumes` 包含内置质量评估：

- **pass**: wordCount >= 200, printableRatio >= 0.5
- **warning**: 50 <= wordCount < 200
- **fail**: wordCount < 50 或 printableRatio < 0.5

---

## LUI-WORKFLOW (1082 行)

### 职责

多阶段面试工作流编排。管理 S0（初筛）、S1（面试）、S2（评估）阶段的转换和状态。

### 工作流阶段

```typescript
type WorkflowStage = "S0" | "S1" | "S2" | "completed";
type WorkflowStatus = "active" | "paused" | "completed" | "error";
```

### 核心类型

```typescript
interface WorkflowState {
  id: string;
  candidateId: string;
  conversationId: string | null;
  currentStage: WorkflowStage;
  stageData: Record<string, unknown>;
  documents: WorkflowDocuments;
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkflowDocuments {
  S0?: StageDocument;
  S1?: StageDocument & { roundFiles?: Record<number, string>; latestRound?: number };
  S2?: StageDocument;
}
```

### 环境变量

```typescript
CUSTOM_BASE_URL           // OpenAI 兼容 API 基础 URL
CUSTOM_API_KEY            // API 密钥
VERCEL_AI_GATEWAY_TOKEN   // Vercel AI Gateway Token
```

---

## IMPORT PIPELINE

### 职责

处理简历批量导入，支持 PDF 与 ZIP 压缩包（内含 PDF）。

### 流程阶段

```
queued → extracting → text_extracting → ocr_running → parsing → matching_candidate → saving → ai_screening → done/failed
```

### 核心函数

```typescript
prepareImportTasks(batchId, paths)     // 准备导入任务
processFile(taskId, filePath, typeHint) // 处理单个文件
refreshBatchProgress(batchId)           // 刷新批次进度
```

### 文件大小限制

```typescript
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  // 50MB
```

### 文件类型支持

PDF、ZIP（自动解压扫描）

---

## IMR (Interview Manager Record)

### 职责

候选人档案的打包和解包，用于候选人数据的导入导出交换。

### IMR 包结构

```
*.imr (ZIP)
├── manifest.json          # 包元数据
├── candidate.json         # 候选人基础信息
├── resumes/               # 简历文件
├── interviews/            # 面试记录 JSON
└── artifacts/             # 产物文件
```

### 核心函数

```typescript
importIpmr(filePath)       // 导入 IMR 包
exportIpmr(candidateId)    // 导出 IMR 包
```

### 冲突处理

导入时检测冲突（按手机号/邮箱匹配），返回 `ConflictInfo` 供用户决定是新建还是合并。

---

## SYNC

### 职责

与远程 Baobao 系统定期同步候选人、面试数据。

### SyncManager 类

```typescript
class SyncManager {
  start(intervalMs = 5000)           // 启动轮询
  stop()                            // 停止轮询
  runOnce()                         // 立即执行一次同步
  status()                          // 获取状态
}
```

### 错误处理策略

- 连续错误达到 `MAX_CONSECUTIVE_ERRORS = 3` 时暂停轮询
- 每次同步记录耗时和结果

---

## ANTI-PATTERNS

### Silent Failure (13+ 空 catch 块)

`services/` 目录存在多处 `.catch(() => {})` 和 `catch {}` 静默失败：

```typescript
// sync-manager.ts:61
private async tick() {
  if (!this.enabled) return;
  try { await this.runOnce(); } catch {}
}

// lui-tools.ts:968
try {
  const eval_ = JSON.parse(row.manualEvaluationJson);
  if (eval_.comments) feedback = ...;
} catch {
  // ignore parse errors
}
```

**风险**：错误被吞掉，调用方无法感知失败。

### console.* 非结构化日志 (17 处)

```typescript
console.log(`[sync] polling started, interval=${intervalMs}ms`);
console.error(`[sync] error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${msg}`);
```

**建议**：替换为结构化日志库（如 pino）。

### Magic Numbers

| Location | Value | 说明 |
|----------|-------|------|
| `import/pipeline.ts:15` | `50 * 1024 * 1024` | MAX_FILE_SIZE_BYTES |
| `sync-manager.ts:6` | `3` | MAX_CONSECUTIVE_ERRORS |
| `sync-manager.ts:10` | `5000` | 默认轮询间隔 |
| `message.ts:55` | `2 * 60 * 1000` | STALE_STREAMING_MESSAGE_MS |
| `lui-tools.ts:640` | `Math.max(1, Math.min(32, ...))` | maxConcurrency 限制 |

### 巨大单体文件

- `lui-workflow.ts` — 1082 行
- `lui-tools.ts` — 1035 行
- `import/pipeline.ts` — 851 行
- `message.ts` — 588 行

**建议**：按功能拆分为更小的模块。

---

## RELATED SPECS

| Spec | 说明 |
|------|------|
| `specs/lui-ai-gateway/` | LUI AI Gateway（Vercel AI SDK 集成） |
| `specs/import-pipeline/` | 导入流水线规范 |
| `specs/imr-format/` | IMR 包格式规范 |
| `specs/embedded-opencode-service/` | 内置 OpenCode 服务设计 |
| `specs/local-ai-workbench/` | 本地 AI 工作台 |

---

## DEPENDENCIES

| 包 | 用途 |
|----|------|
| `ai` | Vercel AI SDK（流式文本、工具调用） |
| `@ai-sdk/openai` | OpenAI 兼容模型 |
| `@deepagents/agent` | Deep Agent 运行时 |
| `drizzle-orm` + `bun:sqlite` | 数据库 |
| `jszip` | ZIP 压缩包处理 |
| `unpdf` | PDF 文本提取 |
| `xlsx` | Excel 文件处理 |
| `nodemailer` | 邮件发送 |
