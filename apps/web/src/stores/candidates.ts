import { defineStore } from "pinia";
import { ref } from "vue";
import { candidatesApi } from "@/api/candidates";
import type { CandidateListData, CandidateDetailData } from "@ims/shared";

export const useCandidatesStore = defineStore("candidates", () => {
  const list = ref<CandidateListData["items"]>([]);
  const loading = ref(false);
  const current = ref<CandidateDetailData | null>(null);

  async function fetchList(params?: { search?: string; source?: string }) {
    loading.value = true;
    try {
      const data = await candidatesApi.list(params);
      list.value = data.items;
    } finally {
      loading.value = false;
    }
  }

  async function fetchOne(id: string) {
    loading.value = true;
    try {
      current.value = await candidatesApi.get(id);
    } finally {
      loading.value = false;
    }
  }

  async function create(input: Parameters<typeof candidatesApi.create>[0]) {
    const result = await candidatesApi.create(input);
    await fetchList();
    return result;
  }

  async function remove(id: string) {
    await candidatesApi.delete(id);
    list.value = list.value.filter((c) => c.id !== id);
  }

  return { list, loading, current, fetchList, fetchOne, create, remove };
});
