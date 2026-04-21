import { describe, expect, test } from "vitest";
import {
  AGENT_CONTRACT_VERSION,
  validateAgentContractDocument,
  validateAgentContractPatch,
} from "./agent-contract";

describe("shared/agent-contract", () => {
  test("accepts a valid workflow contract document", () => {
    const result = validateAgentContractDocument({
      version: AGENT_CONTRACT_VERSION,
      scope: "workflow",
      allowedIntents: ["screening", "assessment"],
      stageRules: {
        S2: {
          allowedIntents: ["assessment"],
          requiredHints: ["interview_notes"],
        },
      },
      offtrackPolicy: "clarify",
      hardRules: {
        requireRoundConfirmationInS1: true,
        requireInterviewNotesInS2: true,
        forbidScoringByInterviewerSpeech: true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.value?.stageRules.S2?.requiredHints).toEqual(["interview_notes"]);
  });

  test("reports unknown keys and invalid intents", () => {
    const result = validateAgentContractDocument({
      version: AGENT_CONTRACT_VERSION,
      scope: "workflow",
      allowedIntents: ["screening", "bad_intent"],
      stageRules: {
        S9: {
          allowedIntents: ["assessment"],
        },
      },
      offtrackPolicy: "clarify",
      hardRules: {
        requireRoundConfirmationInS1: true,
        requireInterviewNotesInS2: true,
        forbidScoringByInterviewerSpeech: true,
      },
      extra: true,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "extra", message: "未知字段" }),
      expect.objectContaining({ path: "allowedIntents[1]" }),
      expect.objectContaining({ path: "stageRules.S9", message: "未知 stage" }),
    ]));
  });

  test("allows partial patch payloads", () => {
    const result = validateAgentContractPatch({
      offtrackPolicy: "rewrite",
      hardRules: {
        requireInterviewNotesInS2: true,
      },
      stageRules: {
        S1: {
          requiredHints: ["confirm_round"],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      offtrackPolicy: "rewrite",
      hardRules: {
        requireInterviewNotesInS2: true,
      },
      stageRules: {
        S1: {
          allowedIntents: [],
          requiredHints: ["confirm_round"],
        },
      },
    });
  });
});
