import { defineStore } from "pinia";
import { ref } from "vue";
import { ApiError } from "@/api/client";
import { syncApi } from "@/api/sync";
import type { SyncResetRunData, SyncStatusData } from "@ims/shared";

function isBaobaoAuthExpiredMessage(message: string | null | undefined) {
  if (!message) return false;
  return message.includes("请重新刷新页面")
    || message.includes("Baobao client not initialized")
    || message.includes("Invalid baobao token");
}

export function isBaobaoAuthExpiredError(error: unknown): error is ApiError {
  return error instanceof ApiError
    && error.status === 401
    && (error.code === "AUTH_EXPIRED" || error.code === "AUTH_INVALID" || isBaobaoAuthExpiredMessage(error.message));
}

export const useSyncStore = defineStore("sync", () => {
  const status = ref<SyncStatusData>({ enabled: false, intervalMs: 5000, lastSyncAt: null, lastError: null });
  const loading = ref(false);
  const resetLoading = ref(false);

  function recordAuthError(message: string) {
    status.value.enabled = false;
    status.value.lastError = message;
  }

  async function fetchStatus() {
    status.value = await syncApi.status();
    if (isBaobaoAuthExpiredMessage(status.value.lastError)) {
      status.value.enabled = false;
    }
  }

  async function toggle(enabled: boolean) {
    try {
      const result = await syncApi.toggle(enabled);
      status.value.enabled = result.enabled;
      status.value.intervalMs = result.intervalMs;
      await fetchStatus();
    } catch (error) {
      if (isBaobaoAuthExpiredError(error)) {
        recordAuthError(error.message);
      }
      throw error;
    }
  }

  async function runNow() {
    loading.value = true;
    try {
      await syncApi.run();
      await fetchStatus();
    } catch (error) {
      if (isBaobaoAuthExpiredError(error)) {
        recordAuthError(error.message);
      }
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function resetAndRun(): Promise<SyncResetRunData> {
    resetLoading.value = true;
    try {
      const result = await syncApi.resetAndRun();
      await fetchStatus();
      return result;
    } catch (error) {
      if (isBaobaoAuthExpiredError(error)) {
        recordAuthError(error.message);
      }
      throw error;
    } finally {
      resetLoading.value = false;
    }
  }

  return { status, loading, resetLoading, fetchStatus, toggle, runNow, resetAndRun };
});
