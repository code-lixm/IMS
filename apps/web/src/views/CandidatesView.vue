<template>
  <AppPageShell :class="`flex h-screen flex-col ${imsDesign.shell}`">
    <ImsPageBackground />
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
          @open-interview-import="interviewImportOpen = true"
          @goto-import="goToImportPage"
          @sync="runSyncNow"
          @reset-sync="runResetSyncNow"
        />
      </div>

      <AppPageContent class="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 lg:px-6">
        <CandidateFeedbackBanner :feedback="feedback" class="mb-4 shrink-0" @dismiss="clearFeedback" />

        <div
          v-if="batchSelection.selectedCount.value > 0"
          class="mb-3 flex h-[52px] shrink-0 items-center justify-between rounded-md border border-[#0063ff33] bg-[#EEF4FF] px-4 dark:border-primary/20 dark:bg-white/10"
        >
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0062FF]">
              <Check class="h-3.5 w-3.5 text-white" />
            </div>
            <span class="shrink-0 text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">
              已选择 {{ batchSelection.selectedCount.value }} 位候选人
            </span>
            <span class="truncate text-xs text-[#4B5563] dark:text-slate-300">
              可执行分享、导出、批量删除
            </span>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              class="h-8 gap-1.5 rounded-md bg-white px-3 text-xs font-semibold text-[#4B5563] shadow-none hover:bg-[#F3F4F6] hover:text-[#1A1A1A] dark:bg-white/8 dark:text-slate-300 dark:hover:bg-white/14 dark:hover:text-slate-100"
              :disabled="isBatchSharing || isBatchDeleting"
              @click="handleClearSelection"
            >
              <X class="h-3.5 w-3.5" />
              取消选择
            </Button>
            <Button
              size="sm"
              variant="secondary"
              class="h-8 gap-1.5 rounded-md bg-white px-3 text-xs font-semibold text-[#1A1A1A] shadow-none hover:bg-[#F3F4F6] dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14"
              :disabled="isBatchSharing || isBatchDeleting"
              @click="openDeviceSelectDialog"
            >
              <Share2 class="h-3.5 w-3.5" />
              {{ isBatchSharing ? "分享中…" : "批量分享" }}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              class="h-8 gap-1.5 rounded-md bg-white px-3 text-xs font-semibold text-[#1A1A1A] shadow-none hover:bg-[#F3F4F6] dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14"
              :disabled="isBatchSharing || isBatchDeleting"
              @click="handleBatchExport"
            >
              <Download class="h-3.5 w-3.5" />
              导出 IMR
            </Button>
            <Button
              size="sm"
              variant="ghost"
              class="h-8 gap-1.5 rounded-md bg-[#FEE2E2] px-3 text-xs font-semibold text-[#E7000B] hover:bg-[#FEF2F2] hover:text-[#E7000B]"
              :disabled="isBatchSharing || isBatchDeleting"
              @click="openBatchDeleteDialog"
            >
              <Trash2 class="h-3.5 w-3.5" />
              批量删除
            </Button>
          </div>
        </div>

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
            :has-selection="false"
            :selected-count="batchSelection.selectedCount.value"
            :is-all-selected-on-page="pageSelectionState.isAllSelected"
            :is-indeterminate-on-page="pageSelectionState.isIndeterminate"
            :share-loading="isBatchSharing"
            :is-selected="batchSelection.isSelected"
            @import-imr="interviewImportOpen = true"
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

      <Dialog
        :open="batchDeleteDialogOpen"
        content-class="max-w-[420px] max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
        content-aria-label="确认批量删除候选人"
        @update:open="batchDeleteDialogOpen = $event"
      >
        <template #content>
          <AppDialogLayout body-class="space-y-4">
            <template #header>
              <DialogHeader>
                <DialogTitle class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100">
                  删除已选候选人？
                </DialogTitle>
                <DialogDescription class="text-[13px] leading-5 text-[#4B5563] dark:text-slate-300">
                  将删除当前选中的 {{ batchSelection.selectedCount.value }} 位候选人。此操作不可撤销。
                </DialogDescription>
              </DialogHeader>
            </template>

            <Alert
              variant="destructive"
              class="rounded-[6px] border-0 bg-red-50 text-red-700 [&>svg]:text-red-700"
            >
              <AlertTriangle class="h-4 w-4" />
              <AlertTitle class="text-[13px] font-semibold">危险操作</AlertTitle>
              <AlertDescription class="text-[12px] leading-5">
                删除后候选人记录会从当前列表移除，请确认已完成导出或备份。
              </AlertDescription>
            </Alert>

            <template #footer>
              <Button
                variant="outline"
                class="h-9 rounded-[6px] px-4 text-[13px] font-semibold"
                :disabled="isBatchDeleting"
                @click="batchDeleteDialogOpen = false"
              >
                取消
              </Button>
              <Button
                variant="destructive"
                class="h-9 rounded-[6px] px-4 text-[13px] font-semibold"
                :disabled="isBatchDeleting || batchSelection.selectedCount.value === 0"
                @click="handleBatchDelete"
              >
                {{ isBatchDeleting ? "删除中…" : "确认删除" }}
              </Button>
            </template>
          </AppDialogLayout>
        </template>
      </Dialog>

      <InterviewImportDrawer
        :open="interviewImportOpen"
        @submitted="handleInterviewImportSubmitted"
        @update:open="interviewImportOpen = $event"
      />
    </template>

    <BaobaoLoginDialog
      v-model:open="baobaoLoginDialogOpen"
      @authenticated="handleBaobaoAuthenticated"
    />
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CandidateFeedbackBanner from "@/components/candidates/candidate-feedback-banner.vue";
import CandidateList from "@/components/candidates/candidate-list.vue";
import CandidatePageHeader from "@/components/candidates/candidate-page-header.vue";
import InterviewImportDrawer from "@/components/candidates/interview-import-drawer.vue";
import DeviceSelectDialog from "@/components/candidates/device-select-dialog.vue";
import BaobaoLoginDialog from "@/components/auth/baobao-login-dialog.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import ImsPageBackground from "@/components/layout/ims-page-background.vue";
import { imsDesign } from "@/components/layout/ims-design";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AppDialogLayout,
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useCandidatePageActions } from "@/composables/candidates/use-candidate-page-actions";
import { useCandidateSearch } from "@/composables/candidates/use-candidate-search";
import { useCandidateBatchSelection } from "@/composables/candidates/use-candidate-batch-selection";
import { useImportBatches } from "@/composables/import/use-import-batches";
import { candidatesApi } from "@/api/candidates";
import { shareApi } from "@/api/share";
import { useAuthStore } from "@/stores/auth";
import { useCandidatesStore } from "@/stores/candidates";
import { useOnboardingStore } from "@/stores/onboarding";
import { isBaobaoAuthExpiredError, useSyncStore } from "@/stores/sync";
import { AlertTriangle, Check, Download, Share2, Trash2, X } from "lucide-vue-next";

