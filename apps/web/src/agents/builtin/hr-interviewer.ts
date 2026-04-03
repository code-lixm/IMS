import { tool } from 'ai';
import { z } from 'zod';
import {
  agentHost,
  type AgentExecutionOptions,
  type AgentManifest,
  type IMSContext,
} from '../host';
import { getIMSContext } from '../context-bridge';

export const hrInterviewerManifest: AgentManifest = {
  id: 'hr-interviewer',
  name: 'HR 面试官',
  description: '评估候选人的软技能、文化契合度和职业规划',
  capabilities: [
    'soft-skills-evaluation',
    'culture-fit-assessment',
    'career-planning',
  ],
  model: 'gpt-4o',
  category: 'builtin',
  permissions: ['candidate:read', 'interview:write'],
  handoffTargets: ['interview-coordinator'],
  ui: {
    icon: 'users',
    color: '#8b5cf6',
  },
};

const candidateLevelSchema = z.enum(['junior', 'mid', 'senior']);
const hrRecommendationSchema = z.enum(['strongly-recommend', 'recommend', 'neutral', 'not-recommend']);

const hrAssessmentSchema = z.object({
  softSkillsScore: z.number().min(1).max(10).describe('软技能评分'),
  cultureFitScore: z.number().min(1).max(10).describe('文化契合度评分'),
  communicationScore: z.number().min(1).max(10).describe('沟通能力评分'),
  strengths: z.array(z.string()).min(1).describe('优势'),
  concerns: z.array(z.string()).min(1).describe('关注点'),
  careerGoals: z.string().min(1).describe('职业目标'),
  overallRecommendation: hrRecommendationSchema.describe('整体推荐'),
  notes: z.string().optional().describe('备注'),
});

type CandidateLevel = z.infer<typeof candidateLevelSchema>;
type HRAssessment = z.infer<typeof hrAssessmentSchema>;

const getHRQuestionsTool = tool({
  description: '根据关注领域和候选人级别生成结构化 HR 面试问题',
  inputSchema: z.object({
    focusArea: z.enum(['soft-skills', 'culture-fit', 'career-planning', 'general']).describe('关注领域'),
    candidateLevel: candidateLevelSchema.describe('候选人级别'),
  }),
  execute: async ({ focusArea, candidateLevel }: { focusArea: 'soft-skills' | 'culture-fit' | 'career-planning' | 'general'; candidateLevel: CandidateLevel }) => {
    try {
      const questionBank: Record<'soft-skills' | 'culture-fit' | 'career-planning' | 'general', string[]> = {
        'soft-skills': [
          '请举例说明你如何在跨团队合作中推动结果落地。',
          '遇到目标变化或资源受限时，你如何重新协调优先级？',
          candidateLevel === 'senior' ? '请分享一次你影响他人、推动组织协同的经历。' : '请分享一次你主动补位解决问题的经历。',
        ],
        'culture-fit': [
          '你在什么样的管理方式和团队氛围下表现最好？为什么？',
          '当团队意见不一致时，你通常如何表达观点并推动达成共识？',
          '请描述一次你适应新文化或新团队的过程。',
        ],
        'career-planning': [
          '未来 2-3 年你最想强化的能力是什么？',
          '你为什么选择当前这个岗位方向？',
          candidateLevel === 'senior' ? '你希望下一份工作在职责边界和影响范围上有哪些变化？' : '你希望在下一份工作中获得怎样的成长机会？',
        ],
        general: [
          '请做一个与你职业成长相关的自我介绍。',
          '你做职业选择时最看重哪些因素？',
          '如果加入我们，你希望前三个月完成什么目标？',
        ],
      };

      return {
        success: true,
        data: {
          focusArea,
          candidateLevel,
          questions: questionBank[focusArea],
          evaluationSignals: [
            '表达是否清晰、有逻辑',
            '是否具备自我认知和复盘能力',
            focusArea === 'culture-fit' ? '是否适合团队协作方式' : '是否具备稳定的职业动机',
          ],
        },
      };
    } catch (error) {
      return createToolError('生成 HR 面试问题失败', error);
    }
  },
});

