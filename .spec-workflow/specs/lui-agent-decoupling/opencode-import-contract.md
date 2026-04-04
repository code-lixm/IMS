# OpenCode Asset Import Contract

## 1. Overview

本文档定义 `.opencode` 资产如何迁入 IMS 的规则与边界。

**核心原则**：`.opencode` 资产（prompts、rules、tools、memory、templates）是 interview 场景的内容来源，迁入 IMS 后以内部资产模型管理。**严禁**将 `.opencode` 运行时、plugin 协议或 session 管理行为嵌入 IMS。

## 2. Asset Inventory

以下为 `.opencode` 中与 interview 相关的核心资产：

| Asset Path | 类型 | 说明 |
|------------|------|------|
| `agents/interview-manager.md` | Prompt/Rule | Interview Agent 总控契约 |
| `skills/interview-orchestrator.md` | Rule | S0 调度规则 |
| `skills/interview-screening.md` | Rule | S1 初筛规则 |
| `skills/interview-questioning.md` | Rule | S2 追问规则 |
| `skills/interview-assessment.md` | Rule | S3 评估规则 |
| `skills/interview-records.md` | Rule | 记录规则 |
| `skills/interview-memory.md` | Rule | 记忆/学习规则 |
| `skills/interview-policy.md` | Rule | 策略规则 |
| `tools/interview.js` | Tool | 工具实现 |
| `memory/interview-learning.md` | Memory | 学习记忆模板 |
| `templates/scoring*.md` | Template | 评分模板 |
| `scripts/parse-*.js` | Script | 解析脚本 |

## 3. Internal Asset Model

导入后的资产以 `ImportedInterviewPack` 模型存储：

```typescript
interface ImportedInterviewPack {
  packId: string;              // 唯一标识
  assetVersion: string;        // 语义化版本
  provenance: ProvenanceInfo;  // 来源追踪
  assets: InterviewAsset[];
}

interface ProvenanceInfo {
  source: 'opencode';
  sourcePath: string;          // 原始 .opencode 路径
  importedAt: string;          // ISO 时间戳
  importedBy: 'import-pipeline'; // 固定值
}

interface InterviewAsset {
  assetId: string;
  type: 'prompt' | 'rule' | 'tool' | 'memory' | 'template' | 'script';
  name: string;
  content: string;             // 已转换内容（非 OpenCode 格式）
  adaptedFrom: string;         // 原始资产路径
  isEngineSpecific: boolean;   // 是否仅适用于特定 engine
  targetEngine?: 'builtin' | 'deepagents';
}
```

## 4. Mapping Matrix

| 原始资产 | 分类 | 目标归宿 | 说明 |
|---------|------|---------|------|
| `agents/interview-manager.md` | prompt/rule | **rewrite** | 作为 interview stage prompt 的参考，需适配 IMS prompt 格式 |
| `skills/interview-orchestrator.md` | rule | **rewrite** | 调度逻辑需转化为 workflow stage 配置 |
| `skills/interview-screening.md` | rule | **rewrite** | S1 规则转为 stage prompt 片段 |
| `skills/interview-questioning.md` | rule | **rewrite** | S2 追问规则转为 prompt 逻辑 |
| `skills/interview-assessment.md` | rule | **rewrite** | S3 评估规则转为评分模板 |
| `skills/interview-records.md` | rule | **rewrite** | 记录格式适配 |
| `skills/interview-memory.md` | rule | **rewrite** | 记忆结构转为 IMS memory schema |
| `skills/interview-policy.md` | rule | **unsupported/deprecated** | OpenCode policy 语法 IMS 不兼容，废弃 |
| `tools/interview.js` | tool | **rewrite** | 工具语义保留，实现需重写 |
| `memory/interview-learning.md` | memory | **direct-reuse** | 内容模板直接复用，仅替换变量插值语法 |
| `templates/scoring*.md` | template | **direct-reuse** | 评分维度和权重直接复用 |
| `scripts/parse-*.js` | script | **unsupported/deprecated** | 解析脚本属于 OpenCode 运行时工具链，不导入 |

**分类标准**：
- **direct-reuse**：内容可直接复用，仅需变量替换或格式微调
- **rewrite**：语义参考，但需按 IMS 模型和接口重写
- **unsupported/deprecated**：OpenCode 运行时特有，IMS 不支持

