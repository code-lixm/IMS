import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { candidatesApi } from "@/api/candidates";
import { importApi } from "@/api/import";
import { shareApi } from "@/api/share";
import { useImportPreferences } from "@/composables/import/use-import-preferences";
import { pickFiles } from "@/composables/use-file-picker";
import type { CandidateActionFeedback } from "./types";

const IMPORT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.zip";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

export function useCandidatePageActions() {
  const router = useRouter();
  const { autoScreen } = useImportPreferences();
  const feedback = ref<CandidateActionFeedback | null>(null);
  const isImporting = ref(false);
  const exportLoadingId = ref<string | null>(null);
  const deleteLoadingId = ref<string | null>(null);

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
    if (!files.length) {
      return;
    }

    isImporting.value = true;
    try {
      await importApi.upload(files.map((file) => file.file), autoScreen.value);
      setFeedback({
        tone: "success",
        message: `已创建 ${files.length} 个导入任务，正在跳转到导入页。`,
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

  function openWorkspace(candidateId: string) {
    // Navigate to LUI with candidateId pre-selected
    router.push({
      path: "/lui",
      query: { candidateId },
    });
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

  async function deleteCandidate(candidateId: string) {
    if (deleteLoadingId.value) {
      return;
    }

    deleteLoadingId.value = candidateId;
    try {
      await candidatesApi.delete(candidateId);
      setFeedback({
        tone: "success",
        message: "删除成功",
      });
    } catch (error: unknown) {
      setFeedback({
        tone: "error",
        message: `删除失败：${getErrorMessage(error)}`,
      });
    } finally {
      deleteLoadingId.value = null;
    }
  }

  return {
    feedback,
    hasFeedback,
    isImporting,
    exportLoadingId,
    deleteLoadingId,
    clearFeedback,
    goToCandidateDetail,
    goToImportPage,
    triggerImport,
    openWorkspace,
    exportCandidate,
    deleteCandidate,
  };
}
