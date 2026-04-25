<template>
  <Dialog
    :open="open"
    content-class="max-w-md"
    content-aria-label="登录抱抱后继续"
    @update:open="handleOpenChange"
  >
    <template #content>
      <DialogHeader>
        <DialogTitle>登录抱抱后继续</DialogTitle>
        <DialogDescription>
          当前操作需要访问抱抱远端数据。请扫码登录，登录成功后会自动继续刚才的操作。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div class="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-4">
          <div v-if="state.loading" class="flex flex-col items-center gap-4 text-center">
            <Skeleton class="h-56 w-56 rounded-2xl" />
            <p class="text-sm text-muted-foreground">正在拉取最新二维码…</p>
          </div>

          <div v-else-if="state.error" class="flex max-w-sm flex-col items-center gap-3 text-center">
            <CircleAlert class="h-8 w-8 text-destructive" />
            <p class="text-sm font-medium">二维码加载失败</p>
            <p class="text-sm text-muted-foreground">{{ state.error }}</p>
            <Button size="sm" class="gap-2" @click="loadQrCode(true)">
              <RefreshCw class="h-4 w-4" />
              重试
            </Button>
          </div>

          <div v-else class="flex flex-col items-center gap-4">
            <div class="overflow-hidden rounded-3xl border border-border bg-white p-3 shadow-sm">
              <div
                v-if="state.qrSvgMarkup"
                role="img"
                aria-label="抱抱登录二维码"
                class="h-56 w-56 rounded-2xl [&>svg]:h-full [&>svg]:w-full"
                v-html="state.qrSvgMarkup"
              />
              <img
                v-else-if="state.imageSrc"
                :src="state.imageSrc"
                alt="抱抱登录二维码"
                class="h-56 w-56 rounded-2xl object-contain"
              />
            </div>
            <p class="text-xs text-muted-foreground">请使用抱抱 App 扫码确认</p>
          </div>
        </div>

        <p v-if="state.statusText" class="text-sm text-muted-foreground">
          {{ state.statusText }}
        </p>
      </div>

    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from "vue";
import QRCode from "qrcode";
import { CircleAlert, RefreshCw } from "lucide-vue-next";
import { ApiError } from "@/api/client";
import { authApi } from "@/api/auth";
import Button from "@/components/ui/button.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import Skeleton from "@/components/ui/skeleton.vue";

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (event: "authenticated"): void;
}>();

const state = reactive({
  loading: false,
  imageSrc: "",
  qrSvgMarkup: "",
  error: "",
  statusText: "",
  qrStatus: null as string | null, // 详细 QR 状态
  redirecting: false,
});

const STATUS_POLL_MS = 3000;
const QR_REFRESH_MS = 60000; // 60秒自动刷新二维码
let statusTimer: ReturnType<typeof setInterval> | null = null;
let qrRefreshTimer: ReturnType<typeof setInterval> | null = null;
let qrAbortCtrl: AbortController | null = null;
let statusAbortCtrl: AbortController | null = null;
let qrRequestEpoch = 0;
let statusRequestEpoch = 0;
let qrSessionActive = false; // 标记 QR session 是否存在

watch(() => props.open, (open) => {
  if (open) {
    void initialize();
  } else {
    stopAllTimers();
  }
});

onBeforeUnmount(stopAllTimers);

async function initialize() {
  resetState();
  qrSessionActive = false;
  await loadQrCode();
  startPolling();
  startQrRefreshTimer();
}

function resetState() {
  state.loading = false;
  state.imageSrc = "";
  state.qrSvgMarkup = "";
  state.error = "";
  state.statusText = "";
  state.qrStatus = null;
  state.redirecting = false;
}

function startQrRequest(): { epoch: number; signal: AbortSignal } {
  qrRequestEpoch += 1;
  qrAbortCtrl?.abort();
  qrAbortCtrl = new AbortController();
  return { epoch: qrRequestEpoch, signal: qrAbortCtrl.signal };
}

function startStatusRequest(): { epoch: number; signal: AbortSignal } {
  statusRequestEpoch += 1;
  statusAbortCtrl?.abort();
  statusAbortCtrl = new AbortController();
  return { epoch: statusRequestEpoch, signal: statusAbortCtrl.signal };
}

function isCurrentQrRequest(epoch: number) {
  return epoch === qrRequestEpoch && qrAbortCtrl !== null && !qrAbortCtrl.signal.aborted;
}

function isCurrentStatusRequest(epoch: number) {
  return epoch === statusRequestEpoch && statusAbortCtrl !== null && !statusAbortCtrl.signal.aborted;
}

function stopAllTimers() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  if (qrRefreshTimer) {
    clearInterval(qrRefreshTimer);
    qrRefreshTimer = null;
  }
  qrAbortCtrl?.abort();
  statusAbortCtrl?.abort();
  qrAbortCtrl = null;
  statusAbortCtrl = null;
  qrRequestEpoch += 1;
  statusRequestEpoch += 1;
  qrSessionActive = false;
}

function startPolling() {
  if (statusTimer) return;
  statusTimer = setInterval(() => {
    void checkLoginStatus();
  }, STATUS_POLL_MS);
}

