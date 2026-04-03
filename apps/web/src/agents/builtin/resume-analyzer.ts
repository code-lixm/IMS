import { tool } from 'ai';
import { z } from 'zod';
import {
  agentHost,
  type AgentExecutionOptions,
  type AgentManifest,
  type IMSContext,
} from '../host';
import { getIMSContext } from '../context-bridge';

export const resumeAnalyzerManifest: AgentManifest = {
  id: 'resume-analyzer',
  name: '简历分析助手',
  description: '分析候选人简历，提取关键技能、工作经验，并给出匹配度评估',
  capabilities: [
    'resume-parsing',
    'skill-extraction',
    'experience-analysis',
    'job-matching',
  ],
  model: 'gpt-4o',
  category: 'builtin',
  permissions: ['candidate:read', 'resume:read'],
  handoffTargets: ['interview-coordinator', 'salary-advisor'],
  ui: {
    icon: 'file-text',
    color: '#3b82f6',
  },
};

const skillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
const skillCategorySchema = z.enum(['technical', 'soft', 'domain']);

const saveAnalysisSchema = z.object({
  summary: z.string().describe('综合分析摘要'),
  skills: z.array(z.object({
    name: z.string(),
    level: skillLevelSchema,
    category: skillCategorySchema,
  })).min(1).describe('提取的技能列表'),
  experience: z.object({
    totalYears: z.number(),
    relevantYears: z.number(),
    highlights: z.array(z.string()).min(1),
  }).describe('工作经验分析'),
  matchScore: z.number().min(0).max(100).describe('与目标岗位的匹配度评分'),
  recommendations: z.array(z.string()).min(1).describe('面试建议和关注点'),
});

type SaveAnalysisPayload = z.infer<typeof saveAnalysisSchema>;

const getResumeTool = tool({
  description: '获取当前正在查看的候选人的简历数据',
  inputSchema: z.object({
    includeParsed: z.boolean().optional().describe('是否包含解析后的结构化数据'),
  }),
  execute: async ({ includeParsed }: { includeParsed?: boolean }, options: unknown) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const candidate = ctx.currentCandidate;

      if (!candidate) {
        return {
          success: false,
          error: '当前没有选中的候选人，请先在列表中选择一个候选人',
        };
      }

      if (!candidate.resumeData?.rawText?.trim()) {
        return {
          success: false,
          error: '当前候选人缺少可分析的简历正文',
        };
      }

      return {
        success: true,
        data: {
          candidateId: candidate.id,
          name: candidate.name,
          rawText: candidate.resumeData.rawText,
          parsedData: includeParsed ? candidate.resumeData.parsedData : undefined,
          fileUrl: candidate.resumeData.fileUrl,
        },
      };
    } catch (error) {
      return createToolError('读取简历失败', error);
    }
  },
});

const searchJobRequirementsTool = tool({
  description: '查询当前招聘岗位要求，用于后续匹配度分析',
  inputSchema: z.object({
    jobTitle: z.string().optional().describe('职位名称，不传则返回默认在招职位'),
  }),
  execute: async ({ jobTitle }: { jobTitle?: string }) => {
    try {
      const title = jobTitle || '高级前端工程师';

      return {
        success: true,
        data: [
          {
            id: 'job-1',
            title,
            department: '技术部',
            requirements: '具备扎实的前端工程化能力，能够独立推动复杂页面与协作流程落地。',
            requiredSkills: ['TypeScript', 'Vue', '工程化', '跨团队协作'],
            preferredSkills: ['Node.js', '性能优化', 'BFF'],
            minExperience: 5,
          },
        ],
      };
    } catch (error) {
      return createToolError('查询岗位要求失败', error);
    }
  },
});

