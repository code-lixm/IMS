import { describe, expect, test } from "vitest";
import {
  buildInterviewImportPayload,
  validateInterviewImportFormDraft,
  type InterviewImportFormDraft,
} from "./interview-import-payload";

function createDraft(overrides: Partial<InterviewImportFormDraft> = {}): InterviewImportFormDraft {
  return {
    meetingNotesText: "候选人表达清晰，建议推进下一轮",
    ...overrides,
  };
}

describe("interview import payload helpers", () => {
  test("builds layered payload from meeting notes and candidate context", () => {
    const resumePdf = new File(["pdf"], "resume.pdf", { type: "application/pdf" });
    const payload = buildInterviewImportPayload(createDraft(), {
      candidateId: "candidate-123",
      candidateName: "张三",
      nextRoundNumber: 4,
      resumePdf,
    });

    expect(payload).toEqual(expect.objectContaining({
      mode: "candidate_detail_append",
      candidateId: "candidate-123",
      rawInput: expect.objectContaining({
        meetingNotesText: "候选人表达清晰，建议推进下一轮",
        resume: expect.objectContaining({ pdfPath: "resume.pdf" }),
      }),
      systemContext: expect.objectContaining({
        candidateId: "candidate-123",
        candidateName: "张三",
      }),
    }));
    expect(payload.rounds).toEqual([
      expect.objectContaining({
        roundNumber: 4,
        evaluationText: "候选人表达清晰，建议推进下一轮",
      }),
    ]);
  });

  test("validates that at least one primary input is present", () => {
    const issues = validateInterviewImportFormDraft(createDraft({ meetingNotesText: "" }), {
      resumePdf: null,
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "meetingNotesText", severity: "error" }),
    ]));
  });

  test("warns when only PDF is provided", () => {
    const resumePdf = new File(["pdf"], "resume.pdf", { type: "application/pdf" });
    const issues = validateInterviewImportFormDraft(createDraft({ meetingNotesText: "" }), {
      resumePdf,
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "meetingNotesText", severity: "warning" }),
    ]));
  });

});
