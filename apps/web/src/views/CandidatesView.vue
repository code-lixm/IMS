<template>
  <AppPageShell class="flex h-screen flex-col overflow-hidden">
    <div
      v-if="initialSyncLoading"
      class="flex min-h-0 flex-1 items-center justify-center p-6"
    >
      <Card class="w-full max-w-md p-8 text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Spinner class="h-6 w-6 text-primary" />
        </div>
        <h2 class="text-lg font-semibold tracking-tight">正在同步中</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          正在拉取候选人和面试列表，请稍候…
        </p>
      </Card>
    </div>

    <template v-else>
      <div data-onboarding="candidates-header">
        <CandidatePageHeader
          v-model:search="search"
          :search-suggestions="searchSuggestions"
          :is-importing="isImporting"
          :import-activity-count="importActivity.activeBatchCount.value"
          :sync-loading="syncStore.loading"
          :sync-error="syncStore.status.lastError"
          :sync-enabled="syncStore.status.enabled"
          :reset-sync-loading="syncStore.resetLoading"
          @search="scheduleSearch"
          @import="triggerImport"
          @import-imr="handleImportImr"
          @goto-import="goToImportPage"
          @sync="runSyncNow"
          @reset-sync="runResetSyncNow"
        />
      </div>

      <AppPageContent class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CandidateFeedbackBanner :feedback="feedback" class="mb-4 shrink-0" @dismiss="clearFeedback" />

        <div class="flex min-h-0 flex-1 overflow-hidden" data-onboarding="candidates-list">
          <CandidateList
            class="flex-1 min-w-0"
            :search-keyword="search"
            :items="store.list"
            :loading="store.loading"
            :total="store.total"
            :page="store.page"
            :page-size="store.pageSize"
            :export-loading-id="exportLoadingId"
            :delete-loading-id="deleteLoadingId"
            :has-selection="batchSelection.hasSelection.value"
            :selected-count="batchSelection.selectedCount.value"
            :is-all-selected-on-page="pageSelectionState.isAllSelected"
            :is-indeterminate-on-page="pageSelectionState.isIndeterminate"
            :share-loading="isBatchSharing"
            :is-selected="batchSelection.isSelected"
            @import="triggerImport"
            @import-imr="handleImportImr"
            @select="goToCandidateDetail"
            @open-workspace="openWorkspace"
            @export="exportCandidate"
            @delete="handleDelete"
            @page-change="goToPage"
            @page-size-change="changePageSize"
            @toggle-selection="handleToggleSelection"
            @toggle-all="handleToggleAll"
            @clear-selection="handleClearSelection"
            @batch-share="openDeviceSelectDialog"
          />
        </div>
      </AppPageContent>

      <DeviceSelectDialog
        :open="deviceSelectDialogOpen"
        :selected-count="batchSelection.selectedCount.value"
        @update:open="deviceSelectDialogOpen = $event"
        @send="handleBatchShare"
      />
    </template>
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CandidateFeedbackBanner from "@/components/candidates/candidate-feedback-banner.vue";
import CandidateList from "@/components/candidates/candidate-list.vue";
import CandidatePageHeader from "@/components/candidates/candidate-page-header.vue";
import DeviceSelectDialog from "@/components/candidates/device-select-dialog.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import Card from "@/components/ui/card.vue";
import Spinner from "@/components/ui/spinner/Spinner.vue";
import { useCandidatePageActions } from "@/composables/candidates/use-candidate-page-actions";
import { useCandidateSearch } from "@/composables/candidates/use-candidate-search";
import { useCandidateBatchSelection } from "@/composables/candidates/use-candidate-batch-selection";
import { useImportBatches } from "@/composables/import/use-import-batches";
import { shareApi } from "@/api/share";
import { useCandidatesStore } from "@/stores/candidates";
import { useOnboardingStore } from "@/stores/onboarding";
import { useSyncStore } from "@/stores/sync";

