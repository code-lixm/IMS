import { describe, expect, test } from "bun:test";
import { executeTool } from "./lui-tools";

describe("lui-tools aliases", () => {
  test("bridges interview_resolveRound to IMS round resolver", async () => {
    const result = await executeTool("interview_resolveRound", {
      text: "上一轮是第2轮主管面，这次继续下一轮",
    }, {
      directory: process.cwd(),
    });

    expect(JSON.parse(result)).toEqual({
      round: 3,
      ask_required: false,
    });
  });

  test("bridges interview_buildWechatCopyText to strict copy output", async () => {
    const result = await executeTool("interview_buildWechatCopyText", {
      name: "胡少松",
      roleAbbr: "FE",
      years: "3年",
      round: 2,
      interviewEvaluation: "A（推荐复试，可录用）",
      recommendedLevel: "P6",
      summaryBullets: [
        "场景：技术栈匹配；评价：基础能力可用",
        "场景：沟通顺畅；评价：表达较清晰",
      ],
      nextRoundFocus: "系统设计",
    }, {
      directory: process.cwd(),
    });

    expect(result).toContain("胡少松｜FE｜3年");
    expect(result).toContain("面试轮次：第2轮");
    expect(result).toContain("面试评价：A（推荐复试，可录用）");
    expect(result).toContain("推荐职级：P6");
    expect(result).toContain("- 场景：技术栈匹配");
    expect(result).toContain("  表现：基础能力可用");
    expect(result).toContain("  评价：基础能力可用");
    expect(result).toContain("下一阶段面试侧重点：");
    expect(result).toContain("- 系统设计");
  });

  test("forbids next round focus when evaluation is rejected by grade", async () => {
    await expect(executeTool("interview_buildWechatCopyText", {
      name: "胡少松",
      roleAbbr: "FE",
      years: "3年",
      round: 2,
      interviewEvaluation: "B",
      recommendedLevel: "不推荐",
      summaryBullets: ["场景：回答泛化；评价：不满足录用要求"],
      nextRoundFocus: "系统设计",
    }, {
      directory: process.cwd(),
    })).rejects.toThrow("Rejected evaluation must not provide nextRoundFocus.");
  });

  test("normalizes plain B evaluation into company wording", async () => {
    const result = await executeTool("interview_buildWechatCopyText", {
      name: "胡少松",
      roleAbbr: "FE",
      years: "3年",
      round: 2,
      interviewEvaluation: "B",
      recommendedLevel: "不推荐",
      summaryBullets: ["整体总结：本轮结论为非必要不推荐"],
    }, {
      directory: process.cwd(),
    });

    expect(result).toContain("面试评价：B（非必要不推荐）");
    expect(result).toContain("推荐职级：不推荐");
  });

  test("formats multi-focus next round suggestions into short line bullets", async () => {
    const result = await executeTool("interview_buildWechatCopyText", {
      name: "胡少松",
      roleAbbr: "FE",
      years: "3年",
      round: 2,
      interviewEvaluation: "B+（推荐复试，offer数量不够，可择优录用）",
      recommendedLevel: "P6",
      summaryBullets: ["整体总结：建议继续验证复杂场景交付能力"],
      nextRoundFocus: "系统设计，协作推进，复杂场景取舍",
    }, {
      directory: process.cwd(),
    });

    expect(result).toContain("下一阶段面试侧重点：");
    expect(result).toContain("- 系统设计");
    expect(result).toContain("- 协作推进");
    expect(result).toContain("- 复杂场景取舍");
  });
});
