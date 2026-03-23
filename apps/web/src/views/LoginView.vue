<template>
  <div class="min-h-screen bg-background">
    <header
      class="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div class="flex h-16 items-center gap-4 px-4 sm:px-6">
        <RouterLink to="/candidates" class="flex items-center gap-2 shrink-0">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"
          >
            <Briefcase class="h-4 w-4 text-primary" />
          </div>
          <span class="text-lg font-semibold tracking-tight hidden sm:block"
            >IMS</span
          >
        </RouterLink>
      </div>
    </header>

    <main
      class="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 sm:p-6"
    >
      <div
        class="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1.1fr)_420px]"
      >
        <Card class="p-6 sm:p-8">
          <Badge variant="secondary" class="mb-4 gap-1.5">
            <ScanQrCode class="h-3.5 w-3.5" />
            扫码登录
          </Badge>
          <h1 class="text-2xl font-semibold tracking-tight">
            使用抱抱 App 扫码登录 IMS
          </h1>

          <div class="mt-6 grid gap-3 sm:grid-cols-3">
            <Card class="border-dashed p-4">
              <p class="text-xs font-medium text-muted-foreground">
                1. 打开抱抱
              </p>
              <p class="mt-2 text-sm">进入抱抱客户端的扫码入口。</p>
            </Card>
            <Card class="border-dashed p-4">
              <p class="text-xs font-medium text-muted-foreground">
                2. 扫描右侧二维码
              </p>
              <p class="mt-2 text-sm">二维码由本地 IMS 服务实时抓取。</p>
            </Card>
            <Card class="border-dashed p-4">
              <p class="text-xs font-medium text-muted-foreground">
                3. 扫码后返回
              </p>
              <p class="mt-2 text-sm">完成确认后可回到系统继续操作。</p>
            </Card>
          </div>

          <Separator class="my-6" />

          <div
            class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"
          >
            <span class="inline-flex items-center gap-2">
              <span
                class="h-2 w-2 rounded-full"
                :class="qrState.error ? 'bg-destructive' : 'bg-emerald-500'"
              />
              {{ qrState.error ? "二维码加载失败" : "二维码服务可用" }}
            </span>
            <span v-if="qrState.fetchedAt"
              >最近更新：{{ formatTime(qrState.fetchedAt) }}</span
            >
            <span v-if="qrState.refreshed" class="text-amber-600">检测到过期态，已自动刷新二维码</span>
            <span v-if="qrState.loginDetected" class="text-emerald-600">已检测到登录成功，正在进入系统…</span>
            <span v-else-if="qrState.refreshing" class="text-muted-foreground">正在后台检查二维码状态…</span>
            <span v-else-if="qrState.loginPolling" class="text-muted-foreground">正在确认扫码结果…</span>
          </div>
        </Card>

        <Card class="p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold">当前登录二维码</h2>
              <p class="mt-1 text-xs text-muted-foreground">
                页面停留期间会自动检测过期状态并静默刷新。
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5"
              :disabled="qrState.loading"
              @click="loadQrCode"
            >
              <RefreshCw
                class="h-3.5 w-3.5"
                :class="qrState.loading ? 'animate-spin' : ''"
              />
              刷新
            </Button>
          </div>

          <div
            class="mt-6 flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-4"
          >
            <div
              v-if="qrState.loading"
              class="flex flex-col items-center gap-4 text-center"
            >
              <Skeleton class="h-60 w-60 rounded-2xl" />
              <p class="text-sm text-muted-foreground">正在拉取最新二维码…</p>
            </div>
            <div
              v-else-if="qrState.error"
              class="flex max-w-sm flex-col items-center gap-4 text-center"
            >
              <div
                class="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              >
                <CircleAlert class="h-6 w-6" />
              </div>
              <div>
                <p class="text-sm font-medium">二维码加载失败</p>
                <p class="mt-2 text-sm text-muted-foreground">
                  {{ qrState.error }}
                </p>
              </div>
              <Button class="gap-2" @click="loadQrCode">
                <RefreshCw class="h-4 w-4" />
                重试
              </Button>
            </div>
            <div
              v-else-if="qrState.imageSrc"
              class="flex flex-col items-center gap-4"
            >
              <div
                class="overflow-hidden rounded-3xl border border-border bg-white p-3 shadow-sm"
              >
                <img
                  :src="qrState.imageSrc"
                  alt="抱抱登录二维码"
                  class="h-60 w-60 rounded-2xl object-contain"
                />
              </div>
              <p class="text-xs text-muted-foreground">
                请使用抱抱 App 扫码登录
              </p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  Briefcase,
  CircleAlert,
  RefreshCw,
  ScanQrCode,
} from "lucide-vue-next";
import { ApiError } from "@/api/client";
import { authApi } from "@/api/auth";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Separator from "@/components/ui/separator.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const qrState = reactive<{
  loading: boolean;
  refreshing: boolean;
  imageSrc: string;
  error: string;
  fetchedAt: number | null;
  source: "background-image" | "element-screenshot" | null;
  refreshed: boolean;
  loginPolling: boolean;
  loginDetected: boolean;
  redirecting: boolean;
}>({
  loading: false,
  refreshing: false,
  imageSrc: "",
  error: "",
  fetchedAt: null,
  source: null,
  refreshed: false,
  loginPolling: false,
  loginDetected: false,
  redirecting: false,
});