const store = useCandidatesStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();
const importActivity = useImportBatches();
const batchSelection = useCandidateBatchSelection();
const onboardingStore = useOnboardingStore();
const initialSyncLoading = ref(true);
const baobaoLoginDialogOpen = ref(false);
const pendingBaobaoAction = ref<"sync" | "reset-sync" | null>(null);

const { search, searchSuggestions, initialize, scheduleSearch } = useCandidateSearch(store);
const {
  feedback,
  isImporting,
  exportLoadingId,
  deleteLoadingId,
  clearFeedback,
  goToCandidateDetail,
  goToImportPage,
    openWorkspace,
    exportCandidate,
    deleteCandidate,
    setFeedback,
  } = useCandidatePageActions();

const deviceSelectDialogOpen = ref(false);
const isBatchSharing = ref(false);
const batchDeleteDialogOpen = ref(false);
const isBatchDeleting = ref(false);
const interviewImportOpen = ref(false);

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

async function handleInterviewImportSubmitted() {
  interviewImportOpen.value = false;
  void store.setPage(1);
  await importActivity.refresh();
}

async function runSyncNow() {
  try {
    await syncStore.runNow();
    await store.refreshCurrentPage();
  } catch (error: unknown) {
    if (isBaobaoAuthExpiredError(error)) {
      pendingBaobaoAction.value = "sync";
      baobaoLoginDialogOpen.value = true;
      return;
    }

    setFeedback({
      tone: "error",
      message: `同步失败：${getErrorMessage(error)}`,
    });
  }
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
    if (isBaobaoAuthExpiredError(error)) {
      pendingBaobaoAction.value = "reset-sync";
      baobaoLoginDialogOpen.value = true;
      return;
    }

    setFeedback({
      tone: "error",
      message: `重置并重新导入失败：${getErrorMessage(error)}`,
    });
  }
}

async function handleBaobaoAuthenticated() {
  const action = pendingBaobaoAction.value;
  pendingBaobaoAction.value = null;

  await authStore.checkStatus({ force: true });

  if (action === "sync") {
    await runSyncNow();
  } else if (action === "reset-sync") {
    await runResetSyncNow();
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

function openBatchDeleteDialog() {
  if (!batchSelection.hasSelection.value) return;
  batchDeleteDialogOpen.value = true;
}

async function handleBatchExport() {
  const candidateIds = batchSelection.getSelectedIds();
  for (const candidateId of candidateIds) {
    await exportCandidate(candidateId);
  }
}

async function handleBatchDelete() {
  const candidateIds = batchSelection.getSelectedIds();
  if (candidateIds.length === 0 || isBatchDeleting.value) return;

  isBatchDeleting.value = true;
  try {
    for (const candidateId of candidateIds) {
      await candidatesApi.delete(candidateId);
    }

    await store.refreshCurrentPage();
    batchSelection.clearSelection();
    batchDeleteDialogOpen.value = false;
    setFeedback({
      tone: "success",
      message: `已删除 ${candidateIds.length} 位候选人`,
    });
  } catch (error: unknown) {
    setFeedback({
      tone: "error",
      message: `批量删除失败：${getErrorMessage(error)}`,
    });
  } finally {
    isBatchDeleting.value = false;
  }
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