function startQrRefreshTimer() {
  if (qrRefreshTimer) return;
  qrRefreshTimer = setInterval(() => {
    // 只有在等待扫码状态才自动刷新
    if (qrSessionActive && !state.redirecting && !state.loading) {
      void loadQrCode(true);
    }
  }, QR_REFRESH_MS);
}

function stopQrRefreshTimer() {
  if (qrRefreshTimer) {
    clearInterval(qrRefreshTimer);
    qrRefreshTimer = null;
  }
}

function handleOpenChange(open: boolean) {
  emit("update:open", open);
}

async function loadQrCode(forceRefresh = false) {
  const { epoch, signal } = startQrRequest();
  state.loading = true;
  state.error = "";
  state.statusText = "";

  try {
    const result = await authApi.baobaoQr({ signal, forceRefresh });
    if (!isCurrentQrRequest(epoch)) return;

    if (result.authenticated && result.user) {
      finishAuthenticated();
      return;
    }

    const rendered = await renderQr(result);
    if (!isCurrentQrRequest(epoch)) return;

    state.imageSrc = rendered.imageSrc;
    state.qrSvgMarkup = rendered.qrSvgMarkup;
    state.qrStatus = result.qrStatus;
    qrSessionActive = true;
    state.statusText = result.qrStatus === "is_scanned"
      ? "已扫码，请在手机确认…"
      : result.qrStatus === "confirm_logined"
        ? "已确认，已加载登录 Cookie，正在获取 Token…"
        : "等待扫码…";
    if (result.qrStatus === "is_scanned" || result.qrStatus === "confirm_logined") {
      stopQrRefreshTimer();
    }
  } catch (error) {
    if (!isCurrentQrRequest(epoch)) return;
    if (error instanceof ApiError && error.code === "REQUEST_ABORTED") return;
    state.error = error instanceof Error ? error.message : "获取二维码失败";
  } finally {
    if (isCurrentQrRequest(epoch)) {
      state.loading = false;
    }
  }
}

async function renderQr(result: { imageSrc: string; qrText: string | null; source?: string | null }) {
  if (result.qrText) {
    const qrSvgMarkup = await QRCode.toString(result.qrText, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 224,
    });
    return { imageSrc: "", qrSvgMarkup };
  }

  if (result.imageSrc) {
    return { imageSrc: result.imageSrc, qrSvgMarkup: "" };
  }

  throw new Error("未获取到可用二维码数据");
}

async function checkLoginStatus() {
  if (!props.open || state.redirecting || state.loading || (!state.imageSrc && !state.qrSvgMarkup)) return;

  const qrEpochAtStart = qrRequestEpoch;
  const { epoch, signal } = startStatusRequest();
  try {
    const result = await authApi.baobaoLoginStatus({ signal });
    if (!isCurrentStatusRequest(epoch)) return;
    if (qrEpochAtStart !== qrRequestEpoch && !result.authenticated) return;

    if (result.authenticated && result.user) {
      finishAuthenticated();
      return;
    }

    // 使用 qrStatus 判断详细状态
    const qrStatus = result.qrStatus;
    state.qrStatus = qrStatus;

    if (qrStatus === "is_scanned") {
      // 用户已扫码，等待手机确认
      state.statusText = "已扫码，请在手机确认…";
      stopQrRefreshTimer(); // 停止 QR 自动刷新
    } else if (qrStatus === "confirm_logined") {
      // 用户已确认，正在获取凭证
      state.statusText = "已确认，已加载登录 Cookie，正在获取 Token…";
      stopQrRefreshTimer(); // 停止 QR 自动刷新
    } else if (qrStatus === "invalid_uuid" || result.error?.includes("invalid_uuid")) {
      // QR 已过期
      state.statusText = "二维码已过期，正在刷新…";
      qrSessionActive = false;
      await loadQrCode(true);
    } else if (result.error) {
      if (result.error === "No QR session active") {
        state.statusText = "二维码已过期，正在刷新…";
        qrSessionActive = false;
        await loadQrCode(true);
      } else if (result.error.includes("扫码已确认") || result.error.includes("令牌交换") || result.error.includes("正在获取")) {
        // 兼容旧版 error 文本
        state.statusText = "已确认，已加载登录 Cookie，正在获取 Token…";
        stopQrRefreshTimer();
      } else if (/expired|过期/i.test(result.error)) {
        state.statusText = "二维码已过期，正在刷新…";
        qrSessionActive = false;
        await loadQrCode(true);
      } else {
        state.statusText = result.error;
      }
    } else {
      // 默认等待扫码
      state.statusText = "等待扫码…";
    }
  } catch (error) {
    if (!isCurrentStatusRequest(epoch)) return;
    if (error instanceof ApiError && error.code === "REQUEST_ABORTED") return;
    state.statusText = "登录状态检查失败，稍后自动重试";
  }
}

function finishAuthenticated() {
  state.redirecting = true;
  state.statusText = "登录成功";
  stopAllTimers();
  emit("authenticated");
  emit("update:open", false);
}
</script>
