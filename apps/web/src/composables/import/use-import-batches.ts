import { computed, onBeforeUnmount, ref } from "vue";
import { importApi } from "@/api/import";
import type {
  BatchScreeningConfig,
  ImportFileListData as BaseImportFileListData,
  ImportBatch as BaseImportBatch,
  InterviewImportBatchSummary,
  UpdateImportBatchScreeningConfigInput,
} from "@ims/shared";

interface ImportBatchListItem extends BaseImportBatch {
  groupId: string | null;
  batchScreeningConfig: BatchScreeningConfig;
  templateId: string | null;
  analysisTotalFiles: number;
  analysisCompletedFiles: number;
  analysisPendingFiles: number;
  analysisRunningFiles: number;
  summaryJson?: string | null;
  summary?: InterviewImportBatchSummary | null;
}

interface ImportBatchListData {
  items: ImportBatchListItem[];
}

interface ImportFileListData extends BaseImportFileListData {}

const POLL_INTERVAL_MS = 3000;

function hasActiveBatch(items: ImportBatchListData["items"]) {
  return items.some((batch) => batch.status === "processing" || batch.status === "queued");
}

function getActiveBatchCount(items: ImportBatchListData["items"]) {
  return items.filter((batch) => batch.status === "processing" || batch.status === "queued").length;
}

