import { describe, expect, test, vi } from "vitest";
import {
  DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
  mapResultLabelToRecommendation,
  normalizeInterviewImportRounds,
  prepareInterviewRoundPersistence,
} from "./round-persistence";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const UUID_D = "44444444-4444-4444-8444-444444444444";

describe("normalizeInterviewImportRounds", () => {
  test("derives missing round numbers from existing max round", () => {
    const result = normalizeInterviewImportRounds(
      [
        { evaluationText: "一面反馈" },
        { evaluationText: "二面反馈" },
      ],
      {
        existingInterviews: [{ id: "intv_1", round: 1 }],
      },
    );

    expect(result.startFrom).toBe(2);
    expect(result.rounds.map((round) => round.roundNumber)).toEqual([2, 3]);
  });
});

describe("mapResultLabelToRecommendation", () => {
  test("maps labels to stable recommendation values", () => {
    expect(mapResultLabelToRecommendation("通过")).toBe("pass");
    expect(mapResultLabelToRecommendation("待定")).toBe("hold");
    expect(mapResultLabelToRecommendation("未通过")).toBe("reject");
    expect(mapResultLabelToRecommendation("需要进一步观察")).toBe("hold");
    expect(mapResultLabelToRecommendation(null)).toBe("hold");
  });
});

describe("prepareInterviewRoundPersistence", () => {
  test("skips existing rounds and only appends new rounds", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(UUID_A)
      .mockReturnValueOnce(UUID_B)
      .mockReturnValueOnce(UUID_C)
      .mockReturnValueOnce(UUID_D);

    const result = prepareInterviewRoundPersistence({
      candidateId: "cand_1",
      existingInterviews: [{ id: "intv_existing_1", round: 1 }],
      rounds: [
        { roundNumber: 1, roundName: "技术一面", evaluationText: "重复轮次" },
        { roundNumber: 2, roundName: "技术二面", interviewerNames: ["张三", " 李四 ", "张三"], evaluationText: "二面通过", resultLabel: "通过" },
        { roundNumber: 3, roundName: "HR 面", interviewType: "视频", interviewDate: "2026-05-08T10:00:00.000Z", evaluationText: "三面待定", resultLabel: "待定" },
      ],
      now: 1_746_662_400_000,
    });

    expect(result.interviewCreates).toHaveLength(2);
    expect(result.assessmentCreates).toHaveLength(2);
    expect(result.summary.skippedRounds).toEqual([
      {
        status: "skipped",
        code: "skipped_duplicate_round",
        inputIndex: 0,
        roundNumber: 1,
        roundName: "技术一面",
        existingInterviewId: "intv_existing_1",
      },
    ]);
    expect(result.summary.appendedRounds).toHaveLength(2);
    expect(result.summary.failedRounds).toEqual([]);
    expect(result.interviewCreates[0]).toMatchObject({
      id: `intv_${UUID_A}`,
      candidateId: "cand_1",
      round: 2,
      status: "completed",
      interviewType: null,
      interviewResult: 1,
      interviewResultString: "通过",
      interviewerIdsJson: JSON.stringify(["张三", "李四"]),
      manualEvaluationJson: null,
    });
    expect(result.interviewCreates[1]).toMatchObject({
      id: `intv_${UUID_C}`,
      candidateId: "cand_1",
      round: 3,
      interviewType: 2,
      interviewResult: null,
      interviewResultString: "待定",
      scheduledAt: new Date("2026-05-08T10:00:00.000Z").getTime(),
    });
    expect(result.assessmentCreates[0]).toMatchObject({
      id: `assessment_${UUID_B}`,
      candidateId: "cand_1",
      interviewId: `intv_${UUID_A}`,
      interviewerId: "张三 / 李四",
      recommendation: "pass",
      overallEvaluation: "二面通过",
      overallScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
      technicalScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
      communicationScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
      cultureFitScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
    });
    expect(result.assessmentCreates[1]).toMatchObject({
      id: `assessment_${UUID_D}`,
      candidateId: "cand_1",
      interviewId: `intv_${UUID_C}`,
      interviewerId: "system",
      recommendation: "hold",
      overallEvaluation: "三面待定",
    });
  });

  test("treats duplicate rounds inside the same batch as skipped duplicate rounds", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(UUID_A)
      .mockReturnValueOnce(UUID_B);

    const result = prepareInterviewRoundPersistence({
      candidateId: "cand_2",
      existingInterviews: [],
      rounds: [
        { roundNumber: 4, roundName: "主管面", evaluationText: "首次导入" },
        { roundNumber: 4, roundName: "主管面-重复", evaluationText: "重复导入" },
      ],
      now: 1_746_662_400_000,
    });

    expect(result.interviewCreates).toHaveLength(1);
    expect(result.assessmentCreates).toHaveLength(1);
    expect(result.summary.appendedRounds).toHaveLength(1);
    expect(result.summary.skippedRounds).toEqual([
      {
        status: "skipped",
        code: "skipped_duplicate_round",
        inputIndex: 1,
        roundNumber: 4,
        roundName: "主管面-重复",
        existingInterviewId: `intv_${UUID_A}`,
      },
    ]);
  });
});
