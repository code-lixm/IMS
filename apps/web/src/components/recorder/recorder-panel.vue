<script setup lang="ts">
import { computed, onMounted, watch } from "vue"
import { Copy, History, LoaderCircle, MicOff, Radio, Sparkles, Trash2, Volume2 } from "lucide-vue-next"
import type { RecorderListItem, RecorderStatus } from "@ims/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAppNotifications } from "@/composables/use-app-notifications"
import { copyTextToClipboard } from "@/lib/clipboard"
import { organizeRecorderText } from "@/lib/recorder/organize"
import { cn } from "@/lib/utils"
import { useRecorderStore } from "@/stores/recorder"

const props = defineProps<{
  desktopRuntime: boolean
}>()

const emit = defineEmits<{
  (e: "close"): void
}>()

const recorderStore = useRecorderStore()
const { notifyError, notifySuccess, notifyWarning } = useAppNotifications()

const statusLabelMap: Record<RecorderStatus, string> = {
  idle: "待命",
  recording: "录制中",
  stopping: "停止中",
  transcribing: "转写中",
  finalizing: "整理中",
  completed: "已完成",
  error: "异常",
}

const statusBadgeVariant = computed(() => {
  if (recorderStore.status === "error") {
    return "destructive"
  }

  if (recorderStore.status === "recording") {
    return "default"
  }

  return "secondary"
})

const runtimeHint = computed(() => {
  if (!props.desktopRuntime) {
    return "需要在桌面端开启录音。"
  }

  if (recorderStore.status === "idle") {
    return "点击后开始说话，结束录音后自动转写。"
  }

  return "录音状态会实时保留，转写完成后可整理或复制。"
})

const primaryActionBusy = computed(() => ["stopping", "transcribing", "finalizing"].includes(recorderStore.status))

const primaryActionLabel = computed(() => {
  if (!props.desktopRuntime) {
    return "仅桌面端可用"
  }

  if (primaryActionBusy.value) {
    return "处理中"
  }

  if (recorderStore.status === "recording") {
    return "结束录音"
  }

  return displayFinalTranscript.value ? "继续补充" : "开始说话"
})

const primaryActionDisabled = computed(() => !props.desktopRuntime || primaryActionBusy.value)

async function handlePrimaryAction() {
  if (primaryActionDisabled.value) {
    return
  }

  try {
    if (recorderStore.status === "recording") {
      await recorderStore.stopRecording()
      return
    }

    await recorderStore.startRecording()
  } catch (error) {
    notifyError(error, {
      title: recorderStore.status === "recording" ? "停止录音失败" : "开始录音失败",
      fallbackMessage: recorderStore.status === "recording" ? "暂时无法停止录音" : "暂时无法开始录音",
    })
  }
}

