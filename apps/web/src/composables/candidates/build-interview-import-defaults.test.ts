import { describe, expect, test } from "vitest";
import {
  buildInterviewImportDefaults,
  createInterviewImportRoundDefault,
} from "./build-interview-import-defaults";

describe("buildInterviewImportDefaults", () => {
  test("binds candidate id and creates a starter round", () => {
    const defaults = buildInterviewImportDefaults("cand_42", 3);

    expect(defaults.candidateId).toBe("cand_42");
    expect(defaults.resumePdf).toBeNull();
    expect(defaults.interviewQuestionsText).toBe("");
    expect(defaults.rounds).toHaveLength(1);
    expect(defaults.rounds[0]).toMatchObject({
      roundNumber: "3",
      evaluationText: "",
      interviewerNamesText: "",
    });
  });

  test("leaves round number empty when not provided", () => {
    expect(createInterviewImportRoundDefault()).toMatchObject({
      roundNumber: "",
      roundName: "",
      evaluationText: "",
    });
  });
});
