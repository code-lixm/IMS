import { describe, expect, test } from "vitest";
import {
  inferRoundNumbers,
  validateInterviewImportAIDraft,
  validateInterviewImportPayload,
} from "./interview-import";
import type {
  InterviewImportPayload,
  CreateCandidatePayload,
  CandidateDetailAppendPayload,
  InterviewImportAIDraft,
} from "./interview-import";

describe("inferRoundNumbers", () => {
  test("derives round numbers from array position when roundNumber is omitted (startFrom=1)", () => {
    const rounds = [
      { evaluationText: "e1" },
      { evaluationText: "e2" },
      { evaluationText: "e3" },
    ];
    const result = inferRoundNumbers(rounds);
    expect(result).toHaveLength(3);
    expect(result[0].resolvedRoundNumber).toBe(1);
    expect(result[1].resolvedRoundNumber).toBe(2);
    expect(result[2].resolvedRoundNumber).toBe(3);
  });

  test("honours explicit roundNumber over array position", () => {
    const rounds = [
      { roundNumber: 5, evaluationText: "e1" },
      { roundNumber: 10, evaluationText: "e2" },
    ];
    const result = inferRoundNumbers(rounds);
    expect(result[0].resolvedRoundNumber).toBe(5);
    expect(result[1].resolvedRoundNumber).toBe(10);
  });

  test("handles mixed explicit and inferred round numbers", () => {
    const rounds = [
      { roundNumber: 3, evaluationText: "e1" },
      { evaluationText: "e2" },
      { roundNumber: 7, evaluationText: "e3" },
    ];
    const result = inferRoundNumbers(rounds);
    expect(result[0].resolvedRoundNumber).toBe(3);
    expect(result[1].resolvedRoundNumber).toBe(2);
    expect(result[2].resolvedRoundNumber).toBe(7);
  });

  test("accepts custom startFrom for append mode", () => {
    const rounds = [
      { evaluationText: "e1" },
      { evaluationText: "e2" },
    ];
    const result = inferRoundNumbers(rounds, 4);
    expect(result[0].resolvedRoundNumber).toBe(4);
    expect(result[1].resolvedRoundNumber).toBe(5);
  });

  test("passes through all round fields to the inferred result", () => {
    const rounds = [
      {
        roundNumber: 2,
        roundName: "技术一面",
        interviewDate: "2026-05-01",
        interviewerNames: ["张三", "李四"],
        interviewType: "视频",
        evaluationText: "技术基础扎实",
        resultLabel: "通过",
      },
    ];
    const [result] = inferRoundNumbers(rounds);
    expect(result.resolvedRoundNumber).toBe(2);
    expect(result.roundName).toBe("技术一面");
    expect(result.interviewDate).toBe("2026-05-01");
    expect(result.interviewerNames).toEqual(["张三", "李四"]);
    expect(result.interviewType).toBe("视频");
    expect(result.evaluationText).toBe("技术基础扎实");
    expect(result.resultLabel).toBe("通过");
  });

  test("treats NaN roundNumber the same as missing", () => {
    const rounds = [{ roundNumber: Number.NaN, evaluationText: "e" }];
    const result = inferRoundNumbers(rounds, 5);
    expect(result[0].resolvedRoundNumber).toBe(5);
  });

  test("handles empty array", () => {
    const result = inferRoundNumbers([], 1);
    expect(result).toHaveLength(0);
  });
});