const durationLabel = computed(() => {
  const totalSeconds = Math.max(0, Math.floor(recorderStore.durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
  }

  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
})

const levelBars = computed(() => {
  const level = Math.max(0, Math.min(1, recorderStore.level))
  const peakLevel = Math.max(level, Math.max(0, Math.min(1, recorderStore.peakLevel)))

  return Array.from({ length: 16 }, (_, index) => {
    const distance = Math.abs(index - 7.5)
    const baseline = 18 + (index % 4) * 6
    const liveBoost = Math.max(0, level * 64 - distance * 7)
    const peakBoost = Math.max(0, peakLevel * 38 - distance * 4)
    const height = Math.max(14, Math.min(100, baseline + liveBoost + peakBoost))

    return {
      id: `level-bar-${index}`,
      height,
      active: height > 34,
      peak: peakBoost > 12,
    }
  })
})

const hasVoiceSignal = computed(() => {
  return recorderStore.level > 0.06 || recorderStore.peakLevel > 0.18 || recorderStore.liveTranscriptText.trim().length > 0
})

const voiceState = computed(() => {
  if (!props.desktopRuntime) {
    return {
      eyebrow: "桌面能力未启用",
      title: "请在桌面端使用录音",
      description: "浏览器环境暂时不能访问本地录音能力。打开 IMS 桌面端后，这里会显示麦克风状态。",
      tone: "muted",
    }
  }

  if (recorderStore.errorMessage || recorderStore.status === "error") {
    return {
      eyebrow: "需要处理",
      title: "录音没有完成",
      description: recorderStore.errorMessage ?? "请检查麦克风权限、输入设备或环境噪声后重试。",
      tone: "danger",
    }
  }

  if (recorderStore.status === "recording") {
    return hasVoiceSignal.value
      ? {
          eyebrow: "已检测到声音",
          title: "正在听，你可以继续说",
          description: "音量反馈正在变化。说完后点击结束录音，系统会进入转写。",
          tone: "active",
        }
      : {
          eyebrow: "正在监听",
          title: "请开始说话",
          description: "如果长时间没有波形变化，请靠近麦克风或检查输入设备。",
          tone: "listening",
        }
  }

  if (recorderStore.status === "stopping") {
    return {
      eyebrow: "正在收尾",
      title: "正在结束录音",
      description: "请稍等，系统正在保存音频并准备转写。",
      tone: "busy",
    }
  }

  if (recorderStore.status === "transcribing") {
    return {
      eyebrow: "识别中",
      title: "正在转写语音",
      description: "转写完成后会在下方显示完整文本。",
      tone: "busy",
    }
  }

  if (recorderStore.status === "finalizing") {
    return {
      eyebrow: "整理中",
      title: "正在整理记录",
      description: "系统正在合并分段并保存最终文本。",
      tone: "busy",
    }
  }

  if (displayFinalTranscript.value) {
    return {
      eyebrow: "转写完成",
      title: "请确认识别内容",
      description: "你可以复制原文、继续补充，或整理成更易读的面试记录。",
      tone: "success",
    }
  }

  return {
    eyebrow: "准备就绪",
    title: "点击开始说话",
    description: "建议在安静环境中靠近麦克风。录音结束后会自动生成转写文本。",
    tone: "ready",
  }
})

const voicePanelClass = computed(() => {
  switch (voiceState.value.tone) {
    case "active":
      return "border-destructive/35 bg-destructive/[0.08] shadow-destructive/10"
    case "listening":
      return "border-primary/30 bg-primary/[0.06] shadow-primary/10"
    case "busy":
      return "border-amber-500/25 bg-amber-500/[0.08] shadow-amber-500/10"
    case "success":
      return "border-emerald-500/25 bg-emerald-500/[0.08] shadow-emerald-500/10"
    case "danger":
      return "border-destructive/45 bg-destructive/[0.10] shadow-destructive/10"
    default:
      return "border-border/70 bg-card/80 shadow-black/5"
  }
})

const displaySegments = computed(() => recorderStore.liveTranscriptSegments.slice(-5))

const historyItems = computed<RecorderListItem[]>(() => recorderStore.history)
const selectedRecordingId = computed(() => recorderStore.current?.recording.id ?? null)

const finalTranscript = computed(() => recorderStore.finalTranscriptText.trim())
const organisedTranscript = computed(() => recorderStore.organisedText?.trim() ?? "")
const displayFinalTranscript = computed(() => recorderStore.current?.recording.finalTranscriptText.trim() || finalTranscript.value)
const displayOrganisedTranscript = computed(() => recorderStore.current?.recording.organisedText?.trim() ?? organisedTranscript.value)
const organizeTargetRecordingId = computed(() => recorderStore.current?.recording.id ?? recorderStore.activeRecordingId ?? null)
const organizeTargetSegments = computed(() => recorderStore.current?.recording.transcriptSegments ?? recorderStore.liveTranscriptSegments)
const selectedRecordingLabel = computed(() => recorderStore.current?.recording.id ?? recorderStore.activeRecordingId ?? "当前录音")

async function ensureHistoryLoaded() {
  await recorderStore.loadRecordings()

  if (!recorderStore.current && recorderStore.history[0]) {
    await recorderStore.loadRecordingDetail(recorderStore.history[0].id)
  }
}

async function handleCopy(text: string, label: string) {
  if (!text.trim()) {
    notifyWarning(`${label}为空，暂时无法复制`)
    return
  }

  const copied = await copyTextToClipboard(text)
  if (!copied) {
    notifyWarning("当前环境不支持自动复制，请检查剪贴板权限")
    return
  }

  notifySuccess(`已复制${label}`)
}

async function handleSelectHistoryItem(recordingId: string) {
  if (selectedRecordingId.value === recordingId && recorderStore.current) {
    return
  }

  await recorderStore.loadRecordingDetail(recordingId)
}

async function handleOrganize() {
  const recordingId = organizeTargetRecordingId.value
  if (!recordingId) {
    notifyWarning("暂无可整理的录音记录")
    return
  }

  const nextOrganisedText = organizeRecorderText({
    finalTranscriptText: displayFinalTranscript.value,
    segments: organizeTargetSegments.value,
  })

  if (!nextOrganisedText) {
    notifyWarning("暂无可整理的文本内容")
    return
  }

  await recorderStore.saveOrganisedText(recordingId, nextOrganisedText)
  notifySuccess("整理结果已保存")
}

async function handleDeleteHistoryItem(recordingId: string) {
  await recorderStore.deleteRecording(recordingId)

  if (!recorderStore.current && recorderStore.history[0]) {
    await recorderStore.loadRecordingDetail(recorderStore.history[0].id)
  }

  notifySuccess("录音记录已删除")
}

function formatHistoryTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

onMounted(() => {
  void ensureHistoryLoaded()
})

watch(
  () => recorderStore.historyOpen,
  (nextOpen) => {
    if (nextOpen) {
      void ensureHistoryLoaded()
    }
  },
)
</script>

<template>
  <section
    class="pointer-events-auto w-[24rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-2xl shadow-black/10 backdrop-blur-xl"
  >
    <div class="max-h-[72vh] overflow-y-auto">
      <div class="border-b border-border/70 bg-gradient-to-br from-destructive/12 via-background to-background px-5 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <Badge :variant="statusBadgeVariant">
                {{ statusLabelMap[recorderStore.status] }}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {{ recorderStore.activeRecordingId ?? "尚未开始录音" }}
              </span>
            </div>

            <div>
              <h2 class="text-base font-semibold tracking-tight text-foreground">
                全局录音面板
              </h2>
              <p class="mt-1 text-sm leading-6 text-muted-foreground">
                {{ runtimeHint }}
              </p>
            </div>
          </div>

          <div class="rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-right shadow-sm">
            <p class="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Duration
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {{ durationLabel }}
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-4 p-5">
        <div :class="cn('relative overflow-hidden rounded-[1.5rem] border px-4 py-5 shadow-lg', voicePanelClass)">
          <div class="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-destructive/10 blur-2xl" />
          <div class="pointer-events-none absolute -bottom-20 left-6 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />

          <div class="relative space-y-5">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  {{ voiceState.eyebrow }}
                </p>
                <h3 class="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  {{ voiceState.title }}
                </h3>
                <p class="mt-2 text-sm leading-6 text-muted-foreground">
                  {{ voiceState.description }}
                </p>
              </div>

              <div class="rounded-2xl border border-border/70 bg-background/75 px-3 py-2 text-right shadow-sm">
                <p class="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Time</p>
                <p class="mt-1 text-lg font-semibold tabular-nums text-foreground">{{ durationLabel }}</p>
              </div>
            </div>

            <div class="flex flex-col items-center gap-4">
              <button
                type="button"
                :disabled="primaryActionDisabled"
                :class="cn(
                  'group relative grid h-24 w-24 place-items-center rounded-full border transition-all duration-300 ease-out disabled:cursor-not-allowed disabled:opacity-60',
                  recorderStore.status === 'recording'
                    ? 'border-destructive/40 bg-destructive text-destructive-foreground shadow-2xl shadow-destructive/25 hover:scale-[1.03]'
                    : 'border-primary/25 bg-primary text-primary-foreground shadow-2xl shadow-primary/20 hover:scale-[1.03]',
                )"
                @click="handlePrimaryAction"
              >
                <span
                  v-if="recorderStore.status === 'recording'"
                  class="absolute inset-[-10px] rounded-full border border-destructive/25 animate-ping"
                />
                <LoaderCircle v-if="primaryActionBusy" class="h-9 w-9 animate-spin" />
                <Radio v-else-if="recorderStore.status === 'recording'" class="h-9 w-9" />
                <Sparkles v-else class="h-9 w-9" />
              </button>

              <div class="text-center">
                <p class="text-sm font-medium text-foreground">{{ primaryActionLabel }}</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ recorderStore.status === 'recording' ? '说完后手动结束，系统随后转写。' : '点击后立刻开始监听。' }}
                </p>
              </div>
            </div>

            <div class="rounded-2xl border border-border/60 bg-background/65 px-3 py-3">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MicOff v-if="!desktopRuntime" class="h-4 w-4 text-muted-foreground" />
                  <Volume2 v-else class="h-4 w-4 text-muted-foreground" />
                  <span>实时收音反馈</span>
                </div>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {{ recorderStore.level.toFixed(2) }} / {{ recorderStore.peakLevel.toFixed(2) }}
                </span>
              </div>

              <div class="flex h-16 items-end gap-1.5 rounded-2xl bg-muted/45 px-3 py-3">
                <span
                  v-for="bar in levelBars"
                  :key="bar.id"
                  :class="cn(
                    'block flex-1 rounded-full transition-all duration-200 ease-out',
                    bar.peak ? 'bg-destructive/90' : bar.active ? 'bg-primary/75' : 'bg-muted-foreground/20',
                  )"
                  :style="{ height: `${bar.height}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <Card class="border-border/70 bg-card/75 shadow-sm">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm">实时识别</CardTitle>
            <CardDescription>系统听到声音后，会在这里显示最近的分段文本。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div v-if="displaySegments.length" class="space-y-2">
              <div
                v-for="segment in displaySegments"
                :key="segment.id"
                class="rounded-2xl border border-border/70 bg-background/80 px-3 py-2"
              >
                <div class="mb-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span>片段 {{ segment.sequence + 1 }}</span>
                  <span>{{ Math.floor(segment.startMs / 1000) }}s → {{ Math.floor(segment.endMs / 1000) }}s</span>
                </div>
                <p class="text-sm leading-6 text-foreground">
                  {{ segment.text || "等待语音分段…" }}
                </p>
              </div>
            </div>

            <div
              v-else
              class="rounded-2xl border border-dashed border-border bg-background/60 px-3 py-4 text-sm leading-6 text-muted-foreground"
            >
              {{ recorderStore.liveTranscriptText || "开始说话后，这里会显示实时识别结果。" }}
            </div>
          </CardContent>
        </Card>

        <Card class="border-border/70 bg-card/75 shadow-sm">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm">识别结果</CardTitle>
            <CardDescription>当前查看：{{ selectedRecordingLabel }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="min-h-24 whitespace-pre-wrap rounded-2xl bg-background/70 px-3 py-3 text-sm leading-6 text-foreground">
              {{ displayFinalTranscript || "结束录音后，这里会显示完整转写文本。" }}
            </p>

            <div class="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="!displayFinalTranscript"
                @click="handleCopy(displayFinalTranscript, '原文')"
              >
                <Copy class="mr-1.5 h-3.5 w-3.5" />
                复制原文
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="primaryActionDisabled"
                @click="handlePrimaryAction"
              >
                <Radio class="mr-1.5 h-3.5 w-3.5" />
                {{ displayFinalTranscript ? "继续补充" : "重新尝试" }}
              </Button>
              <Button
                size="sm"
                :disabled="!organizeTargetRecordingId || !displayFinalTranscript || recorderStore.savingOrganised"
                @click="handleOrganize"
              >
                <LoaderCircle v-if="recorderStore.savingOrganised" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                <Sparkles v-else class="mr-1.5 h-3.5 w-3.5" />
                {{ recorderStore.savingOrganised ? "整理中" : "整理记录" }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card class="border-border/70 bg-card/75 shadow-sm">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm">整理结果</CardTitle>
            <CardDescription>整理后会保存到当前录音记录。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="!displayOrganisedTranscript"
                @click="handleCopy(displayOrganisedTranscript, '整理后文本')"
              >
                <Copy class="mr-1.5 h-3.5 w-3.5" />
                复制整理结果
              </Button>
            </div>
            <p class="min-h-20 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {{ displayOrganisedTranscript || "点击“整理记录”后，这里会显示更易读的文本。" }}
            </p>
          </CardContent>
        </Card>

        <div class="rounded-2xl border border-border/70 bg-card/70 shadow-sm">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
            @click="recorderStore.setHistoryOpen(!recorderStore.historyOpen)"
          >
            <div class="flex items-center gap-3">
              <div class="rounded-xl bg-muted p-2 text-muted-foreground">
                <History class="h-4 w-4" />
              </div>
              <div>
                <p class="text-sm font-medium text-foreground">历史入口</p>
                <p class="text-xs text-muted-foreground">
                  共 {{ recorderStore.total || historyItems.length }} 条，点击记录可查看详情。
                </p>
              </div>
            </div>

            <span class="text-xs text-muted-foreground">
              {{ recorderStore.historyOpen ? "收起" : "展开" }}
            </span>
          </button>

          <div
            v-if="recorderStore.historyOpen"
            class="border-t border-border/70 px-4 py-3"
          >
            <div
              v-if="recorderStore.historyLoading && !historyItems.length"
              class="rounded-2xl border border-dashed border-border bg-background/70 px-3 py-4 text-sm text-muted-foreground"
            >
              正在加载录音历史…
            </div>

            <div v-if="historyItems.length" class="space-y-2">
              <article
                v-for="item in historyItems"
                :key="item.id"
                :class="cn(
                  'rounded-2xl border bg-background/75 px-3 py-3 transition-colors',
                  selectedRecordingId === item.id ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:bg-accent/30',
                )"
                @click="handleSelectHistoryItem(item.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-foreground">
                      {{ item.finalTranscriptText || item.liveTranscriptText || item.organisedText || "未命名录音" }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {{ formatHistoryTime(item.updatedAt) }} · {{ Math.floor(item.durationMs / 1000) }}s
                    </p>
                  </div>

                  <div class="flex items-center gap-2">
                    <Badge variant="outline">
                      {{ statusLabelMap[item.status] }}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 px-2 text-muted-foreground hover:text-destructive"
                      :disabled="recorderStore.deletingRecordingId === item.id"
                      @click.stop="handleDeleteHistoryItem(item.id)"
                    >
                      <LoaderCircle v-if="recorderStore.deletingRecordingId === item.id" class="h-3.5 w-3.5 animate-spin" />
                      <Trash2 v-else class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <p class="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {{ item.organisedText || item.finalTranscriptText || item.liveTranscriptText || "暂无文本内容" }}
                </p>
              </article>
            </div>

            <div
              v-else
              class="rounded-2xl border border-dashed border-border bg-background/70 px-3 py-4 text-sm text-muted-foreground"
            >
              暂无录音记录。
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" @click="emit('close')">
            收起
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