const AUTO_REFRESH_MS = 20000;
const STATUS_POLL_MS = 3000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let statusTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  console.log("[login-view] mounted", {
    redirect: route.query.redirect,
  });
  void loadQrCode();
  statusTimer = setInterval(() => {
    void checkLoginStatus();
  }, STATUS_POLL_MS);
  refreshTimer = setInterval(() => {
    void loadQrCode({ silent: true });
  }, AUTO_REFRESH_MS);
});

onBeforeUnmount(() => {
  console.log("[login-view] before-unmount");
  if (refreshTimer) clearInterval(refreshTimer);
  if (statusTimer) clearInterval(statusTimer);
});

function redirectTarget() {
  const redirect = route.query.redirect;
  return typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/candidates";
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadQrCode(options?: { silent?: boolean }) {
  const silent = options?.silent ?? false;
  console.log("[login-view] loadQrCode:start", {
    silent,
    currentImage: Boolean(qrState.imageSrc),
  });

  if (silent) {
    qrState.refreshing = true;
  } else {
    qrState.loading = true;
    qrState.error = "";
  }

  try {
    const result = await authApi.baobaoQr();
    console.log("[login-view] loadQrCode:success", {
      silent,
      source: result.source,
      refreshed: result.refreshed,
      fetchedAt: result.fetchedAt,
      imageLength: result.imageSrc.length,
    });
    qrState.imageSrc = result.imageSrc;
    qrState.fetchedAt = result.fetchedAt;
    qrState.source = result.source;
    qrState.refreshed = result.refreshed;
    qrState.error = "";
  } catch (error) {
    console.error("[login-view] loadQrCode:error", error);
    if (!silent) qrState.imageSrc = "";
    qrState.error =
      error instanceof ApiError ? error.message : "获取二维码失败";
  } finally {
    if (silent) {
      qrState.refreshing = false;
    } else {
      qrState.loading = false;
    }
  }
}

async function checkLoginStatus() {
  if (qrState.redirecting) return;
  qrState.loginPolling = true;
  console.log("[login-view] checkLoginStatus:start", {
    redirecting: qrState.redirecting,
    loginDetected: qrState.loginDetected,
  });

  try {
    const result = await authApi.baobaoLoginStatus();
    console.log("[login-view] checkLoginStatus:result", {
      status: result.status,
      authenticated: result.authenticated,
      currentUrl: result.currentUrl,
      error: result.error,
      userId: result.user?.id ?? null,
    });
    if (result.authenticated) {
      qrState.loginDetected = true;
      qrState.redirecting = true;
      console.log("[login-view] checkLoginStatus:redirect", {
        target: redirectTarget(),
      });
      await authStore.checkStatus();
      await router.replace(redirectTarget());
    }
  } catch (error) {
    console.error("[login-view] checkLoginStatus:error", error);
  } finally {
    qrState.loginPolling = false;
  }
}
</script>