describe("validateInterviewImportPayload", () => {
  test("rejects malformed AI draft payloads", () => {
    const draft: InterviewImportAIDraft = {
      candidateOptions: [
        {
          candidateName: "",
          confidence: 1.2,
          reason: "",
        },
      ],
      rounds: [],
      confidence: -0.1,
      reasons: [],
      auditSnapshot: {},
    };

    const errors = validateInterviewImportAIDraft(draft);
    expect(errors.some((e) => e.field === "candidateOptions[0].candidateName")).toBe(true);
    expect(errors.some((e) => e.field === "candidateOptions[0].confidence")).toBe(true);
    expect(errors.some((e) => e.field === "candidateOptions[0].reason")).toBe(true);
    expect(errors.some((e) => e.field === "rounds")).toBe(true);
    expect(errors.some((e) => e.field === "confidence")).toBe(true);
    expect(errors.some((e) => e.field === "reasons")).toBe(true);
  });

  test("rejects empty rounds for create_candidate", () => {
    const payload: CreateCandidatePayload = {
      mode: "create_candidate",
      name: "张三",
      rounds: [],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "rounds")).toBe(true);
  });

  test("rejects missing name for create_candidate", () => {
    const payload: InterviewImportPayload = {
      mode: "create_candidate",
      name: "",
      rounds: [{ evaluationText: "e1" }],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  test("passes valid create_candidate payload with top-level text fields", () => {
    const payload: CreateCandidatePayload = {
      mode: "create_candidate",
      name: "张三",
      phone: "13800138000",
      position: "前端工程师",
      interviewQuestionsText: "1. 自我介绍 2. 项目经验",
      meetingNotesText: "候选人表现积极",
      overallSummaryText: "推荐进入下一轮",
      rounds: [
        { roundNumber: 1, evaluationText: "表达清晰，逻辑性强" },
      ],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors).toHaveLength(0);
  });

  test("rejects missing candidateId for bind_existing_candidate", () => {
    const payload: InterviewImportPayload = {
      mode: "bind_existing_candidate",
      candidateId: "",
      rounds: [{ evaluationText: "e1" }],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "candidateId")).toBe(true);
  });

  test("rejects missing candidateId for candidate_detail_append", () => {
    const payload: InterviewImportPayload = {
      mode: "candidate_detail_append",
      candidateId: "  ",
      rounds: [{ evaluationText: "e1" }],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "candidateId")).toBe(true);
  });

  test("passes valid candidate_detail_append payload with top-level text fields", () => {
    const payload: CandidateDetailAppendPayload = {
      mode: "candidate_detail_append",
      candidateId: "candidate-123",
      resume: { pdfPath: "/tmp/resume.pdf" },
      interviewQuestionsText: "技术问题",
      meetingNotesText: "会议记录",
      overallSummaryText: "整体表现良好",
      rounds: [
        {
          roundNumber: 4,
          roundName: "HR 面",
          interviewDate: "2026-05-08",
          interviewerNames: ["王五"],
          interviewType: "现场",
          evaluationText: "沟通能力优秀",
          resultLabel: "通过",
        },
      ],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors).toHaveLength(0);
  });

  test("rejects negative roundNumber", () => {
    const payload: InterviewImportPayload = {
      mode: "create_candidate",
      name: "李四",
      rounds: [{ roundNumber: -1, evaluationText: "e" }],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "rounds[0].roundNumber")).toBe(true);
  });

  test("rejects zero roundNumber", () => {
    const payload: InterviewImportPayload = {
      mode: "candidate_detail_append",
      candidateId: "c-1",
      rounds: [{ roundNumber: 0, evaluationText: "e" }],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "rounds[0].roundNumber")).toBe(true);
  });

  // ----- evaluationText validation -----
  test("rejects missing evaluationText in round", () => {
    const payload: InterviewImportPayload = {
      mode: "create_candidate",
      name: "赵六",
      rounds: [{} as { evaluationText: string }], // missing evaluationText
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "rounds[0].evaluationText")).toBe(true);
  });

  test("rejects empty evaluationText in round", () => {
    const payload: InterviewImportPayload = {
      mode: "create_candidate",
      name: "赵六",
      rounds: [{ evaluationText: "" }],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors.some((e) => e.field === "rounds[0].evaluationText")).toBe(true);
  });

  test("passes with omitted roundNumber as long as evaluationText is present", () => {
    const payload: InterviewImportPayload = {
      mode: "create_candidate",
      name: "王五",
      rounds: [{ evaluationText: "e1" }, { evaluationText: "e2" }],
    };
    const errors = validateInterviewImportPayload(payload);
    expect(errors).toHaveLength(0);
  });

  test("create_candidate payload can carry top-level fields without rounds validation issue", () => {
    const payload: CreateCandidatePayload = {
      mode: "create_candidate",
      name: "测试",
      resume: { pdfPath: "/r/1.pdf" },
      interviewQuestionsText: "q1\nq2",
      rounds: [{ evaluationText: "评语" }],
    };
    expect(validateInterviewImportPayload(payload)).toHaveLength(0);
  });
});
