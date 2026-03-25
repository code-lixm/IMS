import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { WorkspaceData } from "@ims/shared";
import { api } from "@/api/client";
import { importApi } from "@/api/import";
import { shareApi } from "@/api/share";
import { pickFiles } from "@/composables/use-file-picker";
import type { CandidateActionFeedback } from "./types";

const IMPORT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.zip";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

export function useCandidatePageActions() {
  const router = useRouter();
  const feedback = ref<CandidateActionFeedback | null>(null);
  const isImporting = ref(false);
  const workspaceLoadingId = ref<string | null>(null);
  const exportLoadingId = ref<string | null>(null);

  const hasFeedback = computed(() => feedback.value !== null);

  function setFeedback(nextFeedback: CandidateActionFeedback | null) {
    feedback.value = nextFeedback;
  }

  function clearFeedback() {
    feedback.value = null;
  }

  function goToCandidateDetail(candidateId: string) {
    void router.push(`/candidates/${candidateId}`);
  }

  function goToImportPage() {
    void router.push("/import");
  }

  async function triggerImport() {
    if (isImporting.value) {
      return;
    }

    const files = await pickFiles({ accept: IMPORT_ACCEPT, multiple: true });
    const paths = files.map((file) => file.path).filter(Boolean);
    if (!paths.length) {
      return;
    }

    isImporting.value = true;
    try {
      await importApi.create(paths);
      setFeedback({
        tone: "success",
        message: `已创建 ${paths.length} 个导入任务，正在跳转到导入页。`,
      });
      goToImportPage();
    } catch (error: unknown) {
      setFeedback({
        tone: "error",
        message: `导入失败：${getErrorMessage(error)}`,
      });
    } finally {
      isImporting.value = false;
    }
  }

  async function openWorkspace(candidateId: string) {
    if (workspaceLoadingId.value) {
      return;
    }

    workspaceLoadingId.value = candidateId;
    try {
      const workspace = await api<WorkspaceData>(`/api/candidates/${candidateId}/workspace`, {
        method: "POST",
      });
      window.open(workspace.url, "_blank", "noopener,noreferrer");
      setFeedback({
        tone: "info",
        message: "AI 工作台已在新窗口打开。",
      });
    } catch (error: unknown) {
      setFeedback({
        tone: "error",
        message: `启动工作台失败：${getErrorMessage(error)}`,
      });
    } finally {
      workspaceLoadingId.value = null;
    }
  }

  async function exportCandidate(candidateId: string) {
    if (exportLoadingId.value) {
      return;
    }

    exportLoadingId.value = candidateId;
    try {
      const result = await shareApi.export(candidateId);
      setFeedback({
        tone: "success",
        message: `导出成功：${result.filePath}`,
      });
    } catch (error: unknown) {
      setFeedback({
        tone: "error",
        message: `导出失败：${getErrorMessage(error)}`,
      });
    } finally {
      exportLoadingId.value = null;
    }
  }

  return {
    feedback,
    hasFeedback,
    isImporting,
    workspaceLoadingId,
    exportLoadingId,
    clearFeedback,
    goToCandidateDetail,
    goToImportPage,
    triggerImport,
    openWorkspace,
    exportCandidate,
  };
}
