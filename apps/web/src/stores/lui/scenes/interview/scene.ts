import { computed, ref, type ComputedRef } from "vue";
import { useCandidatesStore } from "@/stores/candidates";
import { useLuiStore } from "@/stores/lui";

interface InterviewSceneOptions {
  candidateId: ComputedRef<string | null>;
  store: ReturnType<typeof useLuiStore>;
  candidatesStore: ReturnType<typeof useCandidatesStore>;
  notifyError: (payload: unknown) => void;
}

export function useInterviewScene(options: InterviewSceneOptions) {
  const { candidateId, store, candidatesStore, notifyError } = options;
  const isSyncingCandidateWorkspace = ref(false);

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
      const fallbackAgentId = store.selectedAgentId ?? store.defaultAgent?.id ?? null;
      const hasModelSelection = Boolean(store.selectedModelId && store.selectedModelProvider);
      const needsAgentDefault = !selectedConversation?.agentId && Boolean(fallbackAgentId);
      const needsModelDefault = hasModelSelection
        && (!selectedConversation?.modelId || !selectedConversation?.modelProvider);

      if (needsAgentDefault || needsModelDefault) {
        await store.updateConversationAiConfig({
          agentId: needsAgentDefault ? fallbackAgentId : undefined,
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
