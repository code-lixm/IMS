import { defineStore } from "pinia";
import { ref } from "vue";
import { ApiError } from "@/api/client";
import { syncApi } from "@/api/sync";
import router from "@/router";
import { useAuthStore } from "@/stores/auth";
import type { SyncResetRunData, SyncStatusData } from "@ims/shared";

function isBaobaoAuthExpiredMessage(message: string | null | undefined) {
  if (!message) return false;
  return message.includes("请重新刷新页面")
    || message.includes("Baobao client not initialized")
    || message.includes("Invalid baobao token");
}

function isBaobaoAuthExpiredError(error: unknown) {
  return error instanceof ApiError
    && error.status === 401
    && (error.code === "AUTH_EXPIRED" || error.code === "AUTH_INVALID");
}

async function redirectToLogin() {
  const authStore = useAuthStore();
  await authStore.checkStatus();

  const redirect = router.currentRoute.value.fullPath || "/candidates";
  if (router.currentRoute.value.path === "/login") return;

  try {
    await router.replace({ path: "/login", query: { redirect } });
  } catch (_error) {
    window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
  }
}

export const useSyncStore = defineStore("sync", () => {
  const status = ref<SyncStatusData>({ enabled: false, intervalMs: 5000, lastSyncAt: null, lastError: null });
  const loading = ref(false);
  const resetLoading = ref(false);

  async function fetchStatus() {
    status.value = await syncApi.status();
    if (isBaobaoAuthExpiredMessage(status.value.lastError)) {
      await redirectToLogin();
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
        status.value.enabled = false;
        await redirectToLogin();
        return;
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
        await redirectToLogin();
        return;
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
        await redirectToLogin();
        throw error;
      }
      throw error;
    } finally {
      resetLoading.value = false;
    }
  }

  return { status, loading, resetLoading, fetchStatus, toggle, runNow, resetAndRun };
});