const extractResumeInsightsTool = tool({
  description: '提取简历中的结构化技能、经验亮点、匹配度和建议追问',
  inputSchema: z.object({
    targetRole: z.string().optional().describe('目标岗位名称'),
    requiredSkills: z.array(z.string()).optional().describe('岗位要求技能'),
  }),
  execute: async ({ targetRole, requiredSkills }: { targetRole?: string; requiredSkills?: string[] }, options: unknown) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const candidate = ctx.currentCandidate;

      if (!candidate) {
        return { success: false, error: '当前没有选中的候选人，无法分析简历' };
      }

      const rawText = candidate.resumeData.rawText ?? '';
      const parsedText = collectStringValues(candidate.resumeData.parsedData).join(' ');
      const material = `${rawText}\n${parsedText}`;
      const years = inferYearsOfExperience(material);
      const skills = extractSkills(material, requiredSkills ?? []);
      const matchedSkills = (requiredSkills ?? []).filter(skill => skills.some(item => item.name.toLowerCase() === skill.toLowerCase()));
      const matchScore = calculateMatchScore(matchedSkills.length, (requiredSkills ?? []).length, years);

      return {
        success: true,
        data: {
          candidateId: candidate.id,
          candidateName: candidate.name,
          targetRole: targetRole ?? '未指定岗位',
          summary: buildResumeSummary(candidate.name, years, skills),
          skills,
          experience: {
            totalYears: years,
            relevantYears: Math.max(1, Math.min(years, years - 1 + matchedSkills.length * 0.4)),
            highlights: buildExperienceHighlights(material, skills),
          },
          matchScore,
          matchedSkills,
          missingSkills: (requiredSkills ?? []).filter(skill => !matchedSkills.includes(skill)),
          recommendations: buildResumeRecommendations(matchScore, skills, requiredSkills ?? []),
        },
      };
    } catch (error) {
      return createToolError('提取简历洞察失败', error);
    }
  },
});

const coordinateResumeScreeningTool = tool({
  description: '将简历分析结论同步给 interview-coordinator，便于安排后续面试协作',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    summary: z.string().min(1).describe('简历分析摘要'),
    matchScore: z.number().min(0).max(100).describe('岗位匹配度'),
    skills: z.array(z.string()).min(1).describe('关键技能'),
    recommendations: z.array(z.string()).min(1).describe('建议协调员采纳的后续动作'),
  }),
  execute: async (
    {
      candidateId,
      summary,
      matchScore,
      skills,
      recommendations,
    }: {
      candidateId?: string;
      summary: string;
      matchScore: number;
      skills: string[];
      recommendations: string[];
    },
    options: unknown,
  ) => {
    try {
      const runtime = getAgentRuntime(options);
      const ctx = getIMSContext(runtime);
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '缺少 candidateId，无法同步简历分析结果' };
      }

      const handoffChunk = await runtime.host.handoff(runtime.agentId, 'interview-coordinator', ctx, {
        reason: '同步简历分析结果并请求安排后续面试',
        message: summary,
        metadata: {
          candidateId: resolvedCandidateId,
          matchScore,
          skills,
        },
      });
      runtime.emit?.(handoffChunk);

      const coordinatorOutput = await runtime.host.executeAgent(
        'interview-coordinator',
        buildCoordinatorPrompt(resolvedCandidateId, summary, matchScore, skills, recommendations, ctx),
        ctx,
      );

      return {
        success: true,
        message: '简历分析已同步给面试协调员',
        data: {
          candidateId: resolvedCandidateId,
          coordinatorOutput,
        },
      };
    } catch (error) {
      return createToolError('同步简历分析失败', error);
    }
  },
});

