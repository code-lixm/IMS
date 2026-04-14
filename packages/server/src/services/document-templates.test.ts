import { describe, expect, test } from "bun:test";
import {
  buildInterviewAssessmentMarkdownFromStructuredData,
  extractStructuredInterviewAssessmentBlock,
  getWorkflowMarkdownTemplate,
} from "./document-templates";

describe("document-templates", () => {
  test("keeps S0 template aligned with interview-screening structure", () => {
    const template = getWorkflowMarkdownTemplate("S0");

    expect(template.sections).toEqual([
      "分析结论",
      "红线风险核查",
      "维度评分明细",
      "加减分项",
      "待核验项",
      "面试建议考察维度",
    ]);
    expect(template.description).toContain("六维度评分明细");
  });

  test("keeps S1 template aligned with interview-questioning structure", () => {
    const template = getWorkflowMarkdownTemplate("S1");

    expect(template.title).toBe("候选人 - 岗位 - 年限");
    expect(template.sections).toEqual([
      "面试信息",
      "候选人简历分析",
      "面试题目",
    ]);
    expect(template.description).toContain("不要补充评估汇总表、面试官备注");
  });

  test("keeps S2 template aligned with interview-assessment structure", () => {
    const template = getWorkflowMarkdownTemplate("S2");

    expect(template.sections).toEqual([
      "一、分析结论",
      "二、题目对照评分（第X轮）",
      "三、加分与扣分（平衡）",
      "四、系统结论 vs 面试官反馈（差异分析）",
      "五、下一轮建议（第X轮）",
    ]);
    expect(template.description).toContain("严格逐行微信可复制块");
    expect(template.description).toContain("B/C 或淘汰结论不得输出下一轮建议");
  });

  test("extracts hidden structured assessment json and rebuilds wechat block with three-line summary items", () => {
    const content = [
      "## 一、分析结论",
      "",
      "示例正文",
      "",
      "<!-- interview-assessment-json:start -->",
      JSON.stringify({
        candidateName: "胡少松",
        roleAbbr: "FE",
        years: "10年",
        round: 1,
        grade: "B+",
        eliminateReasons: [],
        recommendedLevel: "P7+",
        scoreSummary: "82/100",
        evidenceCompleteness: "高",
        overallJudgement: "候选人与岗位匹配度较高。",
        analysisConclusion: "建议进入下一轮，继续验证复杂场景。",
        questionScores: [
          { topic: "性能优化", observation: "能结合指标讲优化路径", score: "22/25" },
        ],
        balanceHighlights: [
          { dimension: "性能优化", strength: "能落到场景和指标", risk: "压测复盘深度还需验证" },
        ],
        feedbackComparisons: [
          { topic: "综合表现", systemJudgement: "建议继续", interviewerFeedback: "认可", conclusion: "一致" },
        ],
        wechatSummaryItems: [
          { scene: "大模型平台性能优化", performance: "能拆出 SSE、虚拟列表和 Tree Shaking 的主优化链路", evaluation: "具备较强性能治理意识" },
          { scene: "微前端拆分", performance: "能按业务边界划分模块职责", evaluation: "架构拆分思路清晰" },
          { scene: "实时评测面板", performance: "能说明差异化刷新与一致性控制", evaluation: "对实时前端场景有实操经验" },
        ],
        nextRound: 2,
        nextRoundSuggestions: ["继续验证复杂架构取舍"],
        nextRoundFocus: ["跨应用治理", "稳定性设计"],
        shouldContinue: true,
      }, null, 2),
      "<!-- interview-assessment-json:end -->",
    ].join("\n");

    const extracted = extractStructuredInterviewAssessmentBlock(content);
    expect(extracted.structuredData?.candidateName).toBe("胡少松");
    expect(extracted.structuredData?.wechatCopyText).toContain("  表现：能拆出 SSE、虚拟列表和 Tree Shaking 的主优化链路");

    const markdown = buildInterviewAssessmentMarkdownFromStructuredData(extracted.structuredData!);
    expect(markdown).toContain("## 一、分析结论");
    expect(markdown).toContain("面试总结：");
    expect(markdown).toContain("- 场景：大模型平台性能优化");
    expect(markdown).toContain("  表现：能拆出 SSE、虚拟列表和 Tree Shaking 的主优化链路");
    expect(markdown).toContain("  评价：具备较强性能治理意识");
  });

  test("requires eliminate reasons for rejected grades", () => {
    const content = [
      "<!-- interview-assessment-json:start -->",
      JSON.stringify({
        candidateName: "胡少松",
        roleAbbr: "FE",
        years: "10年",
        round: 1,
        grade: "B",
        eliminateReasons: [],
        recommendedLevel: "不推荐",
        scoreSummary: "70/100",
        evidenceCompleteness: "高",
        overallJudgement: "存在明显风险。",
        analysisConclusion: "不建议继续。",
        questionScores: [
          { topic: "综合表现", observation: "存在明显短板", score: "14/25" },
        ],
        balanceHighlights: [
          { dimension: "综合表现", strength: "有一定经验", risk: "关键能力不匹配" },
        ],
        feedbackComparisons: [
          { topic: "综合表现", systemJudgement: "不建议继续", interviewerFeedback: "认同", conclusion: "一致" },
        ],
        wechatSummaryItems: [
          { scene: "场景1", performance: "表现1", evaluation: "评价1" },
          { scene: "场景2", performance: "表现2", evaluation: "评价2" },
          { scene: "场景3", performance: "表现3", evaluation: "评价3" },
        ],
        nextRound: null,
        nextRoundSuggestions: [],
        nextRoundFocus: [],
        shouldContinue: false,
      }, null, 2),
      "<!-- interview-assessment-json:end -->",
    ].join("\n");

    const extracted = extractStructuredInterviewAssessmentBlock(content);
    expect(extracted.structuredData).toBeNull();
  });
});