const store = useCandidatesStore();
const syncStore = useSyncStore();
const importActivity = useImportBatches();
const batchSelection = useCandidateBatchSelection();
const onboardingStore = useOnboardingStore();
const initialSyncLoading = ref(true);

const { search, searchSuggestions, initialize, scheduleSearch } = useCandidateSearch(store);
const {
  feedback,
  isImporting,
  exportLoadingId,
  deleteLoadingId,
  clearFeedback,
    goToCandidateDetail,
    goToImportPage,
    triggerImport,
    triggerImrImport,
    openWorkspace,
    exportCandidate,
    deleteCandidate,
    setFeedback,
  } = useCandidatePageActions();

const deviceSelectDialogOpen = ref(false);
const isBatchSharing = ref(false);

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)));

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

// 计算当前页的选择状态
const pageSelectionState = computed(() => {
  return batchSelection.getSelectionStateForPage(store.list);
});

onMounted(async () => {
  onboardingStore.setInitialSyncReady(false);
  initialSyncLoading.value = true;

  try {
    await Promise.all([
      importActivity.initialize(),
      syncStore.fetchStatus(),
    ]);

    const shouldRunInitialSync = !syncStore.status.lastSyncAt;
    if (shouldRunInitialSync) {
      try {
        await syncStore.runNow();
      } catch (error: unknown) {
        setFeedback({
          tone: "error",
          message: `首次同步失败：${getErrorMessage(error)}`,
        });
      }
    }

    await initialize();
  } finally {
    initialSyncLoading.value = false;
    onboardingStore.setInitialSyncReady(true);
  }
});

async function handleDelete(candidateId: string) {
  await deleteCandidate(candidateId);
  await store.refreshCurrentPage();
}

async function handleImportImr() {
  const result = await triggerImrImport();
  if (result?.result === "created" || result?.result === "merged") {
    await store.refreshCurrentPage();
  }
}

async function runSyncNow() {
  await syncStore.runNow();
  await store.refreshCurrentPage();
}

async function runResetSyncNow() {
  try {
    const result = await syncStore.resetAndRun();
    await store.refreshCurrentPage();
    setFeedback({
      tone: "success",
      message: `已删除 ${result.clearedCandidates} 条本地候选人记录，并重新同步 ${result.syncedCandidates} 条候选人。`,
    });
  } catch (error: unknown) {
    setFeedback({
      tone: "error",
      message: `重置并重新导入失败：${getErrorMessage(error)}`,
    });
  }
}

async function goToPage(targetPage: number) {
  if (targetPage === store.page || targetPage < 1 || targetPage > totalPages.value) {
    return;
  }

  await store.setPage(targetPage);
}

async function changePageSize(nextPageSize: number) {
  if (!Number.isFinite(nextPageSize) || nextPageSize === store.pageSize) {
    return;
  }

  await store.setPageSize(nextPageSize);
}

// 批量选择事件处理
function handleToggleSelection(candidateId: string) {
  batchSelection.toggleSelection(candidateId);
}

function handleToggleAll() {
  const pageIds = store.list.map((item) => item.id);
  batchSelection.toggleAll(pageIds);
}

function handleClearSelection() {
  batchSelection.clearSelection();
}

function openDeviceSelectDialog() {
  if (!batchSelection.hasSelection.value) return;
  deviceSelectDialogOpen.value = true;
}

// 批量分享
async function handleBatchShare(device: {
  ip: string;
  port: number;
  deviceId?: string;
  name: string;
}) {
  const candidateIds = batchSelection.getSelectedIds();
  if (candidateIds.length === 0) return;

  isBatchSharing.value = true;
  try {
    await shareApi.batchSend(candidateIds, device);
    setFeedback({
      tone: "success",
      message: `已成功分享 ${candidateIds.length} 位候选人到 ${device.name}`,
    });
    batchSelection.clearSelection();
    deviceSelectDialogOpen.value = false;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    setFeedback({
      tone: "error",
      message: `分享失败：${message}`,
    });
  } finally {
    isBatchSharing.value = false;
  }
}
</script>
