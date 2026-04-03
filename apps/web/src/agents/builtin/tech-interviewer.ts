import { tool } from 'ai';
import { z } from 'zod';
import {
  agentHost,
  type AgentExecutionOptions,
  type AgentManifest,
  type IMSContext,
} from '../host';
import { getIMSContext } from '../context-bridge';

export const techInterviewerManifest: AgentManifest = {
  id: 'tech-interviewer',
  name: '技术面试官',
  description: '深入评估候选人的技术能力和解决问题的能力',
  capabilities: [
    'technical-evaluation',
    'coding-assessment',
    'system-design',
  ],
  model: 'gpt-4o',
  category: 'builtin',
  permissions: ['candidate:read', 'interview:write'],
  handoffTargets: ['interview-coordinator'],
  ui: {
    icon: 'code',
    color: '#10b981',
  },
};

const candidateLevelSchema = z.enum(['junior', 'mid', 'senior']);

const technicalAssessmentSchema = z.object({
  technicalScore: z.number().min(1).max(10).describe('技术能力评分'),
  strengths: z.array(z.string()).min(1).describe('技术优势'),
  weaknesses: z.array(z.string()).min(1).describe('需要提升的方面'),
  recommendedQuestions: z.array(z.string()).min(1).describe('建议进一步验证的问题'),
  overallImpression: z.string().min(1).describe('整体印象'),
});

type CandidateLevel = z.infer<typeof candidateLevelSchema>;
type TechnicalAssessment = z.infer<typeof technicalAssessmentSchema>;

const TECH_KEYWORDS = [
  'TypeScript',
  'JavaScript',
  'Vue',
  'React',
  'Node.js',
  'Bun',
  'Python',
  'Java',
  'Go',
  'Rust',
  'SQL',
  'MySQL',
  'PostgreSQL',
  'SQLite',
  'Redis',
  'Docker',
  'Kubernetes',
  'AWS',
  'CI/CD',
  'Tauri',
  'Vite',
  'Drizzle',
  'GraphQL',
  '微服务',
  '系统设计',
] as const;

const getTechnicalQuestionsTool = tool({
  description: '根据技术栈和候选人级别生成结构化技术面试问题',
  inputSchema: z.object({
    techStack: z.array(z.string()).min(1).describe('技术栈列表'),
    level: candidateLevelSchema.describe('候选人级别'),
    focus: z.enum(['fundamentals', 'implementation', 'debugging', 'architecture']).optional().describe('本轮重点考察方向'),
  }),
  execute: async ({ techStack, level, focus }: { techStack: string[]; level: CandidateLevel; focus?: 'fundamentals' | 'implementation' | 'debugging' | 'architecture' }) => {
    try {
      const questions = techStack.map((technology) => {
        const baseQuestions = {
          fundamentals: `请解释 ${technology} 的核心概念，并结合你最近的项目举例说明。`,
          implementation: `你在使用 ${technology} 落地需求时，做过哪些关键技术方案取舍？`,
          debugging: `请分享一次你排查 ${technology} 相关线上问题的过程，如何定位和止损？`,
          architecture: level === 'senior'
            ? `如果要用 ${technology} 支撑高并发或复杂协作场景，你会怎样设计整体架构？`
            : `如果继续深入学习 ${technology}，你认为下一个最值得突破的能力点是什么？`,
        };

        const ordered = focus
          ? [focus, ...(['fundamentals', 'implementation', 'debugging', 'architecture'] as const).filter(item => item !== focus)]
          : ['fundamentals', 'implementation', 'debugging', 'architecture'] as const;

        return {
          technology,
          level,
          focus: focus ?? 'balanced',
          questions: ordered.map(key => baseQuestions[key]),
          evaluationSignals: [
            `${technology} 基础是否扎实`,
            `${technology} 实战深度是否充分`,
            '是否具备问题定位和复盘能力',
            level === 'senior' ? '是否具备架构权衡能力' : '是否具备持续成长潜力',
          ],
        };
      });

      return {
        success: true,
        data: questions,
      };
    } catch (error) {
      return createToolError('生成技术问题失败', error);
    }
  },
});

