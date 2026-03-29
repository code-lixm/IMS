import { computed, onBeforeUnmount, ref } from "vue";
import { importApi } from "@/api/import";
import type { ImportBatchListData, ImportFileListData } from "@ims/shared";

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
      loading.value = true;
      try {
        batches.value = (await importApi.list()).items;
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

  async function loadBatchFiles(batchId: string, force = false) {
    if (!force && batchFiles.value[batchId]) {
      return batchFiles.value[batchId];
    }

    loadingFiles.value = {
      ...loadingFiles.value,
      [batchId]: true,
    };

    try {
      const files = (await importApi.files(batchId)).items;
      batchFiles.value = {
        ...batchFiles.value,
        [batchId]: files,
      };
      return files;
    } finally {
      loadingFiles.value = {
        ...loadingFiles.value,
        [batchId]: false,
      };
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
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, true) : Promise.resolve(),
    ]);
  }

  async function rerunScreening(batchId: string) {
    await importApi.rerunScreening(batchId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, true) : Promise.resolve(),
    ]);
  }

  async function cancelBatch(batchId: string) {
    await importApi.cancel(batchId);
    await Promise.all([
      refresh(),
      expandedBatches.value.has(batchId) ? loadBatchFiles(batchId, true) : Promise.resolve(),
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
    cancelBatch,
    deleteBatch,
  };
}
