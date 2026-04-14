---
name: interview-orchestrator
version: 3.8.0
description: >
  主流程 Skill。负责阶段识别、子 Skill 调度、后台任务编排、通过 interview-records 统一落盘与 meta.json 状态推进。
必须遵循 .opencode/agents/interview-manager.md。
---

# Interview Workflow（主调度）

## 目标

把用户输入路由到以下链路：

1. **初筛阶段（S0）** → 产出 `00_筛选报告.md`
2. **出题阶段（S1）** → 产出 `01_面试题_第{round}轮.md`
3. **评估阶段（S2）** → 产出 `02_面试评分报告.md`

## 最小链路（强制）

默认只走以下主链，不允许额外分叉：

1. `interview-orchestrator`（唯一入口）
2. `interview-screening`（初筛阶段（S0）业务）
3. `interview-questioning`（出题阶段（S1）业务）
4. `interview-assessment`（评估阶段（S2）业务）

辅助技能仅作为 workflow 的内部步骤调用：

- `interview-records`：统一文档落盘与 `meta.json` 更新
- `interview-policy`：轮次判断与阶段决策选项
- `interview-memory`：阶段完成后的经验沉淀

`interview-batch-legacy` 已进入弃用迁移，仅兼容历史批量入口；新批量流程不再由 skill 编排。

## 批量初筛 command 模式（强制）

当输入中出现“批量筛选/多个 PDF/ZIP 简历包”时，必须走 command 模式：

1. 调用 `interview_batchScreenResumes`，传入 `inputPaths` 与 `maxConcurrency`。
2. 由工具统一完成：多源文件发现（pdf/目录/zip）、本地 ZIP 解压、并发解析质量分析、汇总表写入。
3. 该 command 为独立行为，禁止在批量流程中调用任何 skill（含 `interview-screening`、`interview-batch-legacy`、`interview-orchestrator` 子链）。
4. 产出批量汇总表后直接返回通过/待定/淘汰分组视图。
5. command 返回后必须硬短路：禁止进入任何候选人级阶段写入（`00_筛选报告.md`/`01_面试题_第{round}轮.md`/`02_面试评分报告.md`）与 `meta.json` 变更。

## 调度模型

### 主代理职责

- 作为唯一对外入口，拒绝并纠正旁路调用
- 判断当前阶段（基于用户意图 + `meta.json`）
- 调用对应业务 Skill
- 调用 `interview-records` 统一落盘
- 通过 `interview-records` 触发 `meta.json` 更新并返回下一步选项
- 禁止直接使用 `write/edit/bash` 进行阶段文档落盘（必须经过 `interview-records`）
- 首次请求采用“一次性收集输入包”策略，默认自动决策阶段；但出题阶段（S1）轮次必须选项确认

### 子代理/后台代理职责

- 批量简历时，统一使用 `interview_batchScreenResumes` 独立 command；不触发任何 skill 链
- 单候选人默认同步链路，避免状态冲突

## 阶段执行

### 初筛阶段（S0）

输入来源（按优先级）：

1. 用户提供 `resume.pdf`
2. 用户提供简历文案

执行：

1. 调用 `interview-screening` 得到评分与风险
2. 调用 `interview-policy` 生成筛选决策选项
3. 调用 `interview-records.write_stage_document(stage=S0)` 落盘
4. 由 `interview-records` 更新 `meta.json.documents.S0 = "00_筛选报告.md"`

### 出题阶段（S1）

输入来源（按优先级）：

1. `00_筛选报告.md`
2. 上一轮评价（`*.md` 或粘贴文本）
3. `resume.pdf`
4. 用户直接给的岗位文案/JD

执行：

1. 从用户输入中解析候选轮次；然后调用 `interview-policy` 输出 1-4 选项并强制确认
2. 轮次合法范围固定为 1-4；空输入默认回落到1
3. 若输入是“上一轮评价”且识别到轮次 N，默认生成第 N+1 轮
4. 先检查本地 `01_面试题_第{N}轮.md` 是否已存在，存在则直接复用并短路后续生成
5. 仅在目标轮次题目不存在时调用 `interview-questioning`
6. 调用 `interview-records.write_stage_document(stage=S1, round=N)` 落盘
7. 由 `interview-records` 更新 `meta.json.documents.S1.latest_round` 与 `meta.json.documents.S1.round_files`

