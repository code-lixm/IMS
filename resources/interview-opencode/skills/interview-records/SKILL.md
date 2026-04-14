---
name: interview-records
version: 4.4.0
description: >
  面试流程文件管理技能。负责创建候选人目录、生成阶段文档、更新 meta.json，
并强制执行 .opencode/agents/interview-manager.md 的文件命名、S2反馈闭环状态与 frontmatter 规范。
---

# Interview File Manager

## 职责边界

只做文件系统与文档落盘，不做评分逻辑或出题逻辑。

`meta.json` 的实际写入归属本 Skill（单一写入者），其他 Skill 不直接写文件。
仅允许由 `interview-orchestrator` 调用。

## 统一命名（强制）

- `00_筛选报告.md`
- `01_面试题_第{round}轮.md`
- `02_面试评分报告.md`

## 候选人目录规范

```text
interviews/YYYY-MM-DD/{candidate_folder}/
  resume.pdf
  jd.md
  meta.json
  00_筛选报告.md
  01_面试题_第1轮.md
  01_面试题_第2轮.md
  02_面试评分报告.md
```

## 核心操作

### 1) create_candidate_folder

输入：

- `date`（YYYY-MM-DD）
- `candidate_name`
- `position`

输出：

- `candidate_folder_path`
- `meta.json`（初始化）

强制要求：

- 若仅给 `resume.pdf` 且缺少 JD，也必须创建候选人目录并初始化 `meta.json`，不得阻塞。
- 目录创建失败时必须 fail-fast，返回可执行补充清单（路径权限/命名冲突/缺少候选人标识）。

### 1.1) ensure_candidate_workspace（强制前置）

输入：

- `candidate_folder_path`（可空）
- `candidate_name` / `position`（可由上游推断）
- `resume_source`（可选：文件路径或粘贴文本标识）

输出：

- 可写入的 `candidate_folder_path`

行为：

1. 若目录不存在：先调用 `create_candidate_folder`。
2. 若目录已存在：校验 `meta.json` 存在且可写；缺失时补建。
3. 若有 `resume_source` 且目录内无 `resume.pdf`：复制或登记来源引用。

### 2) write_stage_document

输入：

- `stage`：`初筛阶段（S0）` / `出题阶段（S1）` / `评估阶段（S2）`
- `round`：出题阶段（S1）必填（1-4）
- `content_markdown`
- `candidate_folder_path`
- `frontmatter`（必须包含契约字段）

输出：

- 对应阶段主文档路径

强制前置：

- 调用本操作前必须先执行 `ensure_candidate_workspace`。
- 禁止“只返回内容对象不落盘”；阶段成功定义为“主文档已写入 + meta 已更新”。

文件名映射：

- `初筛阶段（S0） -> 00_筛选报告.md`
- `出题阶段（S1） -> 01_面试题_第{round}轮.md`
- `评估阶段（S2） -> 02_面试评分报告.md`

### 3) update_meta

输入：

- `current_stage`
- `status`
- `documents` 更新映射
- `s2_feedback_loop`（可选）：
  - `state`：`draft|collect_feedback|finalize`
  - `interviewer_feedback_status`：`pending|received`
  - `last_feedback_at`

输出：

- `meta.json` 更新成功状态

### 4) mark_rejected

输入：

- `reason`

输出：

- 将文件夹重命名为：`{原名}（淘汰）`
- 在 `meta.json` 写入淘汰原因与时间

## Frontmatter 模板

```yaml
---
type: interview-stage-document
stage: S1
candidate_name: 张三
position: 后端工程师
round: 1
source_inputs:
  - ./00_筛选报告.md
  - "用户粘贴：技术专家面试（第1轮）评价摘要"
generated_by: interview-orchestrator
generated_at: 2026-03-19T12:00:00+08:00
schema_version: 1.1.0
---
```

## 约束

1. 不允许写入契约外阶段主文档名（S1 必须带轮次）。
2. 不允许无 frontmatter 写文档。
3. 每次文档写入后必须更新 `meta.json`。
4. 若文件已存在，默认覆盖并记录 `meta.json.history`。
5. S1 写入后必须同步更新 `meta.json.documents.S1.latest_round` 与 `round_files`。
6. S0/S1/S2 任一阶段开始时，若候选人目录不存在，必须先创建目录再继续。
7. 缺 JD 不是阻塞条件；缺 JD 时仍需落盘阶段文件，并在文档中标注“JD缺失影响”。
8. S2 落盘时必须带上本轮得分与 `wechat_copy_text` 字段映射，保证会后可直接转发。
9. S2 闭环必须更新 `meta.json.s2_feedback_loop`：至少包含 `state` 与 `interviewer_feedback_status`。