## 5. Import Pipeline

```
.opencode/assets
    │
    ▼
[Parser] 识别资产类型
    │
    ├── prompt/rule → [PromptAdapter] 转换为 IMS prompt schema
    ├── tool       → [ToolAdapter] 转换为 IMS tool interface
    ├── memory     → [MemoryAdapter] 转换为 IMS memory schema
    └── template  → [TemplateAdapter] 保留结构，替换插值语法
    │
    ▼
[AssetRegistry] 校验并注册
    │
    ├── 写入 packages/shared/src/assets/interview/
    └── 写入 runtime/assets/index.json (资产清单)
```

**关键约束**：
- 导入过程**不执行**任何 `.opencode` 代码
- OpenCode frontmatter (`---`) 替换为 IMS 的 `assetId/provenance` 头
- `meta.json` 的版本信息映射到 `assetVersion` 字段
- 解析脚本不导入，解析逻辑在 IMS 端重新实现

## 6. Provenance & Versioning

**Provenance 策略**：

每个导入资产必须携带 provenance 信息：
```typescript
{
  provenance: {
    source: 'opencode',
    sourcePath: 'skills/interview-screening.md',
    importedAt: '2026-04-05T00:00:00Z',
    importedBy: 'import-pipeline',
    originalVersion: '1.0.0'  // 若原始文件有版本
  }
}
```

**版本策略**：
- 原始 `.opencode` 资产版本由文件内容 hash 或 `meta.json` 决定
- IMS 内部 `assetVersion` 遵循语义化版本
- `assetVersion` 变更需记录变更日志，不自动同步原始版本
- **不支持**原始版本与 IMS 版本自动对齐

## 7. Unsupported Runtime Assumptions

以下 OpenCode 运行时假设**明确不被支持**，任何导入实现必须移除或替换这些依赖：

| OpenCode 运行时假设 | IMS 处理方式 |
|-------------------|-------------|
| `skill()` 动态技能加载 | 不支持，skill 逻辑转为静态 prompt 片段 |
| `context.ask()` 阻塞式提问 | 不支持，替换为 IMS message exchange 模式 |
| frontmatter 元数据语法 | 转换为 IMS provenance 头，不保留 frontmatter |
| `meta.json` 文件版本 | 映射到 `assetVersion`，不读取文件 |
| plugin 协议 | 不导入，plugin 作为独立扩展点 |
| session 管理 | 不导入，session 由 IMS conversation 替代 |
| workspace 虚拟文件系统 | 不导入，IMS 直接操作 SQLite |
| OpenCode 内置 tool 协议 | 重写为 IMS tool interface |

**明确禁止**：
- 将 `.opencode` 运行时嵌入 IMS
- 将 OpenCode session/plugin 概念映射为 IMS 核心抽象
- 在 IMS 代码中调用 `skill()` 或类似动态加载机制

## 8. Validation Rules

**导入前校验**：
1. 资产内容非空且格式可解析
2. 不包含 OpenCode 运行时依赖（如 `skill()`、`context.ask()`）
3. `sourcePath` 指向已知存在的 `.opencode` 资产

**导入后校验**：
1. `ImportedInterviewPack` 所有必填字段存在
2. `assetId` 全局唯一
3. `provenance.source` 固定为 `'opencode'`
4. 资产内容中不残留 OpenCode 运行时语法

**不合格资产处理**：
- 校验失败的资产**不写入**资产清单
- 记录 `import-error.log`，标注失败原因和资产路径
- 支持重试，但不支持自动修复后自动导入

## 9. Non-Goals

本文档**不涉及**：

- **运行时实现**：不定义 IMS 如何执行 interview workflow，仅定义资产格式
- **Engine 适配细节**：不指定 `builtin` vs `deepagents` 的 prompt 差异（由 runtime adapter contract 定义）
- **资产更新同步**：不实现 `.opencode` 变更自动同步到 IMS 的机制
- **双向同步**：不支持 IMS 资产反向导出到 `.opencode` 格式
- **Plugin 扩展**：不定义 OpenCode plugin 如何接入 IMS
- **UI 组件映射**：不定义 `.opencode` skill 文件如何映射到 UI 组件