const analyzeTechnicalBackgroundTool = tool({
  description: '基于当前候选人简历提取技术画像、技术风险和建议追问方向',
  inputSchema: z.object({
    targetRole: z.string().optional().describe('目标岗位名称'),
    mustHaveSkills: z.array(z.string()).optional().describe('岗位必备技能'),
  }),
  execute: async ({ targetRole, mustHaveSkills }: { targetRole?: string; mustHaveSkills?: string[] }, options: unknown) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const candidate = ctx.currentCandidate;

      if (!candidate) {
        return { success: false, error: '当前没有选中的候选人，请先选择候选人后再分析技术背景' };
      }

      const rawText = candidate.resumeData.rawText ?? '';
      const parsedText = collectStringValues(candidate.resumeData.parsedData).join(' ');
      const material = `${rawText}\n${parsedText}`;
      const detectedSkills = Array.from(new Set([
        ...extractKeywords(material, TECH_KEYWORDS),
        ...(mustHaveSkills ?? []).filter(skill => material.toLowerCase().includes(skill.toLowerCase())),
      ])).slice(0, 12);
      const years = inferYearsOfExperience(material);
      const level = inferCandidateLevel(years);
      const missingCriticalSkills = (mustHaveSkills ?? []).filter(
        skill => !detectedSkills.some(detected => detected.toLowerCase() === skill.toLowerCase()),
      );

      return {
        success: true,
        data: {
          candidateId: candidate.id,
          candidateName: candidate.name,
          targetRole: targetRole ?? '未指定岗位',
          suggestedLevel: level,
          estimatedYearsOfExperience: years,
          coreSkills: detectedSkills,
          missingCriticalSkills,
          focusAreas: buildTechnicalFocusAreas(detectedSkills, level),
          riskSignals: buildTechnicalRiskSignals(rawText, detectedSkills, missingCriticalSkills),
          recommendedAgenda: buildTechnicalAgenda(detectedSkills, level),
        },
      };
    } catch (error) {
      return createToolError('分析技术背景失败', error);
    }
  },
});

const coordinateTechnicalReviewTool = tool({
  description: '将技术面试结论同步给 interview-coordinator，便于生成综合面试计划或汇总结果',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    summary: z.string().min(1).describe('技术评估摘要'),
    technicalScore: z.number().min(1).max(10).describe('技术评分'),
    strengths: z.array(z.string()).min(1).describe('技术优势'),
    risks: z.array(z.string()).min(1).describe('技术风险或待验证点'),
    followUpQuestions: z.array(z.string()).min(1).describe('需要协调员纳入后续流程的问题'),
  }),
  execute: async (
    {
      candidateId,
      summary,
      technicalScore,
      strengths,
      risks,
      followUpQuestions,
    }: {
      candidateId?: string;
      summary: string;
      technicalScore: number;
      strengths: string[];
      risks: string[];
      followUpQuestions: string[];
    },
    options: unknown,
  ) => {
    try {
      const runtime = getAgentRuntime(options);
      const ctx = getIMSContext(runtime);
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '缺少 candidateId，无法同步给 interview-coordinator' };
      }

      const handoffChunk = await runtime.host.handoff(runtime.agentId, 'interview-coordinator', ctx, {
        reason: '同步技术面试结论并请求综合编排',
        message: summary,
        metadata: {
          candidateId: resolvedCandidateId,
          technicalScore,
          strengths,
          risks,
        },
      });
      runtime.emit?.(handoffChunk);

      const coordinatorOutput = await runtime.host.executeAgent(
        'interview-coordinator',
        buildCoordinatorPrompt(resolvedCandidateId, summary, technicalScore, strengths, risks, followUpQuestions, ctx),
        ctx,
      );

      return {
        success: true,
        message: '技术结论已同步给面试协调员',
        data: {
          candidateId: resolvedCandidateId,
          coordinatorOutput,
        },
      };
    } catch (error) {
      return createToolError('同步技术结论失败', error);
    }
  },
});

