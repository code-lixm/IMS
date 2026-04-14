import { describe, expect, test } from "bun:test";
import { buildStageFrontmatter, resolveStageFileName, withStageFrontmatter } from "./workflow-artifacts";
import {
  getAvailableNextStages,
  getSuggestedNextRound,
  isRejectedAssessmentContent,
  shouldPersistWorkflowArtifact,
} from "./lui-workflow";
import { composeWorkflowSystemPrompt } from "./lui-workflow-runtime";

describe("workflow-artifacts", () => {
  test("uses round-aware filename for S1", () => {
    expect(resolveStageFileName("S1", 2)).toBe("01_面试题_第2轮.md");
    expect(resolveStageFileName("S0")).toBe("00_筛选报告.md");
  });

  test("builds frontmatter with round and source inputs", () => {
    const frontmatter = buildStageFrontmatter({
      stage: "S1",
      candidateName: "张三",
      position: "前端工程师",
      round: 3,
      sourceInputs: ["./00_筛选报告.md"],
      generatedAt: "2026-04-11T00:00:00.000Z",
    });

    expect(frontmatter).toContain("stage: S1");
    expect(frontmatter).toContain("round: 3");
    expect(frontmatter).toContain('candidate_name: "张三"');
    expect(frontmatter).toContain('./00_筛选报告.md');
  });

  test("prepends frontmatter only once", () => {
    const first = withStageFrontmatter("# 标题", {
      stage: "S0",
      candidateName: "李四",
      position: null,
    });
    const second = withStageFrontmatter(first, {
      stage: "S0",
      candidateName: "李四",
      position: null,
    });

    expect(second).toBe(first);
  });

  test("persists S1 artifact once round is confirmed", () => {
    expect(shouldPersistWorkflowArtifact({
      stage: "S1",
      confirmedRound: 1,
      workflowAction: null,
      content: "面试题目：...",
    })).toBe(true);

    expect(shouldPersistWorkflowArtifact({
      stage: "S1",
      confirmedRound: null,
      workflowAction: "advance-stage",
      content: "面试题目：...",
    })).toBe(false);
  });

  test("keeps S0 gated by workflow action and allows S2 once scoring exists", () => {
    expect(shouldPersistWorkflowArtifact({
      stage: "S0",
      confirmedRound: null,
      workflowAction: "advance-stage",
      content: "当前阶段：S0\n推荐动作：进入出题",
    })).toBe(true);

    expect(shouldPersistWorkflowArtifact({
      stage: "S2",
      confirmedRound: null,
      workflowAction: "complete-workflow",
      content: "",
    })).toBe(true);

    expect(shouldPersistWorkflowArtifact({
      stage: "S2",
      confirmedRound: null,
      workflowAction: "advance-stage",
      content: "",
    })).toBe(true);

    expect(shouldPersistWorkflowArtifact({
      stage: "S2",
      confirmedRound: null,
      workflowAction: null,
      content: "## 一、分析结论\n\n- 本轮得分：78/100\n\n胡少松 FE 3年\n面试轮次：第1轮\n面试评价：B+\n推荐职级：P6",
    })).toBe(true);

    expect(shouldPersistWorkflowArtifact({
      stage: "S2",
      confirmedRound: null,
      workflowAction: null,
      content: "当前阶段：S2\n推荐动作：请补充面试纪要",
    })).toBe(false);
  });

  test("workflow prompt keeps formal stage documents free of workflow control text", () => {
    const prompt = composeWorkflowSystemPrompt({
      workflowStage: "S1",
      workflowStageIndex: 1,
      promptAssets: {
        candidateSummary: null,
        jobDescription: null,
        evaluationCriteria: null,
        customContext: {},
      },
    });

    expect(prompt).toContain("只输出完整 Markdown 正文");
    expect(prompt).toContain("默认只生成 6 道主问题");
    expect(prompt).toContain("总时长必须控制在 45 分钟内");
    expect(prompt).toContain("标题、面试信息、候选人简历分析、面试题目");
    expect(prompt).toContain("禁止输出这些额外章节或小节：评估汇总表、评分汇总表、面试官备注");
    expect(prompt).toContain("最后一道题结束后就停止正文");
    expect(prompt).toContain("禁止追加这些尾部说明：面试官使用说明、时间控制、追问深度、评分时机、重点关注");
  });

  test("workflow prompt aligns S0 screening semantics", () => {
    const prompt = composeWorkflowSystemPrompt({
      workflowStage: "S0",
      workflowStageIndex: 0,
      promptAssets: {
        candidateSummary: null,
        jobDescription: null,
        evaluationCriteria: null,
        customContext: {},
      },
    });

    expect(prompt).toContain("先做红线风险核查，再做完整的六维度评分");
    expect(prompt).toContain("不要只给总分或只给一句结论");
    expect(prompt).toContain("未知信息按“待核验项”处理");
  });

  test("workflow prompt aligns S2 assessment semantics", () => {
    const prompt = composeWorkflowSystemPrompt({
      workflowStage: "S2",
      workflowStageIndex: 2,
      promptAssets: {
        candidateSummary: null,
        jobDescription: null,
        evaluationCriteria: null,
        customContext: {},
      },
    });

    expect(prompt).toContain("评分证据只允许来自候选人回答内容");
    expect(prompt).toContain("评级口径固定为 A+/A/B+/B/C");
    expect(prompt).toContain("微信可复制块必须使用严格逐行模板");
    expect(prompt).toContain("若面试评价为 B 或 C");
    expect(prompt).toContain("正文不要写一级标题");
  });

  test("non-rejected S2 can loop back to S1 before completion", () => {
    const workflow = {
      currentStage: "S2",
      stageData: { round: 1 },
    } as const;

    expect(getAvailableNextStages(workflow as never)).toEqual(["S1", "completed"]);
    expect(getSuggestedNextRound(workflow as never)).toBe(2);
  });

  test("rejected S2 cannot continue to the next round", () => {
    const workflow = {
      currentStage: "S2",
      stageData: { round: 1 },
      documents: {
        S2: {
          content: "胡少松 FE 3年\n面试轮次：第1轮\n面试评价：B\n推荐职级：不推荐\n面试总结：\n- 整体总结：不建议继续流程",
        },
      },
    } as const;

    expect(getAvailableNextStages(workflow as never)).toEqual(["completed"]);
    expect(getSuggestedNextRound(workflow as never)).toBeNull();
    expect(isRejectedAssessmentContent(workflow.documents.S2.content)).toBe(true);
  });
});
