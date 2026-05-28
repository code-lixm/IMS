<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Mic } from "lucide-vue-next";
import type { RecorderStatus } from "@ims/shared";
import { useRecorderStore } from "@/stores/recorder";

const recorderStore = useRecorderStore();

const isDesktopRuntime = computed(
  () =>
    typeof window !== "undefined"
    && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined",
);

const statusLabel = computed(() => {
  const labelMap: Record<RecorderStatus, string> = {
    idle: "待命",
    recording: "录制中",
    stopping: "处理中",
    transcribing: "处理中",
    finalizing: "处理中",
    completed: "已完成",
    error: "异常",
  };

  return labelMap[recorderStore.status as RecorderStatus];
});

const isProcessing = computed(() => ["stopping", "transcribing", "finalizing"].includes(recorderStore.status));

const buttonStateClass = computed(() => {
  if (recorderStore.status === "recording") {
    return "border-[#E7000B26] bg-[#E7000B0D] text-[#D6000B] hover:bg-[#E7000B14] dark:border-red-400/20 dark:bg-red-400/12 dark:text-red-300";
  }

  if (isProcessing.value) {
    return "border-[#0062FF24] bg-[#EEF4FF] text-[#0062FF] hover:bg-[#E4EDFF] dark:border-primary/25 dark:bg-primary/15 dark:text-primary";
  }

  if (recorderStore.status === "completed") {
    return "border-emerald-500/20 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-300";
  }

  if (recorderStore.status === "error") {
    return "border-[#E7000B26] bg-red-50 text-[#D6000B] hover:bg-red-100 dark:border-red-400/20 dark:bg-red-400/12 dark:text-red-300";
  }

  return "border-transparent bg-transparent text-[#4B5563] hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:border-transparent dark:bg-transparent dark:text-white dark:hover:bg-accent/50";
});

const buttonLabel = computed(() => {
  const action = recorderStore.panelOpen ? "收起" : "展开";
  return `${action}录音面板（当前状态：${statusLabel.value}）`;
});

onMounted(() => {
  recorderStore.setSupported(isDesktopRuntime.value);
});
</script>

<template>
  <div>
    <button
      type="button"
      class="relative flex h-8 w-8 items-center justify-center rounded-[6px] border transition-colors"
      :class="buttonStateClass"
      :aria-label="buttonLabel"
      :aria-pressed="recorderStore.panelOpen"
      :title="buttonLabel"
      @click="recorderStore.togglePanel()"
    >
      <Mic
        class="h-4 w-4"
        :class="isProcessing || recorderStore.status === 'recording' ? 'animate-pulse' : ''"
      />
    </button>
  </div>
</template>
