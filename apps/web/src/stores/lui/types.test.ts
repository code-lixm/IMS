import { describe, expect, test } from "vitest";
import { convertAgent, convertWorkflow } from "./types";

describe("lui type converters", () => {
  test("convertWorkflow preserves new workflow fields and converts dates", () => {
    const workflow = convertWorkflow({
      id: "wf_1",
      candidateId: "cand_1",
      conversationId: "conv_1",
      currentStage: "S2",
      confirmedRound: 2,
      suggestedNextRound: 3,
      requiresRoundConfirmation: true,
      recommendedNextStage: "completed",
      availableNextStages: ["S2", "completed"],
      recommendedAction: "推进到最终评估",
      status: "active",
      latestAssessment: {
        candidateName: "张三",
        roleAbbr: "FE",
        years: "6年",
        round: 2,
        grade: "A",
        eliminateReasons: [],
        recommendedLevel: "P6",
        normalizedRecommendedLevel: "p6",
        interviewEvaluationLabel: "建议通过",
        scoreSummary: "结论明确",
        evidenceCompleteness: "证据充分",
        overallJudgement: "strong_hire",
        analysisConclusion: "结论明确",
        questionScores: [],
        balanceHighlights: [],
        feedbackComparisons: [],
        wechatSummaryItems: [],
        nextRound: 3,
        nextRoundSuggestions: [],
        nextRoundFocus: [],
        shouldContinue: true,
        wechatCopyText: "可复制文案",
      },
      artifacts: [
        {
          id: "art_1",
          stage: "S2",
          title: "评估",
          type: "markdown",
          fileResourceId: null,
          fileName: "assessment.md",
          filePath: null,
          language: "markdown",
          summary: null,
          createdAt: 1_712_000_000_000,
        },
      ],
      updatedAt: 1_712_000_000_000,
    });

    expect(workflow.suggestedNextRound).toBe(3);
    expect(workflow.availableNextStages).toEqual(["S2", "completed"]);
    expect(workflow.latestAssessment?.analysisConclusion).toBe("结论明确");
    expect(workflow.updatedAt).toBeInstanceOf(Date);
    expect(workflow.artifacts[0]?.createdAt).toBeInstanceOf(Date);
  });

  test("convertAgent fills nullable fields with safe defaults and converts timestamps", () => {
    const agent = convertAgent({
      id: "agent_1",
      agentId: "interviewer",
      name: "interviewer",
      displayName: "Interviewer",
      description: null,
      engine: "deepagents",
      mode: "workflow",
      temperature: 0.2,
      systemPrompt: null,
      tools: [],
      sourceType: "builtin",
      isBuiltin: true,
      isMutable: false,
      isDefault: true,
      sceneAffinity: "interview",
      createdAt: 1_712_000_000_000,
      updatedAt: 1_712_000_100_000,
    });

    expect(agent.description).toBe("");
    expect(agent.systemPrompt).toBe("");
    expect(agent.tools).toEqual([]);
    expect(agent.createdAt).toBeInstanceOf(Date);
    expect(agent.updatedAt).toBeInstanceOf(Date);
  });
});
