import { computed, onBeforeUnmount, ref } from "vue";
import { useCandidatesStore } from "@/stores/candidates";

const SEARCH_DELAY_MS = 300;

export function useCandidateSearch(store: ReturnType<typeof useCandidatesStore>) {
  const search = ref("");
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSearchController: AbortController | null = null;

  const searchSuggestions = computed(() => {
    const keyword = search.value.trim().toLowerCase();
    const values = store.list.flatMap((candidate) => [
      candidate.name,
      candidate.position,
      candidate.email,
      candidate.phone,
    ]);

    return Array.from(
      new Set(
        values.filter((value): value is string => {
          if (!value) return false;
          if (!keyword) return true;
          return value.toLowerCase().includes(keyword);
        }),
      ),
    ).slice(0, 8);
  });

  async function runSearch() {
    activeSearchController?.abort();
    activeSearchController = new AbortController();

    const keyword = search.value.trim();
    try {
      await store.fetchList(
        { search: keyword || undefined, page: 1 },
        { signal: activeSearchController.signal },
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      throw error;
    }
  }

  function scheduleSearch() {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }

    searchTimer = setTimeout(() => {
      void runSearch();
    }, SEARCH_DELAY_MS);
  }

  async function initialize() {
    search.value = store.search ?? "";
    await store.refreshCurrentPage();
  }

  onBeforeUnmount(() => {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    activeSearchController?.abort();
  });

  return {
    search,
    searchSuggestions,
    initialize,
    scheduleSearch,
  };
}