### 评估阶段（S2）

输入来源（按优先级）：

1. `01_面试题_第{round}轮.md`（若指定轮次）
2. `meta.json.documents.S1.latest_file`（未指定轮次）
3. 用户直接提供的面试题

额外必需输入：

- 面试会议纪要（文本或文件）

可选输入：

- 标准答案（若存在必须参与比对）

执行：

1. 只要输入中存在 `interview_notes`，必须在当前轮直接产出并落盘完整 `02_面试评分报告.md`（禁止仅口头结论或继续追问后再出报告）
2. 调用 `interview-assessment` 生成系统结论（状态=`draft`）
3. 评分证据仅允许来自候选人回答；面试官提问/提示/评价仅作上下文，不得作为加减分依据
4. 调用 `interview-policy` 生成评估阶段（S2）后续决策选项（通过/待定/淘汰）
5. 若一次性输入包中含面试官反馈，进入 `collect_feedback` 并执行差异分析
6. 若未提供面试官反馈，写入 `interviewer_feedback_status=pending`
7. 若本轮结论为不推荐终态（`grade=B|C`，其中 `B=非必要不推荐`、`C=淘汰`，或 `interview_evaluation` 含“淘汰/不合格”），必须停留在 `collect_feedback`，等待面试官意见后才允许 `finalize`
8. 非淘汰场景在反馈缺失时可先 `finalize`（不追加追问）
9. 调用 `interview-records.write_stage_document(stage=S2)` 落盘
10. 由 `interview-records` 更新 `meta.json.documents.S2 = "02_面试评分报告.md"` 与 `meta.json.s2_feedback_loop` 状态
11. 调用 `interview-memory` 进行学习记忆沉淀（优秀题、风格、淘汰模式、负反馈修正、反馈差异学习/待反馈占位）

## 标准调用片段

```text
skill({ name: "interview-screening", user_message: "..." })
skill({ name: "interview-questioning", user_message: "..." })
skill({ name: "interview-assessment", user_message: "..." })
skill({ name: "interview-records", user_message: "write_stage_document ..." })
```

## 失败与回退

1. 上一阶段主文档缺失：允许降级到用户输入，但在输出中标注缺失影响。
2. 必需输入缺失（如 S2 无纪要）：停止打分并返回补充清单。
3. 命名冲突：S1 统一覆盖到 `01_面试题_第{round}轮.md`。
4. 批量命令后若检测到任何 skill 链调用或手工文件写入尝试（`write/edit/bash`），必须立即失败并返回“批量 command 独立行为被破坏”错误。

## 强约束闸门（Fail-Fast）

在执行任何阶段前，必须先通过以下闸门；任一失败则立即停止并返回缺失项：

1. **输入闸门**：按契约优先级检查是否具备最小必需输入。
2. **轮次闸门**：S1 轮次必须是 `1-4`；无法确定时先询问后执行。
3. **命名闸门**：输出文件名必须匹配阶段模板，禁止写入自定义主文档名。
4. **状态闸门**：落盘后必须由 `interview-records` 更新 `meta.json`。
5. **决策闸门**：S0/S2 完成后必须附带下一步决策选项，禁止“只给结论”。
6. **反馈闸门**：S2 必须写入反馈状态；`B/C` 不推荐、淘汰/不合格场景必须先收集面试官反馈后才能闭环，非淘汰场景可标记 `pending` 完成。
7. **职责闸门**：若检测到 orchestrator 直接写文件（未经过 `interview-records`），必须立即失败并返回修复提示。
8. **批量短路闸门**：当批量路径命中 `interview_batchScreenResumes` 时，后续执行图必须终止于汇总返回；若出现任何 skill 调用或候选人阶段落盘动作，必须 fail-fast。
9. **证据口径闸门**：S2 若将面试官发言作为评分证据，必须 fail-fast 并重算。
10. **纪要触发闸门**：S2 只要输入含 `interview_notes`，必须立即产出完整评分报告并落盘。

## 完成定义

- 文档已按契约文件名落盘
- `meta.json` 已更新阶段与文档映射
- 返回下一步决策选项（继续/淘汰/待定）
