import { defineStore } from "pinia";
import { ref } from "vue";
import { syncApi } from "@/api/sync";
import type { SyncStatusData } from "@ims/shared";

export const useSyncStore = defineStore("sync", () => {
  const status = ref<SyncStatusData>({ enabled: false, intervalMs: 5000, lastSyncAt: null, lastError: null });
  const loading = ref(false);

  async function fetchStatus() {
    status.value = await syncApi.status();
  }

  async function toggle(enabled: boolean) {
    const result = await syncApi.toggle(enabled);
    status.value.enabled = result.enabled;
    status.value.intervalMs = result.intervalMs;
  }

  async function runNow() {
    loading.value = true;
    try {
      await syncApi.run();
      await fetchStatus();
    } finally {
      loading.value = false;
    }
  }

  return { status, loading, fetchStatus, toggle, runNow };
});
