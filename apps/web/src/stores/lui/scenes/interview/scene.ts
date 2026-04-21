import { computed, ref, type ComputedRef } from "vue";
import { useCandidatesStore } from "@/stores/candidates";
import { useLuiStore } from "@/stores/lui";

const DEFAULT_INTERVIEW_AGENT_ID = "agent_builtin_interview";

interface InterviewSceneOptions {
  candidateId: ComputedRef<string | null>;
  store: ReturnType<typeof useLuiStore>;
  candidatesStore: ReturnType<typeof useCandidatesStore>;
  notifyError: (payload: unknown) => void;
}

export function useInterviewScene(options: InterviewSceneOptions) {
  const { candidateId, store, candidatesStore, notifyError } = options;
  const isSyncingCandidateWorkspace = ref(false);

  function resolveInterviewWorkflowAgentId() {
    const builtinInterviewAgent = store.agents.find(
      (agent) => agent.id === DEFAULT_INTERVIEW_AGENT_ID,
    );
    if (builtinInterviewAgent) {
      return builtinInterviewAgent.id;
    }

    return store.agents.find(
      (agent) => agent.sceneAffinity === "interview" && agent.mode === "workflow",
    )?.id ?? null;
  }

  const currentCandidate = computed(() => {
    const activeCandidateId = candidateId.value;
    if (!activeCandidateId) {
      return null;
    }

    return candidatesStore.current?.candidate.id === activeCandidateId
      ? candidatesStore.current.candidate
      : null;
  });

  async function ensureWorkspace(nextCandidateId: string) {
    isSyncingCandidateWorkspace.value = true;

    try {
      if (candidatesStore.current?.candidate.id !== nextCandidateId) {
        try {
          await candidatesStore.fetchOne(nextCandidateId);
        } catch (error) {
          notifyError(error);
          return;
        }
      }

      if (candidatesStore.current?.candidate.id !== nextCandidateId) {
        notifyError(new Error("候选人不存在或已失效，无法初始化当前面试工作台"));
        return;
      }

      const existingConversation = store.conversations.find(
        (conversation) => conversation.candidateId === nextCandidateId,
      );

      let targetConversationId: string;
      if (existingConversation) {
        targetConversationId = existingConversation.id;
        if (store.selectedId !== existingConversation.id) {
          await store.selectConversation(existingConversation.id);
        }
      } else {
        const conversation = await store.createConversation(undefined, nextCandidateId);
        targetConversationId = conversation.id;
        if (store.selectedId !== conversation.id) {
          await store.selectConversation(conversation.id);
        }
      }

      const selectedConversation = store.conversations.find(
        (conversation) => conversation.id === targetConversationId,
      );
      const interviewWorkflowAgentId = resolveInterviewWorkflowAgentId();
      const hasModelSelection = Boolean(store.selectedModelId && store.selectedModelProvider);
      const resolvedAgentId = selectedConversation?.agentResolution?.resolvedAgentId ?? selectedConversation?.agentId ?? null;
      const needsInterviewWorkflowAgent = Boolean(
        interviewWorkflowAgentId && resolvedAgentId !== interviewWorkflowAgentId,
      );
      const needsModelDefault = hasModelSelection
        && (!selectedConversation?.modelId || !selectedConversation?.modelProvider);

      if (interviewWorkflowAgentId && store.selectedAgentId !== interviewWorkflowAgentId) {
        store.selectedAgentId = interviewWorkflowAgentId;
      }

      if (needsInterviewWorkflowAgent || needsModelDefault) {
        await store.updateConversationAiConfig({
          agentId: needsInterviewWorkflowAgent ? interviewWorkflowAgentId : undefined,
          modelProvider: needsModelDefault ? store.selectedModelProvider : undefined,
          modelId: needsModelDefault ? store.selectedModelId : undefined,
        });
      }
    } finally {
      isSyncingCandidateWorkspace.value = false;
    }
  }

  function reset() {
    return;
  }

  return {
    currentCandidate,
    isSyncingCandidateWorkspace,
    ensureWorkspace,
    reset,
  };
}
