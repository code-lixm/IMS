<script setup lang="ts">
import { computed } from "vue"
import { CircleAlert, LoaderCircle, Mic, Radio } from "lucide-vue-next"
import type { RecorderStatus } from "@ims/shared"
import { cn } from "@/lib/utils"

const props = defineProps<{
  panelOpen: boolean
  status: RecorderStatus
  desktopRuntime: boolean
}>()

const emit = defineEmits<{
  (e: "toggle"): void
}>()

const statusLabel = computed(() => {
  if (!props.desktopRuntime) {
    return "桌面限定"
  }

  if (props.status === "recording") {
    return "录制中"
  }

  if (props.status === "transcribing" || props.status === "finalizing") {
    return "处理中"
  }

  if (props.status === "completed") {
    return "已完成"
  }

  if (props.status === "error") {
    return "异常"
  }

  return "待命"
})

const isRecording = computed(() => props.status === "recording")

const isProcessing = computed(() => (
  props.status === "transcribing" || props.status === "finalizing"
))

const isError = computed(() => props.status === "error")

const buttonClasses = computed(() => {
  const base = "group relative flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  const motion = props.panelOpen ? "scale-[0.98]" : "hover:-translate-y-0.5"

  if (!props.desktopRuntime) {
    return cn(
      base,
      motion,
      "border-border/70 bg-background/90 text-muted-foreground hover:bg-accent/60 hover:text-foreground shadow-black/5",
    )
  }

  if (isRecording.value) {
    return cn(
      base,
      motion,
      "border-destructive/30 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-destructive/25",
    )
  }

  if (isProcessing.value) {
    return cn(
      base,
      motion,
      "border-border/70 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-black/10",
    )
  }

  if (isError.value) {
    return cn(
      base,
      motion,
      "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 shadow-destructive/10",
    )
  }

  return cn(
      base,
      motion,
      "border-border/70 bg-background/90 text-foreground hover:bg-accent hover:text-accent-foreground shadow-black/5",
  )
})

const icon = computed(() => {
  if (isRecording.value) {
    return Radio
  }

  if (isProcessing.value) {
    return LoaderCircle
  }

  if (isError.value) {
    return CircleAlert
  }

  return Mic
})

const iconClasses = computed(() => (
  cn(
    "relative h-4 w-4",
    isRecording.value && "animate-pulse",
    isProcessing.value && "animate-spin",
  )
))

const buttonLabel = computed(() => (
  props.panelOpen ? "收起录音面板" : "展开录音面板"
))
</script>

<template>
  <div class="pointer-events-auto">
    <button
      type="button"
      :aria-label="buttonLabel"
      :aria-pressed="panelOpen"
      :class="buttonClasses"
      @click="emit('toggle')"
    >
      <span
        class="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-70"
      />

      <component :is="icon" :class="iconClasses" />
      <span class="sr-only">当前状态：{{ statusLabel }}</span>
    </button>
  </div>
</template>
