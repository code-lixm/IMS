<template>
  <AppPageShell class="flex flex-col h-screen overflow-hidden">
    <CandidatePageHeader
      v-model:search="search"
      :search-suggestions="searchSuggestions"
      :is-importing="isImporting"
      :sync-loading="syncStore.loading"
      :sync-error="syncStore.status.lastError"
      :sync-enabled="syncStore.status.enabled"
      @search="scheduleSearch"
      @create="setCreateDialogOpen(true)"
      @import="triggerImport"
      @goto-import="goToImportPage"
      @sync="runSyncNow"
    />

    <AppPageContent class="flex flex-1 min-h-0 overflow-hidden">

      <CandidateFeedbackBanner :feedback="feedback" class="mb-4 shrink-0" @dismiss="clearFeedback" />

      <div class="flex flex-1 min-h-0 overflow-hidden">
        <CandidateList
          :items="store.list"
          :loading="store.loading"
          :total="store.total"
          :page="store.page"
          :page-size="store.pageSize"
          :workspace-loading-id="workspaceLoadingId"
          :export-loading-id="exportLoadingId"
          @create="setCreateDialogOpen(true)"
          @import="triggerImport"
          @select="goToCandidateDetail"
          @open-workspace="openWorkspace"
          @export="exportCandidate"
          @page-change="goToPage"
          @page-size-change="changePageSize"
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
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import CandidateCreateDialog from "@/components/candidates/candidate-create-dialog.vue";
import CandidateFeedbackBanner from "@/components/candidates/candidate-feedback-banner.vue";
import CandidateList from "@/components/candidates/candidate-list.vue";
import CandidatePageHeader from "@/components/candidates/candidate-page-header.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import { useCandidateCreateDialog } from "@/composables/candidates/use-candidate-create-dialog";
import { useCandidatePageActions } from "@/composables/candidates/use-candidate-page-actions";
import { useCandidateSearch } from "@/composables/candidates/use-candidate-search";
import type { CandidateCreateFormValue } from "@/composables/candidates/types";
import { useCandidatesStore } from "@/stores/candidates";
import { useSyncStore } from "@/stores/sync";

const store = useCandidatesStore();
const syncStore = useSyncStore();
const { search, searchSuggestions, initialize, scheduleSearch } = useCandidateSearch(store);
const {
  feedback,
  isImporting,
  workspaceLoadingId,
  exportLoadingId,
  clearFeedback,
  goToCandidateDetail,
  goToImportPage,
  triggerImport,
  openWorkspace,
  exportCandidate,
} = useCandidatePageActions();
const {
  open: createDialogOpen,
  form: createForm,
  isSubmitting: isCreating,
  setOpen: setCreateDialogOpen,
  submit,
} = useCandidateCreateDialog(store);

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)));

onMounted(async () => {
  await Promise.all([
    initialize(),
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

async function runSyncNow() {
  await syncStore.runNow();
  await store.refreshCurrentPage();
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
</script>
