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
  const { candidateId, store, candidatesStore } = options;
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
        await candidatesStore.fetchOne(nextCandidateId).catch(() => {
          return undefined;
        });
      }

      const existingConversation = store.conversations.find(
        (conversation) => conversation.candidateId === nextCandidateId,
      );

      if (existingConversation) {
        if (store.selectedId !== existingConversation.id) {
          await store.selectConversation(existingConversation.id);
        }
      } else {
        const conversation = await store.createConversation(undefined, nextCandidateId);
        if (store.selectedId !== conversation.id) {
          await store.selectConversation(conversation.id);
        }
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
