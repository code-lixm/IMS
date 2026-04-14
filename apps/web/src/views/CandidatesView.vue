<template>
  <AppPageShell class="flex h-screen flex-col overflow-hidden">
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
        @create="setCreateDialogOpen(true)"
        @import="triggerImport"
        @goto-import="goToImportPage"
        @sync="runSyncNow"
        @reset-sync="runResetSyncNow"
      />
    </div>

    <AppPageContent class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CandidateFeedbackBanner :feedback="feedback" class="mb-4 shrink-0" @dismiss="clearFeedback" />

      <div class="flex min-h-0 flex-1 overflow-hidden" data-onboarding="candidates-list">
        <CandidateList
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
          @create="setCreateDialogOpen(true)"
          @import="triggerImport"
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

    <CandidateCreateDialog
      :open="createDialogOpen"
      :model-value="createForm"
      :is-submitting="isCreating"
      @update:open="setCreateDialogOpen"
      @update:model-value="updateCreateForm"
      @submit="submitCreate"
    />

    <DeviceSelectDialog
      :open="deviceSelectDialogOpen"
      :selected-count="batchSelection.selectedCount.value"
      @update:open="deviceSelectDialogOpen = $event"
      @send="handleBatchShare"
    />
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CandidateCreateDialog from "@/components/candidates/candidate-create-dialog.vue";
import CandidateFeedbackBanner from "@/components/candidates/candidate-feedback-banner.vue";
import CandidateList from "@/components/candidates/candidate-list.vue";
import CandidatePageHeader from "@/components/candidates/candidate-page-header.vue";
import DeviceSelectDialog from "@/components/candidates/device-select-dialog.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import { useCandidateCreateDialog } from "@/composables/candidates/use-candidate-create-dialog";
import { useCandidatePageActions } from "@/composables/candidates/use-candidate-page-actions";
import { useCandidateSearch } from "@/composables/candidates/use-candidate-search";
import { useCandidateBatchSelection } from "@/composables/candidates/use-candidate-batch-selection";
import { useImportBatches } from "@/composables/import/use-import-batches";
import { shareApi } from "@/api/share";
import type { CandidateCreateFormValue } from "@/composables/candidates/types";
import { useCandidatesStore } from "@/stores/candidates";
import { useSyncStore } from "@/stores/sync";

const store = useCandidatesStore();
const syncStore = useSyncStore();
const importActivity = useImportBatches();
const batchSelection = useCandidateBatchSelection();

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
  openWorkspace,
  exportCandidate,
  deleteCandidate,
  setFeedback,
} = useCandidatePageActions();
const {
  open: createDialogOpen,
  form: createForm,
  isSubmitting: isCreating,
  setOpen: setCreateDialogOpen,
  submit,
} = useCandidateCreateDialog(store);

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
  await Promise.all([
    initialize(),
    importActivity.initialize(),
    syncStore.fetchStatus(),
  ]);
});

function updateCreateForm(value: CandidateCreateFormValue) {
  createForm.value = value;
}

async function submitCreate() {
  const created = await submit();
  if (created) {
    clearFeedback();
  }
}

async function handleDelete(candidateId: string) {
  await deleteCandidate(candidateId);
  await store.refreshCurrentPage();
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