const analyzeBehavioralSignalsTool = tool({
  description: '基于当前候选人简历提炼软技能、稳定性和文化匹配线索',
  inputSchema: z.object({
    companyValues: z.array(z.string()).optional().describe('公司重视的价值观关键词'),
  }),
  execute: async ({ companyValues }: { companyValues?: string[] }, options: unknown) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const candidate = ctx.currentCandidate;

      if (!candidate) {
        return { success: false, error: '当前没有选中的候选人，请先选择候选人后再分析 HR 画像' };
      }

      const material = `${candidate.resumeData.rawText}\n${collectStringValues(candidate.resumeData.parsedData).join(' ')}`;
      const years = inferYearsOfExperience(material);
      const candidateLevel = inferCandidateLevel(years);
      const matchedValues = (companyValues ?? []).filter(value => material.toLowerCase().includes(value.toLowerCase()));

      return {
        success: true,
        data: {
          candidateId: candidate.id,
          candidateName: candidate.name,
          candidateLevel,
          careerStage: years >= 6 ? '成熟期' : years >= 3 ? '上升期' : '探索期',
          likelyStrengths: buildBehavioralStrengths(material),
          riskSignals: buildBehavioralRisks(material),
          matchedValues,
          recommendedFocusAreas: [
            '稳定性与岗位动机',
            '沟通协作与冲突处理方式',
            candidateLevel === 'senior' ? '影响力与带团队方式' : '成长潜力与学习主动性',
          ],
        },
      };
    } catch (error) {
      return createToolError('分析行为线索失败', error);
    }
  },
});

const coordinateHREvaluationTool = tool({
  description: '将 HR 面试结论同步给 interview-coordinator，便于安排后续面试或综合评估',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    summary: z.string().min(1).describe('HR 评估摘要'),
    recommendation: hrRecommendationSchema.describe('整体推荐结论'),
    strengths: z.array(z.string()).min(1).describe('候选人优势'),
    concerns: z.array(z.string()).min(1).describe('关注点'),
    followUpTopics: z.array(z.string()).min(1).describe('建议协调员纳入后续流程的话题'),
  }),
  execute: async (
    {
      candidateId,
      summary,
      recommendation,
      strengths,
      concerns,
      followUpTopics,
    }: {
      candidateId?: string;
      summary: string;
      recommendation: z.infer<typeof hrRecommendationSchema>;
      strengths: string[];
      concerns: string[];
      followUpTopics: string[];
    },
    options: unknown,
  ) => {
    try {
      const runtime = getAgentRuntime(options);
      const ctx = getIMSContext(runtime);
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '缺少 candidateId，无法同步 HR 评估结果' };
      }

      const handoffChunk = await runtime.host.handoff(runtime.agentId, 'interview-coordinator', ctx, {
        reason: '同步 HR 面评并请求综合决策',
        message: summary,
        metadata: {
          candidateId: resolvedCandidateId,
          recommendation,
          concerns,
        },
      });
      runtime.emit?.(handoffChunk);

      const coordinatorOutput = await runtime.host.executeAgent(
        'interview-coordinator',
        buildCoordinatorPrompt(resolvedCandidateId, summary, recommendation, strengths, concerns, followUpTopics, ctx),
        ctx,
      );

      return {
        success: true,
        message: 'HR 结论已同步给面试协调员',
        data: {
          candidateId: resolvedCandidateId,
          coordinatorOutput,
        },
      };
    } catch (error) {
      return createToolError('同步 HR 结论失败', error);
    }
  },
});

const saveHRAssessmentTool = tool({
  description: '保存 HR 评估结果',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    assessment: hrAssessmentSchema,
  }),
  execute: async (
    { candidateId, assessment }: { candidateId?: string; assessment: HRAssessment },
    options: unknown,
  ) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '缺少 candidateId，无法保存 HR 评估结果' };
      }

      return {
        success: true,
        message: 'HR 评估已保存',
        data: {
          candidateId: resolvedCandidateId,
          ...assessment,
          assessedBy: ctx.currentUser.id,
          assessedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return createToolError('保存 HR 评估失败', error);
    }
  },
});