const saveTechnicalAssessmentTool = tool({
  description: '保存技术评估结果',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    assessment: technicalAssessmentSchema,
  }),
  execute: async (
    { candidateId, assessment }: { candidateId?: string; assessment: TechnicalAssessment },
    options: unknown,
  ) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '缺少 candidateId，无法保存技术评估结果' };
      }

      return {
        success: true,
        message: '技术评估已保存',
        data: {
          candidateId: resolvedCandidateId,
          ...assessment,
          assessedBy: ctx.currentUser.id,
          assessedAt: new Date().toISOString(),
          nextSuggestedAction: assessment.technicalScore >= 8 ? '进入综合面或薪资评估' : '安排针对性加面',
        },
      };
    } catch (error) {
      return createToolError('保存技术评估失败', error);
    }
  },
});

export function createTechInterviewerAgent(): any {
  return {
    id: techInterviewerManifest.id,
    model: techInterviewerManifest.model,
    maxSteps: 6,
    systemPrompt: `你是一位资深技术面试官，专注于把简历信息转成高质量技术评估结论。

你的职责边界：
1. 从候选人简历中提炼真实技术栈、项目深度、复杂度与成长轨迹。
2. 设计有区分度的技术问题，覆盖基础、实现、排障、架构四个层次。
3. 输出明确的技术评分、优势、风险和下一轮验证建议。
4. 需要跨环节协作时，主动把结论同步给 interview-coordinator。

工作要求：
- 结论必须具体，避免泛泛而谈。
- 问题要贴近候选人的技术栈和岗位场景。
- 若上下文信息不足，先用工具补齐候选人画像再下结论。
- 输出尽量结构化，方便 interview-coordinator 聚合。`,
    tools: {
      analyzeTechnicalBackground: analyzeTechnicalBackgroundTool,
      getTechnicalQuestions: getTechnicalQuestionsTool,
      coordinateTechnicalReview: coordinateTechnicalReviewTool,
      saveTechnicalAssessment: saveTechnicalAssessmentTool,
    },
  };
}

agentHost.register(techInterviewerManifest, createTechInterviewerAgent);

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

function extractKeywords(text: string, glossary: readonly string[]): string[] {
  const lowerText = text.toLowerCase();
  return glossary.filter(keyword => lowerText.includes(keyword.toLowerCase()));
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

function buildTechnicalFocusAreas(skills: string[], level: CandidateLevel): string[] {
  const focusAreas = [
    skills[0] ? `${skills[0]} 的项目深度和工程实践` : '核心语言/框架的项目深度',
    skills[1] ? `${skills[1]} 相关的协作与排障能力` : '排障和问题定位能力',
    level === 'senior' ? '架构权衡、性能优化与带团队经验' : '编码习惯、测试意识和学习能力',
  ];

  return focusAreas.filter(Boolean);
}

function buildTechnicalRiskSignals(rawText: string, skills: string[], missingCriticalSkills: string[]): string[] {
  const signals = [
    skills.length <= 2 ? '简历中可验证的技术栈较少，可能需要通过追问确认真实深度' : undefined,
    rawText.length < 200 ? '简历技术描述较短，项目复杂度信息不足' : undefined,
    missingCriticalSkills.length > 0 ? `缺少岗位必备技能：${missingCriticalSkills.join('、')}` : undefined,
  ];

  return signals.filter((item): item is string => Boolean(item));
}

function buildTechnicalAgenda(skills: string[], level: CandidateLevel): string[] {
  return [
    `用 5-8 分钟确认 ${skills.slice(0, 3).join(' / ') || '核心技术栈'} 的真实负责范围`,
    '围绕最近一个关键项目追问需求拆解、方案取舍与结果复盘',
    level === 'senior' ? '增加系统设计或性能优化题' : '增加编码细节和排障思路题',
  ];
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
  technicalScore: number,
  strengths: string[],
  risks: string[],
  followUpQuestions: string[],
  context: IMSContext,
): string {
  const candidateName = context.currentCandidate?.name ?? '未知候选人';

  return [
    `请接收来自 tech-interviewer 的技术面试结论，并用于候选人 ${candidateId} 的后续协调。`,
    `候选人姓名：${candidateName}`,
    `技术评分：${technicalScore}/10`,
    `技术总结：${summary}`,
    `技术优势：${strengths.join('；')}`,
    `技术风险：${risks.join('；')}`,
    `后续建议追问：${followUpQuestions.join('；')}`,
    '请给出下一步应安排的面试动作、协作对象和汇总建议。',
  ].join('\n');
}