const saveAnalysisTool = tool({
  description: '将简历分析结果保存到候选人档案中',
  inputSchema: z.object({
    candidateId: z.string().optional().describe('候选人 ID，不传则使用当前候选人'),
    analysis: saveAnalysisSchema,
  }),
  execute: async (
    { candidateId, analysis }: { candidateId?: string; analysis: SaveAnalysisPayload },
    options: unknown,
  ) => {
    try {
      const ctx = getIMSContext(options as { state?: unknown });
      const resolvedCandidateId = candidateId ?? ctx.currentCandidate?.id;

      if (!resolvedCandidateId) {
        return { success: false, error: '没有选中的候选人，无法保存分析结果' };
      }

      return {
        success: true,
        message: '分析结果已保存',
        data: {
          candidateId: resolvedCandidateId,
          ...analysis,
          analyzedBy: ctx.currentUser.id,
          analyzedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return createToolError('保存简历分析失败', error);
    }
  },
});

export function createResumeAnalyzerAgent(): any {
  return {
    id: resumeAnalyzerManifest.id,
    model: resumeAnalyzerManifest.model,
    maxSteps: 6,
    systemPrompt: `你是一名专业的简历分析助手，负责把候选人的简历内容转成招聘流程可直接使用的结构化洞察。

你的职责：
1. 读取并拆解简历中的技能、经历、成果和职业阶段。
2. 对照目标岗位要求，给出匹配度、缺口和建议追问。
3. 输出结构化结果，方便技术面、HR 面和薪资评估复用。
4. 需要进入后续流程时，把结论同步给 interview-coordinator。

工作要求：
- 不要只复述简历，要提炼真正可用的判断。
- 优先识别项目复杂度、职责边界、成长潜力和关键风险。
- 信息不足时先说明不确定项，再给出建议的验证路径。`,
    tools: {
      getResume: getResumeTool,
      searchJobRequirements: searchJobRequirementsTool,
      extractResumeInsights: extractResumeInsightsTool,
      coordinateResumeScreening: coordinateResumeScreeningTool,
      saveAnalysis: saveAnalysisTool,
    },
  };
}

agentHost.register(resumeAnalyzerManifest, createResumeAnalyzerAgent);

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

function extractSkills(material: string, requiredSkills: string[]): Array<{
  name: string;
  level: z.infer<typeof skillLevelSchema>;
  category: z.infer<typeof skillCategorySchema>;
}> {
  const glossary = Array.from(new Set([
    'TypeScript',
    'JavaScript',
    'Vue',
    'React',
    'Node.js',
    'Bun',
    '工程化',
    '性能优化',
    '跨团队协作',
    '项目管理',
    '产品沟通',
    ...requiredSkills,
  ]));

  return glossary
    .filter(skill => material.toLowerCase().includes(skill.toLowerCase()))
    .slice(0, 10)
    .map((skill) => ({
      name: skill,
      level: /主导|架构|负责人|owner/i.test(material) ? 'advanced' : 'intermediate',
      category: /协作|沟通|管理/i.test(skill) ? 'soft' : /产品|招聘|金融|教育/i.test(skill) ? 'domain' : 'technical',
    }));
}

function calculateMatchScore(matchedSkillCount: number, requiredSkillCount: number, years: number): number {
  const skillScore = requiredSkillCount === 0 ? 75 : Math.round((matchedSkillCount / requiredSkillCount) * 70);
  const experienceBonus = Math.min(20, years * 3);
  return Math.min(100, skillScore + experienceBonus + 5);
}

function buildResumeSummary(
  candidateName: string,
  years: number,
  skills: Array<{ name: string }>,
): string {
  return `${candidateName} 具备约 ${years} 年相关经验，核心技能集中在 ${skills.slice(0, 4).map(skill => skill.name).join('、') || '通用能力'}，整体简历适合进入进一步结构化面试验证。`;
}

function buildExperienceHighlights(
  material: string,
  skills: Array<{ name: string }>,
): string[] {
  return [
    skills[0] ? `在 ${skills[0].name} 相关项目中有明确实践痕迹` : '具备一定项目实践痕迹',
    /负责|主导|推进/i.test(material) ? '简历中体现出负责或推动关键任务的经历' : '需要进一步确认在项目中的职责边界',
    /优化|提升|增长|降本/i.test(material) ? '简历中出现结果导向的优化或业务成果信号' : '建议在面试中追问量化成果',
  ];
}

function buildResumeRecommendations(
  matchScore: number,
  skills: Array<{ name: string }>,
  requiredSkills: string[],
): string[] {
  const missing = requiredSkills.filter(skill => !skills.some(item => item.name.toLowerCase() === skill.toLowerCase()));

  return [
    matchScore >= 80 ? '建议进入正式面试流程，重点验证项目复杂度与影响范围' : '建议先做针对性初筛，验证技能真实性和岗位动机',
    skills[0] ? `围绕 ${skills[0].name} 设计深挖题，确认技术深度` : '优先验证候选人的核心技术栈',
    missing.length > 0 ? `重点补问岗位缺口：${missing.join('、')}` : '岗位要求与简历表述基本匹配，可进入多维评估',
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
  matchScore: number,
  skills: string[],
  recommendations: string[],
  context: IMSContext,
): string {
  const candidateName = context.currentCandidate?.name ?? '未知候选人';

  return [
    `请接收来自 resume-analyzer 的简历结论，并用于候选人 ${candidateId} 的后续协作。`,
    `候选人姓名：${candidateName}`,
    `简历摘要：${summary}`,
    `匹配度：${matchScore}/100`,
    `关键技能：${skills.join('、')}`,
    `建议动作：${recommendations.join('；')}`,
    '请给出后续应交由哪些专业 Agent 跟进，以及如何安排整体面试流程。',
  ].join('\n');
}
