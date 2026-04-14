import { defineStore } from "pinia";
import { ref } from "vue";
import { candidatesApi } from "@/api/candidates";
import type { CandidateListData, CandidateDetailData } from "@ims/shared";

type CandidateListParams = {
  search?: string;
  source?: string;
  page?: number;
  pageSize?: number;
};

function hasParam<K extends keyof CandidateListParams>(params: CandidateListParams | undefined, key: K) {
  return Boolean(params && Object.prototype.hasOwnProperty.call(params, key));
}

export const useCandidatesStore = defineStore("candidates", () => {
  const list = ref<CandidateListData["items"]>([]);
  const loading = ref(false);
  const current = ref<CandidateDetailData | null>(null);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const search = ref<string | undefined>(undefined);
  const source = ref<string | undefined>(undefined);
  let listRequestId = 0;

  async function fetchList(params?: CandidateListParams, options?: { signal?: AbortSignal }) {
    const requestId = ++listRequestId;
    const nextSearch = hasParam(params, "search") ? params?.search?.trim() || undefined : search.value;
    const nextSource = hasParam(params, "source") ? params?.source?.trim() || undefined : source.value;
    const nextPage = hasParam(params, "page") ? Math.max(1, params?.page ?? 1) : page.value;
    const nextPageSize = hasParam(params, "pageSize") ? Math.min(100, Math.max(1, params?.pageSize ?? 20)) : pageSize.value;

    loading.value = true;
    try {
      const data = await candidatesApi.list(
        {
          search: nextSearch,
          source: nextSource,
          page: nextPage,
          pageSize: nextPageSize,
        },
        options,
      );

      if (requestId === listRequestId) {
        list.value = data.items;
        total.value = data.total;
        page.value = data.page;
        pageSize.value = data.pageSize;
        search.value = nextSearch;
        source.value = nextSource;
      }
    } finally {
      if (requestId === listRequestId) {
        loading.value = false;
      }
    }
  }

  function setPage(nextPage: number, options?: { signal?: AbortSignal }) {
    return fetchList({ page: nextPage }, options);
  }

  function setPageSize(nextPageSize: number, options?: { signal?: AbortSignal }) {
    return fetchList({ pageSize: nextPageSize, page: 1 }, options);
  }

  function refreshCurrentPage(options?: { signal?: AbortSignal }) {
    return fetchList(undefined, options);
  }

  async function fetchOne(id: string) {
    loading.value = true;
    current.value = null;
    try {
      current.value = await candidatesApi.get(id);
      return current.value;
    } catch (error) {
      current.value = null;
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: Parameters<typeof candidatesApi.create>[0]) {
    const result = await candidatesApi.create(input);
    await refreshCurrentPage();
    return result;
  }

  async function remove(id: string) {
    await candidatesApi.delete(id);
    await refreshCurrentPage();
  }

  return {
    list,
    loading,
    current,
    total,
    page,
    pageSize,
    search,
    source,
    fetchList,
    setPage,
    setPageSize,
    refreshCurrentPage,
    fetchOne,
    create,
    remove,
  };
});
