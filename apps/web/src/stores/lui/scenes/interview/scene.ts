import { computed, ref, type ComputedRef } from "vue";
import { luiApi, type WorkflowState } from "@/api/lui";
import { reportAppError } from "@/lib/errors/normalize";
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

  const workflow = ref<WorkflowState | null>(null);
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

  async function loadWorkflow(nextCandidateId: string) {
    try {
      const workflows = await luiApi.listWorkflows(nextCandidateId);
      const activeWorkflow = workflows.items.find(
        (item) => item.status === "active" || item.status === "paused",
      );
      workflow.value = activeWorkflow ?? null;
    } catch {
      workflow.value = null;
    }
  }

  async function selectWorkflowStage(stage: WorkflowState["currentStage"]) {
    if (!workflow.value || workflow.value.currentStage === stage) {
      return;
    }

    try {
      workflow.value = await luiApi.updateWorkflow(workflow.value.id, {
        currentStage: stage,
      });
    } catch (error) {
      notifyError(
        reportAppError("workflow/set-stage", error, {
          title: "切换流程阶段失败",
          fallbackMessage: "无法切换到目标流程阶段",
        }),
      );
    }
  }

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

      await loadWorkflow(nextCandidateId);
    } finally {
      isSyncingCandidateWorkspace.value = false;
    }
  }

  function reset() {
    workflow.value = null;
  }

  return {
    workflow,
    currentCandidate,
    isSyncingCandidateWorkspace,
    ensureWorkspace,
    loadWorkflow,
    selectWorkflowStage,
    reset,
  };
}
