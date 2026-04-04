import type { Agent, Conversation } from "../../types";
import type {
  LuiAgentSelectorProfile,
  LuiConversationPolicy,
} from "../types";

export const INTERVIEW_AGENT_SELECTOR_PROFILE: LuiAgentSelectorProfile = {
  title: "面试专家",
  subtitle: "智能面试助手",
  description: "帮你筛选简历、设计面试题、评估候选人。",
  skills: ["简历分析", "题目设计", "综合评估"],
  tools: ["读取简历", "生成题目", "输出报告"],
  entrySkill: "interview-orchestrator",
  supportSkills: [],
  skillSectionLabel: "工作流技能",
  toolSectionLabel: "可用工具",
  summaryText:
    "当前会话将通过这位面试专家统一调度技能链与工具能力，不再暴露底层运行实例。",
};

export function createInterviewConversationPolicy(): LuiConversationPolicy {
  return {
    sceneId: "interview",
    displayName: "面试场景",
    beforeCreateConversation(conversations, candidateId) {
      if (!candidateId) {
        return {};
      }

      const existingConversation = conversations.find(
        (conversation) => conversation.candidateId === candidateId,
      );

      return existingConversation ? { reuseId: existingConversation.id } : {};
    },
  };
}

export function filterInterviewConversations(
  conversations: Conversation[],
  candidateId: string | null,
) {
  if (!candidateId) {
    return conversations.filter((conversation) => conversation.candidateId === null);
  }

  return conversations.filter(
    (conversation) =>
      conversation.candidateId === null || conversation.candidateId === candidateId,
  );
}

export function isInterviewAgent(agent: Agent | null | undefined) {
  return agent?.sceneAffinity === "interview";
}
