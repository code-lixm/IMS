import type { Conversation } from "../types";

export interface LuiConversationPolicyDecision {
  reuseId?: string;
  error?: string;
}

export interface LuiConversationPolicy {
  sceneId: string;
  displayName: string;
  beforeCreateConversation(
    conversations: Conversation[],
    candidateId: string | null,
    options?: { forceCreate?: boolean },
  ): LuiConversationPolicyDecision;
}

export interface LuiAgentSelectorProfile {
  title: string;
  subtitle: string;
  description: string;
  skills: string[];
  tools: string[];
  entrySkill: string;
  supportSkills: string[];
  skillSectionLabel?: string;
  toolSectionLabel?: string;
  summaryText?: string;
}
