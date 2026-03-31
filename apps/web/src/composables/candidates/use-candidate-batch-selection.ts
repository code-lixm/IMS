import { ref, computed } from "vue";
import type { CandidateListData } from "@ims/shared";

export interface BatchSelectionState {
  selectedIds: Set<string>;
  isAllSelected: boolean;
  isIndeterminate: boolean;
}

export function useCandidateBatchSelection() {
  const selectedIds = ref<Set<string>>(new Set());

  const selectedCount = computed(() => selectedIds.value.size);
  const hasSelection = computed(() => selectedIds.value.size > 0);

  function toggleSelection(candidateId: string) {
    const newSet = new Set(selectedIds.value);
    if (newSet.has(candidateId)) {
      newSet.delete(candidateId);
    } else {
      newSet.add(candidateId);
    }
    selectedIds.value = newSet;
  }

  function selectCandidate(candidateId: string) {
    const newSet = new Set(selectedIds.value);
    newSet.add(candidateId);
    selectedIds.value = newSet;
  }

  function deselectCandidate(candidateId: string) {
    const newSet = new Set(selectedIds.value);
    newSet.delete(candidateId);
    selectedIds.value = newSet;
  }

  function isSelected(candidateId: string): boolean {
    return selectedIds.value.has(candidateId);
  }

  function selectAll(candidateIds: string[]) {
    selectedIds.value = new Set(candidateIds);
  }

  function deselectAll() {
    selectedIds.value = new Set();
  }

  function toggleAll(candidateIds: string[]) {
    if (selectedIds.value.size === candidateIds.length && candidateIds.length > 0) {
      deselectAll();
    } else {
      selectAll(candidateIds);
    }
  }

  function getSelectionStateForPage(
    items: CandidateListData["items"],
  ): { isAllSelected: boolean; isIndeterminate: boolean } {
    if (items.length === 0) {
      return { isAllSelected: false, isIndeterminate: false };
    }

    const pageIds = items.map((item) => item.id);
    const selectedOnPage = pageIds.filter((id) => selectedIds.value.has(id));

    if (selectedOnPage.length === 0) {
      return { isAllSelected: false, isIndeterminate: false };
    }

    if (selectedOnPage.length === pageIds.length) {
      return { isAllSelected: true, isIndeterminate: false };
    }

    return { isAllSelected: false, isIndeterminate: true };
  }

  function clearSelection() {
    selectedIds.value = new Set();
  }

  function getSelectedIds(): string[] {
    return Array.from(selectedIds.value);
  }

  return {
    selectedIds,
    selectedCount,
    hasSelection,
    toggleSelection,
    selectCandidate,
    deselectCandidate,
    isSelected,
    selectAll,
    deselectAll,
    toggleAll,
    getSelectionStateForPage,
    clearSelection,
    getSelectedIds,
  };
}

export type UseCandidateBatchSelectionReturn = ReturnType<typeof useCandidateBatchSelection>;