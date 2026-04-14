import type { Agent, Conversation } from "../../types";
import type {
  LuiAgentSelectorProfile,
  LuiConversationPolicy,
} from "../types";

export const INTERVIEW_AGENT_SELECTOR_PROFILE: LuiAgentSelectorProfile = {
  title: "面试专家",
  subtitle: "智能面试助手",
  description: "帮你筛选简历、梳理信息并评估候选人。",
  skills: ["简历分析", "信息梳理", "综合评估"],
  tools: ["读取简历", "整理纪要", "输出报告"],
  entrySkill: "interview-orchestrator",
  supportSkills: [],
  skillSectionLabel: "核心能力",
  toolSectionLabel: "可用工具",
  summaryText:
    "当前会话将围绕候选人材料与面试信息进行分析和评估，不再暴露流程阶段切换。",
};

export function createInterviewConversationPolicy(): LuiConversationPolicy {
  return {
    sceneId: "interview",
    displayName: "面试场景",
    beforeCreateConversation(conversations, candidateId, options) {
      if (options?.forceCreate) {
        return {};
      }

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
    (conversation) => conversation.candidateId === candidateId,
  );
}

export function isInterviewAgent(agent: Agent | null | undefined) {
  return agent?.sceneAffinity === "interview";
}