export function createHRInterviewerAgent(): any {
  return {
    id: hrInterviewerManifest.id,
    model: hrInterviewerManifest.model,
    maxSteps: 6,
    systemPrompt: `你是一位经验丰富的 HR 面试官，负责把候选人的行为表现、沟通方式、职业动机和文化契合度说清楚。

你的核心职责：
1. 基于简历和上下文提炼软技能、稳定性和职业阶段线索。
2. 设计能区分候选人成熟度的 HR 问题，而不是通用模板题。
3. 输出清晰的 HR 评价、推荐结论和风险提醒。
4. 需要跨角色协作时，把 HR 结论同步给 interview-coordinator。

工作要求：
- 关注事实依据，避免主观标签化。
- 结论要能支撑后续决策，例如是否安排综合面、是否重点追问动机和稳定性。
- 信息不足时，先用工具补齐候选人画像再继续。`,
    tools: {
      getHRQuestions: getHRQuestionsTool,
      analyzeBehavioralSignals: analyzeBehavioralSignalsTool,
      coordinateHREvaluation: coordinateHREvaluationTool,
      saveHRAssessment: saveHRAssessmentTool,
    },
  };
}

agentHost.register(hrInterviewerManifest, createHRInterviewerAgent);

function createToolError(message: string, error: unknown) {
  return {
    success: false,
    error: error instanceof Error ? `${message}：${error.message}` : message,
  };
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => collectStringValues(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(item => collectStringValues(item));
  }

  return [];
}

function inferYearsOfExperience(text: string): number {
  const match = text.match(/(\d{1,2})\s*年/);
  return match ? Number.parseInt(match[1], 10) : 3;
}

function inferCandidateLevel(years: number): CandidateLevel {
  if (years >= 6) {
    return 'senior';
  }
  if (years >= 3) {
    return 'mid';
  }
  return 'junior';
}

function buildBehavioralStrengths(material: string): string[] {
  const strengths = [
    /团队|协作|跨部门/i.test(material) ? '有跨团队协作经历' : undefined,
    /负责|主导|推进/i.test(material) ? '具备一定的主动性和推动力' : undefined,
    /复盘|优化|改进/i.test(material) ? '有复盘和持续改进意识' : undefined,
  ];

  return strengths.filter((item): item is string => Boolean(item));
}

function buildBehavioralRisks(material: string): string[] {
  const risks = [
    material.length < 200 ? '简历对软技能和团队协作描述较少，需要面试中补问' : undefined,
    !/团队|协作|沟通/i.test(material) ? '缺少协作案例，需要验证沟通与协同能力' : undefined,
    !/负责|主导|推进/i.test(material) ? '缺少主动承担或影响他人的信号，需要验证 ownership' : undefined,
  ];

  return risks.filter((item): item is string => Boolean(item));
}

function getAgentRuntime(options: unknown): AgentExecutionOptions {
  if (
    !options ||
    typeof options !== 'object' ||
    !('state' in options) ||
    !('agentId' in options) ||
    !('host' in options)
  ) {
    throw new Error('Agent 运行时上下文不可用');
  }

  return options as AgentExecutionOptions;
}

function buildCoordinatorPrompt(
  candidateId: string,
  summary: string,
  recommendation: z.infer<typeof hrRecommendationSchema>,
  strengths: string[],
  concerns: string[],
  followUpTopics: string[],
  context: IMSContext,
): string {
  const candidateName = context.currentCandidate?.name ?? '未知候选人';

  return [
    `请接收来自 hr-interviewer 的 HR 评估结论，并用于候选人 ${candidateId} 的后续协调。`,
    `候选人姓名：${candidateName}`,
    `HR 推荐结论：${recommendation}`,
    `评估摘要：${summary}`,
    `优势：${strengths.join('；')}`,
    `关注点：${concerns.join('；')}`,
    `建议后续追问：${followUpTopics.join('；')}`,
    '请输出后续面试安排建议、风险提醒和综合决策建议。',
  ].join('\n');
}
