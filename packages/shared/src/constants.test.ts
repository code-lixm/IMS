import { describe, expect, test } from "vitest";
import {
  APP_ID,
  IMR_FILE_EXT,
  SERVER_BASE_URL,
  SERVER_HOST,
  SERVER_PORT,
  formatInterviewRoundLabel,
  getInterviewRoundRoleLabel,
} from "./constants";

describe("shared/constants", () => {
  test("keeps core runtime constants aligned", () => {
    expect(SERVER_HOST).toBe("127.0.0.1");
    expect(SERVER_PORT).toBe(9092);
    expect(SERVER_BASE_URL).toBe("http://127.0.0.1:9092");
    expect(APP_ID).toBe("com.company.interview-manager");
    expect(IMR_FILE_EXT).toBe(".imr");
  });

  test("maps known interview rounds to role labels", () => {
    expect(getInterviewRoundRoleLabel(1)).toBe("技术专家");
    expect(getInterviewRoundRoleLabel(4)).toBe("HR");
    expect(getInterviewRoundRoleLabel(5)).toBeNull();
    expect(getInterviewRoundRoleLabel(Number.NaN)).toBeNull();
  });

  test("formats interview round labels with graceful fallback", () => {
    expect(formatInterviewRoundLabel(2)).toBe("主管面试（第2轮）");
    expect(formatInterviewRoundLabel(8)).toBe("第8轮面试");
    expect(formatInterviewRoundLabel(undefined)).toBe("轮次待确认");
  });
});
