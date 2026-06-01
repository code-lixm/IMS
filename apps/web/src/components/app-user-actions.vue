<template>
  <div class="flex items-center gap-1 rounded-[6px] border border-transparent bg-[#F8FAFD] px-1 py-0 dark:bg-white/8">
    <div
      role="button"
      tabindex="0"
      class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] border border-transparent bg-transparent text-[#4B5563] transition-colors hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:border-transparent dark:bg-transparent dark:text-white dark:hover:bg-accent/50"
      :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
      @click="toggleTheme"
      @keydown.enter.prevent="toggleTheme"
      @keydown.space.prevent="toggleTheme"
    >
      <SunMedium v-if="isDark" class="h-4 w-4 text-white" />
      <MoonStar v-else class="h-4 w-4" />
    </div>

    <RecorderHeaderButton />

    <DropdownMenu v-model:open="menuOpen">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] border border-transparent bg-transparent text-sm font-semibold text-[#0062FF] transition-colors hover:bg-[#EEF4FF] dark:border-transparent dark:bg-transparent dark:text-primary-foreground dark:hover:bg-primary/30"
        >
          <img
            v-if="userAvatarUrl"
            :src="userAvatarUrl"
            :alt="displayName"
            class="h-7 w-7 rounded-[6px] object-cover"
          />
          <span
            v-else
            class="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#0062FF] text-[12px] text-white dark:bg-primary/20 dark:text-primary-foreground"
          >
            {{ userInitial }}
          </span>
          <span
            class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border border-background"
            :class="
              isAuthenticated ? 'bg-emerald-500' : 'bg-muted-foreground/40'
            "
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        class="w-[176px] overflow-visible rounded-[6px] border-[#0063ff14] bg-white/95 p-2 shadow-[0_18px_44px_-30px_#0B1F4D66] backdrop-blur-[18px]"
      >
        <div class="flex items-center gap-2 rounded-[6px] bg-white/80 px-2 py-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#0062FF] text-[13px] font-semibold text-white">
            {{ userInitial }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-semibold text-[#1A1A1A]">{{ displayName }}</p>
            <p class="truncate text-[11px] text-[#4B5563]">{{ isAuthenticated ? "已连接本地工作台" : "未登录" }}</p>
          </div>
        </div>
        <p class="px-2 pt-3 text-[11px] font-semibold text-[#4B5563]">工作台</p>
        <DropdownMenuItem :class="getRouteItemClass('/settings', true)" @select="navigateTo('/settings')">
          系统设置
        </DropdownMenuItem>
        <DropdownMenuItem :class="getRouteItemClass('/import')" @select="navigateTo('/import')">
          导入任务
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p class="px-2 text-[11px] font-semibold text-[#4B5563]">辅助</p>
        <DropdownMenuItem class="mt-1 rounded-[6px] text-[13px] text-[#1A1A1A] focus:bg-[#F9FAFB]" @select="handleShowChangelog">
          更新日志
        </DropdownMenuItem>
        <DropdownMenuItem class="rounded-[6px] text-[13px] text-[#1A1A1A] focus:bg-[#F9FAFB]" @select="handleRestartOnboarding">
          新手引导
        </DropdownMenuItem>
        <DropdownMenuItem class="rounded-[6px] text-[13px] text-[#1A1A1A] focus:bg-[#F9FAFB]" @select="handleExportBackendLogs">
          导出日志
        </DropdownMenuItem>
        <template v-if="props.dangerActionLabel">
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="rounded-[6px] text-[13px] text-[#D14343] focus:bg-[#FEF2F2] focus:text-[#D14343] data-[highlighted]:bg-[#FEF2F2] data-[highlighted]:text-[#D14343]"
            :disabled="props.dangerActionDisabled"
            @select="handleDangerAction"
          >
            {{ props.dangerActionLabel }}
          </DropdownMenuItem>
        </template>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          class="mt-1 rounded-[6px] bg-[#0062FF] text-[13px] font-semibold text-white focus:bg-[#0057E5] focus:text-white data-[highlighted]:bg-[#0057E5] data-[highlighted]:text-white"
          @select="handleLogout"
        >
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MoonStar, SunMedium } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import { useTheme } from "@/composables/use-theme";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { showWhatsNew } from "@/composables/use-whats-new";
import RecorderHeaderButton from "@/components/recorder/recorder-header-button.vue";
import { reportAppError } from "@/lib/errors/normalize";
import { useAuthStore } from "@/stores/auth";
import { useOnboardingStore } from "@/stores/onboarding";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const onboardingStore = useOnboardingStore();
const { isDark, toggleTheme } = useTheme();
const { notifyError, notifySuccess } = useAppNotifications();
const menuOpen = ref(false);

const props = withDefaults(defineProps<{
  dangerActionLabel?: string;
  dangerActionDisabled?: boolean;
}>(), {
  dangerActionLabel: undefined,
  dangerActionDisabled: false,
});

const emit = defineEmits<{
  (e: "danger-action"): void;
}>();

function getTauriInvoker() {
  const tauriWindow = window as Window & {
    __TAURI_INTERNALS__?: {
      invoke: <T = unknown>(
        cmd: string,
        args?: Record<string, unknown>,
      ) => Promise<T>;
    };
  };

  return tauriWindow.__TAURI_INTERNALS__?.invoke ?? null;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

onMounted(() => {
  void authStore.checkStatus();
});

const isAuthenticated = computed(() => authStore.status === "valid");
const displayName = computed(
  () => authStore.user?.name || authStore.user?.email || "未登录",
);
const userInitial = computed(() => {
  const source = displayName.value.trim();
  return source ? source.charAt(source.length - 1).toUpperCase() : "我";
});
const userAvatarUrl = computed<string | null>(() => null);

function navigateTo(path: string) {
  menuOpen.value = false;
  void router.push(path);
}

function isPathActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`);
}

function getRouteItemClass(path: string, withTopMargin = false) {
  const baseClass = `${withTopMargin ? 'mt-1 ' : ''}rounded-[6px] text-[13px] transition-colors`;

  if (isPathActive(path)) {
    return `${baseClass} bg-[#EEF4FF] font-semibold text-[#0062FF] focus:bg-[#EEF4FF] focus:text-[#0062FF] data-[highlighted]:bg-[#EEF4FF] data-[highlighted]:text-[#0062FF]`;
  }

  return `${baseClass} text-[#1A1A1A] focus:bg-[#F9FAFB] focus:text-[#1A1A1A] data-[highlighted]:bg-[#F9FAFB] data-[highlighted]:text-[#1A1A1A]`;
}

function handleShowChangelog() {
  menuOpen.value = false;
  showWhatsNew();
}

function handleRestartOnboarding() {
  menuOpen.value = false;
  onboardingStore.requestStart({ force: true });
}

async function handleExportBackendLogs() {
  menuOpen.value = false;

  try {
    const invoke = getTauriInvoker();
    if (!invoke) {
      const diagnostics = {
        exportedAt: new Date().toISOString(),
        userAgent: window.navigator.userAgent,
        path: window.location.pathname,
        authStatus: authStore.status,
        displayName: displayName.value,
      };
      downloadTextFile(`ims-frontend-diagnostics-${Date.now()}.json`, JSON.stringify(diagnostics, null, 2));
      notifySuccess("已导出前端诊断日志");
      return;
    }

    const exportPath = await invoke<string>("export_current_logs");
    if (exportPath) {
      notifySuccess("日志已导出并定位到文件位置");
      return;
    }

    notifyError("未能获取导出日志路径");
  } catch (error) {
    notifyError(
      reportAppError("app-user-actions/export-backend-logs", error, {
        title: "导出日志失败",
        fallbackMessage: "未能导出日志",
      }),
    );
  }
}

function handleDangerAction() {
  if (props.dangerActionDisabled) {
    return;
  }
  menuOpen.value = false;
  emit("danger-action");
}

async function handleLogout() {
  menuOpen.value = false;

  try {
    await authStore.logout();
  } catch (error) {
    notifyError(
      reportAppError("app-user-actions/logout", error, {
        title: "退出登录失败",
        fallbackMessage: "未能完成退出登录",
      }),
    );
  }

  try {
    await router.replace("/login");
  } catch (error) {
    notifyError(
      reportAppError("app-user-actions/navigate-login", error, {
        title: "页面跳转失败",
        fallbackMessage: "未能跳转到登录页，将尝试强制刷新",
      }),
      { durationMs: 5000 },
    );
  }

  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}
</script>
