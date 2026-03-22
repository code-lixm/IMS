import { defineStore } from "pinia";
import { ref } from "vue";
import { authApi } from "@/api/auth";
import type { AuthStatusData } from "@ims/shared";

export const useAuthStore = defineStore("auth", () => {
  const status = ref<AuthStatusData["status"]>("unauthenticated");
  const user = ref<AuthStatusData["user"]>(null);
  const loading = ref(false);

  async function checkStatus() {
    try {
      const data = await authApi.status();
      status.value = data.status;
      user.value = data.user;
    } catch {
      status.value = "unauthenticated";
    }
  }

  return { status, user, loading, checkStatus };
});
