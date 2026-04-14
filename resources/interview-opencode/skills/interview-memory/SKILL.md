---
name: interview-memory
version: 2.4.0
description: >
  学习记忆 Skill。记录优秀题目、面试官风格、淘汰模式与用户负反馈，
  并将可复用模式沉淀到 `.opencode/memory/interview-learning.md`。
---

# Interview Learned

## 记录目标

1. **优秀题目模板**：哪些题在什么岗位/职级效果好。
2. **面试官风格画像**：偏技术深挖、偏行为面、或混合。
3. **淘汰触发模式**：常见失败信号。
4. **负反馈修正**：用户说“太难/不相关”后的调整策略。
5. **系统-面试官差异学习**：每轮评估阶段（S2）后对比系统结论与面试官主观判断，提炼可执行修正规则。

## 触发时机

- `interview-orchestrator` 在阶段完成后触发（初筛阶段（S0）/出题阶段（S1）/评估阶段（S2））。
- 每轮面试结束后（评估阶段（S2）总结输出后立即触发）
- 用户否定 AI 建议后
- 每周汇总复盘时

## 数据落点

- 长期规则：`.opencode/memory/interview-learning.md`
- 会话记录：候选人目录下 `meta.json.history`

## 输出模板（写入 .opencode/memory/interview-learning.md）

```markdown
## 学习记忆

### 优秀题目
- TPL-001 | 后端/P7+ | 有效度 9/10 | 使用 6 次

### 风格画像
- 面试官A：技术深挖优先，先问原理再问场景

### 常见淘汰模式
- REJ-003：系统设计只讲概念，缺少落地细节

### 负反馈修正
- "题目太难" -> 同岗位降一档难度 + 增加引导问题

### 系统-面试官差异学习
- FBK-001 | round=2 | 系统=B+ / 面试官=A | 分歧点=沟通稳定性权重偏低 | 修正=补充“紧张但逻辑清晰”判定规则
```

## 输入模板（评估阶段（S2）反馈闭环）

```json
{
  "round": 2,
  "system_assessment": {
    "grade": "B+",
    "recommended_level": "P7-",
    "summary_points": ["..."]
  },
  "interviewer_feedback": {
    "score_1_to_10": 8,
    "interviewer_evaluation": "A",
    "interviewer_recommended_level": "P7-",
    "comment": "..."
  }
}
```

## 输出模板（差异分析）

```json
{
  "agreement_points": ["..."],
  "difference_points": ["..."],
  "learning_actions": ["..."],
  "record_entry": "FBK-xxx | ..."
}
```

## 约束

1. 不记录个人隐私敏感信息。
2. 记录的是“模式”，不是“人身标签”。
3. 每条学习必须可执行（能指导下次出题或评估）。
4. 仅允许由 `interview-orchestrator` 触发，不作为独立主入口使用。
5. 评估阶段（S2）必须记录“系统结论 vs 面试官反馈”的差异分析；不得只存原始反馈不做归因。
6. 禁止将候选人级运行时学习记录直接写入 `AGENTS.md` 主规则区。
