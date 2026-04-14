import { describe, expect, test } from "bun:test";
import { guardAgentUserMessage, INTERVIEW_WORKFLOW_CONTRACT } from "./lui-agent-contract";

describe("lui-agent-contract S2 guard", () => {
  const contract = INTERVIEW_WORKFLOW_CONTRACT;

  test("accepts structured interview assessment input in S2", () => {
    const decision = guardAgentUserMessage({
      rawContent: [
        "候选人：胡少松",
        "面试轮次：技术专家面试（第1轮）",
        "1. JavaScript基础 - 优秀/一般/不通过",
        "备注：...",
        "2. Vue原理 - 优秀/一般/不通过",
        "综合评价：[简述候选人表现]",
        "录用建议：[强烈推荐/建议通过/待定/不推荐]",
      ].join("\n"),
      workflowStage: "S2",
      contract,
    });

    expect(decision.kind).toBe("allow");
    expect(decision.detectedIntent).toBe("assessment");
  });

  test("accepts plain interview notes mentioning previous questions in S2", () => {
    const decision = guardAgentUserMessage({
      rawContent: "面试纪要：候选人整体回答基本符合你现在的出题内容，Vue 响应式和工程化回答都比较完整，但性能优化案例不够深入。",
      workflowStage: "S2",
      contract,
    });

    expect(decision.kind).toBe("allow");
    expect(decision.detectedIntent).toBe("assessment");
  });

  test("clarifies vague assessment input with concrete note template in S2", () => {
    const decision = guardAgentUserMessage({
      rawContent: "评估合理",
      workflowStage: "S2",
      contract,
    });

    expect(decision.kind).toBe("clarify");
    if (decision.kind !== "clarify") {
      throw new Error("expected clarify decision");
    }
    expect(decision.reply).toContain("问了哪些题");
    expect(decision.reply).toContain("候选人怎么回答");
    expect(decision.reply).toContain("面试纪要");
  });
});