export function useImportBatches() {
  const batches = ref<ImportBatchListData["items"]>([]);
  const loading = ref(false);
  const expandedBatches = ref(new Set<string>());
  const batchFiles = ref<Record<string, ImportFileListData["items"]>>({});
  const loadingFiles = ref<Record<string, boolean>>({});

  const hasProcessingBatches = computed(() => hasActiveBatch(batches.value));
  const activeBatchCount = computed(() => getActiveBatchCount(batches.value));

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let refreshPromise: Promise<void> | null = null;

  function pruneStaleBatchState(items: ImportBatchListData["items"]) {
    const batchIds = new Set(items.map((batch) => batch.id));

    const nextExpanded = new Set(Array.from(expandedBatches.value).filter((batchId) => batchIds.has(batchId)));
    if (nextExpanded.size !== expandedBatches.value.size) {
      expandedBatches.value = nextExpanded;
    }

    const nextBatchFiles = Object.fromEntries(
      Object.entries(batchFiles.value).filter(([batchId]) => batchIds.has(batchId)),
    );
    if (Object.keys(nextBatchFiles).length !== Object.keys(batchFiles.value).length) {
      batchFiles.value = nextBatchFiles;
    }

    const nextLoadingFiles = Object.fromEntries(
      Object.entries(loadingFiles.value).filter(([batchId]) => batchIds.has(batchId)),
    );
    if (Object.keys(nextLoadingFiles).length !== Object.keys(loadingFiles.value).length) {
      loadingFiles.value = nextLoadingFiles;
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedulePoll() {
    stopPolling();
    if (disposed || !hasProcessingBatches.value) {
      return;
    }

    pollTimer = setTimeout(async () => {
      await refresh();
    }, POLL_INTERVAL_MS);
  }

  async function refresh() {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const showPageLoading = batches.value.length === 0;
      if (showPageLoading) {
        loading.value = true;
      }

      try {
        const items = ((await importApi.list()).items as Array<Partial<ImportBatchListItem> & BaseImportBatch>).map((item) => ({
          ...item,
          groupId: item.groupId ?? null,
          batchScreeningConfig: item.batchScreeningConfig ?? {
            groupId: item.groupId ?? null,
            passThreshold: 80,
            reviewThreshold: 70,
            learningEnabled: false,
          },
          summaryJson: item.summaryJson ?? null,
          summary: item.summary ?? null,
        })) as ImportBatchListData["items"];
        batches.value = items;
        pruneStaleBatchState(items);

        const expandedIds = Array.from(expandedBatches.value);
        if (expandedIds.length > 0) {
          await Promise.all(expandedIds.map((batchId) => loadBatchFiles(batchId, { force: true, silent: true })));
        }
      } finally {
        loading.value = false;
        refreshPromise = null;
        schedulePoll();
      }
    })();

    return refreshPromise;
  }

  async function initialize() {
    await refresh();
  }

  async function loadBatchFiles(batchId: string, options: { force?: boolean; silent?: boolean } = {}) {
    const { force = false, silent = false } = options;

    if (!force && batchFiles.value[batchId]) {
      return batchFiles.value[batchId];
    }

    if (!silent) {
      loadingFiles.value = {
        ...loadingFiles.value,
        [batchId]: true,
      };
    }

    try {
      const files = (await importApi.files(batchId)).items;
      batchFiles.value = {
        ...batchFiles.value,
        [batchId]: files,
      };
      return files;
    } finally {
      if (!silent) {
        loadingFiles.value = {
          ...loadingFiles.value,
          [batchId]: false,
        };
      }
    }
  }

  async function toggleFiles(batchId: string) {
    const nextExpanded = new Set(expandedBatches.value);

    if (nextExpanded.has(batchId)) {
      nextExpanded.delete(batchId);
      expandedBatches.value = nextExpanded;
      return;
    }

    nextExpanded.add(batchId);
    expandedBatches.value = nextExpanded;

    await loadBatchFiles(batchId);
  }

  async function retryFailed(batchId: string) {
    await importApi.retryFailed(batchId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
  }

  async function rerunScreening(batchId: string, groupId?: string, templateId?: string) {
    const result = await importApi.rerunScreening(batchId, groupId, templateId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
    return result;
  }

  async function updateBatchScreeningConfig(batchId: string, payload: UpdateImportBatchScreeningConfigInput) {
    await importApi.updateBatchScreeningConfig(batchId, payload);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
  }

  async function rerunFileScreening(taskId: string, batchId: string, groupId?: string, templateId?: string) {
    await importApi.rerunFileScreening(taskId, groupId, templateId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
  }

  async function updateTaskScreeningScore(taskId: string, batchId: string, score: number, reason?: string | null) {
    await importApi.updateTaskScreeningScore(taskId, { score, reason });
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
  }

  async function clearTaskScreeningScore(taskId: string, batchId: string) {
    await importApi.clearTaskScreeningScore(taskId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
  }

  async function clearBatchScoreFeedbacks(batchId: string) {
    const result = await importApi.clearBatchScoreFeedbacks(batchId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
    return result;
  }

  async function retryUniversityVerification(taskId: string, batchId: string) {
    await importApi.retryUniversityVerification(taskId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
  }

  async function cancelBatch(batchId: string) {
    await importApi.cancel(batchId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, { force: true }) : Promise.resolve(),
    ]);
  }

  async function deleteBatch(batchId: string) {
    await importApi.remove(batchId);

    const nextExpanded = new Set(expandedBatches.value);
    nextExpanded.delete(batchId);
    expandedBatches.value = nextExpanded;

    const nextBatchFiles = { ...batchFiles.value };
    delete nextBatchFiles[batchId];
    batchFiles.value = nextBatchFiles;

    const nextLoadingFiles = { ...loadingFiles.value };
    delete nextLoadingFiles[batchId];
    loadingFiles.value = nextLoadingFiles;

    await refresh();
  }

  onBeforeUnmount(() => {
    disposed = true;
    stopPolling();
  });

  return {
    batches,
    loading,
    expandedBatches,
    batchFiles,
    loadingFiles,
    hasProcessingBatches,
    activeBatchCount,
    initialize,
    refresh,
    toggleFiles,
    retryFailed,
    rerunScreening,
    updateBatchScreeningConfig,
    rerunFileScreening,
    updateTaskScreeningScore,
    clearTaskScreeningScore,
    clearBatchScoreFeedbacks,
    retryUniversityVerification,
    cancelBatch,
    deleteBatch,
  };
}
