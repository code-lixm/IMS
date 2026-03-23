import { defineStore } from "pinia";
import { ref } from "vue";
import { authApi } from "@/api/auth";
import type { AuthStatusData } from "@ims/shared";

export const useAuthStore = defineStore("auth", () => {
  const status = ref<AuthStatusData["status"]>("unauthenticated");
  const user = ref<AuthStatusData["user"]>(null);
  const loading = ref(false);
  const initialized = ref(false);
  let pendingCheck: Promise<void> | null = null;

  async function checkStatus() {
    if (pendingCheck) return pendingCheck;

    loading.value = true;

    pendingCheck = (async () => {
    try {
      const data = await authApi.status();
      status.value = data.status;
      user.value = data.user;
    } catch {
      status.value = "unauthenticated";
      user.value = null;
    } finally {
      initialized.value = true;
      loading.value = false;
      pendingCheck = null;
    }
    })();

    return pendingCheck;
  }

  async function ensureStatus() {
    if (initialized.value) return;
    await checkStatus();
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      status.value = "unauthenticated";
      user.value = null;
      initialized.value = true;
      pendingCheck = null;
      loading.value = false;
    }
  }

  return { status, user, loading, initialized, checkStatus, ensureStatus, logout };
});
