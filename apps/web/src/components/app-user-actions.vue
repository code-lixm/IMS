<template>
  <div class="flex items-center gap-2">
    <div
      role="button"
      tabindex="0"
      class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border/60 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground dark:border-border/80 dark:text-white dark:hover:bg-accent/50"
      :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
      @click="toggleTheme"
      @keydown.enter.prevent="toggleTheme"
      @keydown.space.prevent="toggleTheme"
    >
      <SunMedium v-if="isDark" class="h-4 w-4 text-white" />
      <MoonStar v-else class="h-4 w-4" />
    </div>

    <DropdownMenu v-model:open="menuOpen">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="relative flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-primary/10 text-sm font-semibold text-primary transition-all hover:scale-[1.02] hover:bg-primary/15 hover:shadow-sm dark:border-border/80 dark:bg-primary/20 dark:text-primary-foreground dark:hover:bg-primary/30"
        >
          <img
            v-if="userAvatarUrl"
            :src="userAvatarUrl"
            :alt="displayName"
            class="h-8 w-8 rounded-md object-cover"
          />
          <span
            v-else
            class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/5 dark:bg-primary/20 dark:text-primary-foreground"
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
      <DropdownMenuContent align="end" class="min-w-0 w-fit overflow-visible">
        <div class="px-2 py-2">
          <p class="text-sm font-medium">{{ displayName }}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem @click="router.push('/settings')">
          系统设置
        </DropdownMenuItem>
        <DropdownMenuItem @click="router.push('/import')">
          导入任务
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @click="handleRestartOnboarding">
          新手引导
        </DropdownMenuItem>
        <DropdownMenuItem @click="handleExportBackendLogs">
          导出后端日志
        </DropdownMenuItem>
        <template v-if="props.dangerActionLabel">
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="text-destructive focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            :disabled="props.dangerActionDisabled"
            @click="handleDangerAction"
          >
            {{ props.dangerActionLabel }}
          </DropdownMenuItem>
        </template>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          class="mt-1 bg-destructive text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground data-[highlighted]:bg-destructive/90 data-[highlighted]:text-destructive-foreground"
          @click="handleLogout"
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
import { useRouter } from "vue-router";
import { useTheme } from "@/composables/use-theme";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { useAuthStore } from "@/stores/auth";
import { useOnboardingStore } from "@/stores/onboarding";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const router = useRouter();
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

function handleRestartOnboarding() {
  menuOpen.value = false;
  onboardingStore.requestStart({ force: true });
}

async function handleExportBackendLogs() {
  menuOpen.value = false;

  try {
    const invoke = getTauriInvoker();
    if (!invoke) {
      notifyError("当前环境不支持导出后端日志");
      return;
    }

    const exportPath = await invoke<string>("export_current_logs");
    if (exportPath) {
      notifySuccess("后端日志已导出并定位到文件位置");
      return;
    }

    notifyError("未能获取导出日志路径");
  } catch (error) {
    notifyError(
      reportAppError("app-user-actions/export-backend-logs", error, {
        title: "导出后端日志失败",
        fallbackMessage: "未能导出后端日志",
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
