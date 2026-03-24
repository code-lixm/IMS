<template>
  <AppPageShell>
    <CandidatePageHeader
      v-model:search="search"
      :search-suggestions="searchSuggestions"
      :is-importing="isImporting"
      @search="scheduleSearch"
      @create="setCreateDialogOpen(true)"
      @import="triggerImport"
      @goto-import="goToImportPage"
    />

    <AppPageContent>
      <CandidateFeedbackBanner :feedback="feedback" @dismiss="clearFeedback" />

      <CandidateList
        :items="store.list"
        :loading="store.loading"
        :workspace-loading-id="workspaceLoadingId"
        :export-loading-id="exportLoadingId"
        @create="setCreateDialogOpen(true)"
        @import="triggerImport"
        @select="goToCandidateDetail"
        @open-workspace="openWorkspace"
        @export="exportCandidate"
      />
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
import { onMounted } from "vue";
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

const store = useCandidatesStore();
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

onMounted(async () => {
  await initialize();
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
</script>
