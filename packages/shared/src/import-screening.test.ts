import { describe, expect, test } from "vitest";
import {
  DEFAULT_BATCH_SCREENING_CONFIG,
  applyDerivedRecommendationToConclusion,
  deriveScreeningRecommendation,
  formatScreeningThresholdSummary,
  normalizeBatchScreeningConfig,
  validateBatchScreeningConfig,
} from "./import-screening";

describe("import screening helpers", () => {
  test("uses 80 / 70 as default batch thresholds", () => {
    expect(normalizeBatchScreeningConfig(null)).toEqual(DEFAULT_BATCH_SCREENING_CONFIG);
    expect(formatScreeningThresholdSummary(null)).toBe("通过 ≥ 80 · 待定 70-79 · 淘汰 < 70");
  });

  test("derives pass / review / reject without gaps or overlap", () => {
    const config = { passThreshold: 82, reviewThreshold: 68 };

    expect(deriveScreeningRecommendation(82, config)).toEqual(expect.objectContaining({
      verdict: "pass",
      label: "通过",
    }));
    expect(deriveScreeningRecommendation(81, config)).toEqual(expect.objectContaining({
      verdict: "review",
      label: "待定",
    }));
    expect(deriveScreeningRecommendation(67, config)).toEqual(expect.objectContaining({
      verdict: "reject",
      label: "淘汰",
    }));
  });

  test("rejects invalid threshold ranges", () => {
    expect(validateBatchScreeningConfig({ passThreshold: 70, reviewThreshold: 70 })).toContain("通过阈值必须大于待定阈值");
    expect(validateBatchScreeningConfig({ passThreshold: 101, reviewThreshold: 70 })).toContain("通过阈值必须是 1 到 100 之间的整数");
    expect(validateBatchScreeningConfig({ passThreshold: 80, reviewThreshold: 0 })).toContain("待定阈值必须是 1 到 99 之间的整数");
  });

  test("adds derived recommendation while keeping raw ai verdict and label", () => {
    const conclusion = applyDerivedRecommendationToConclusion({
      verdict: "review",
      label: "AI 建议保留观察",
      score: 88,
      summary: "summary",
      strengths: [],
      concerns: [],
      recommendedAction: "action",
      wechatCopyText: "copy",
    }, { passThreshold: 80, reviewThreshold: 70 });

    expect(conclusion?.verdict).toBe("review");
    expect(conclusion?.label).toBe("AI 建议保留观察");
    expect(conclusion?.derivedRecommendation).toEqual(expect.objectContaining({
      verdict: "pass",
      label: "通过",
    }));
  });
});
