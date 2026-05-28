<script setup lang="ts">
import { computed } from "vue"
import { LoaderCircle, Mic, X } from "lucide-vue-next"
import { recorderApi } from "@/api/recorder"
import { Button } from "@/components/ui/button"
import { useAppNotifications } from "@/composables/use-app-notifications"
import { cn } from "@/lib/utils"
import { useRecorderStore } from "@/stores/recorder"

const props = defineProps<{
  desktopRuntime: boolean
}>()

const emit = defineEmits<{
  (e: "close"): void
}>()

const recorderStore = useRecorderStore()
const { notifyError } = useAppNotifications()

const primaryActionBusy = computed(() => ["stopping", "transcribing", "finalizing"].includes(recorderStore.status))
const primaryActionLabel = computed(() => {
  if (!props.desktopRuntime) {
    return "仅桌面端可用"
  }

  if (primaryActionBusy.value) {
    return "处理中"
  }

  if (recorderStore.status === "recording") {
    return "停止"
  }

  return "开始录音"
})

const primaryActionDisabled = computed(() => !props.desktopRuntime || primaryActionBusy.value)
const diagnosticsBusy = computed(() => recorderStore.diagnosticsLoading)

const compactStatusText = computed(() => {
  if (!props.desktopRuntime) {
    return "仅桌面"
  }

  if (recorderStore.status === "recording") {
    return liveSignalLabel.value
  }

  if (primaryActionBusy.value) {
    return "正在处理"
  }

  if (recorderStore.status === "completed") {
    return "已保存"
  }

  if (recorderStore.status === "error") {
    return recorderStore.errorMessage || "录音异常"
  }

  return "可录音"
})

const transcriptPreview = computed(() => {
  return recorderStore.finalTranscriptText
    || recorderStore.liveTranscriptText
    || ""
})
const playbackUrl = computed(() => {
  const recordingId = recorderStore.current?.recording.id
  return recordingId ? recorderApi.playbackUrl(recordingId) : null
})

const liveLevelPercent = computed(() => {
  const peak = Math.max(recorderStore.peakLevel, recorderStore.level, 0)
  return Math.min(100, Math.round(peak * 100))
})
const liveSignalLabel = computed(() => {
  if (recorderStore.status !== "recording") {
    return "未在录音"
  }
  if (recorderStore.muted || liveLevelPercent.value <= 2) {
    return "未检测到明显输入"
  }
  return "已检测到输入"
})
const diagnosticsSummary = computed(() => {
  const data = recorderStore.diagnostics
  if (!data) {
    return "点击自检，检查默认麦克风、权限和输入信号。"
  }
  if (data.errorMessage) {
    return data.errorMessage
  }
  if (data.inputSignalDetected === true) {
    return "默认麦克风、权限和输入信号均正常。"
  }
  if (data.deviceAvailable && data.permissionGranted) {
    return "设备和权限正常，但未检测到明显输入信号。"
  }
  return "请根据下方状态继续排查。"
})

async function handleDiagnostics() {
  if (diagnosticsBusy.value || recorderStore.status === "stopping") {
    return
  }
  try {
    await recorderStore.runDiagnostics()
  } catch {
    // toast already emitted by store
  }
}

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

</script>

<template>
  <section
    class="recorder-liquid-shell pointer-events-auto relative isolate w-[15.75rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[32px] bg-[rgba(236,242,249,0.2)] dark:bg-[#132237]/34"
  >
    <svg class="pointer-events-none absolute h-0 w-0">
      <filter id="ims-recorder-liquid-filter" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.02"
          numOctaves="1"
          seed="7"
          result="noise"
        />
        <feGaussianBlur in="noise" stdDeviation="0.35" result="softNoise" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softNoise"
          scale="16"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
    <div class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0.2)_24%,rgba(226,235,246,0.18)_58%,rgba(214,226,241,0.2)_100%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(19,34,55,0.14)_30%,rgba(15,23,42,0.16)_100%)]" />
    <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(255,255,255,0))]" />
    <div class="pointer-events-none absolute -left-10 top-12 -z-10 h-36 w-36 rounded-full bg-[rgba(255,255,255,0.34)] blur-[40px]" />
    <div class="pointer-events-none absolute -right-12 bottom-6 -z-10 h-32 w-32 rounded-full bg-[rgba(207,224,255,0.24)] blur-[38px]" />
    <div class="pointer-events-none absolute inset-[1px] rounded-[31px] border border-white/28" />
    <div class="relative px-4 pb-4 pt-4">
      <div class="absolute right-3 top-3">
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-full text-[#7A8699] shadow-none hover:bg-white/38 hover:text-[#334155] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100"
          aria-label="收起录音面板"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="pt-8 text-center">
        <button
          type="button"
          :disabled="primaryActionDisabled"
          :class="cn(
            'relative mx-auto grid h-[5.75rem] w-[5.75rem] place-items-center overflow-hidden rounded-full border backdrop-blur-xl transition-all duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60',
            recorderStore.status === 'recording'
              ? 'border-[rgba(253,180,180,0.58)] bg-[linear-gradient(180deg,rgba(255,138,138,0.92),rgba(239,68,68,0.9)_60%,rgba(214,45,45,0.94)_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.44),0_14px_28px_-22px_rgba(239,68,68,0.42)] hover:scale-[1.01]'
              : 'border-white/80 bg-[linear-gradient(180deg,rgba(155,183,238,0.96),rgba(123,151,214,0.94)_56%,rgba(107,132,196,0.98)_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.62),inset_0_-10px_20px_rgba(71,85,105,0.12),0_14px_28px_-22px_rgba(100,116,139,0.24)] hover:scale-[1.01]',
          )"
          :aria-label="primaryActionLabel"
          @click="handlePrimaryAction"
        >
          <span class="pointer-events-none absolute inset-x-5 top-2.5 h-4 rounded-full bg-white/34 blur-md" />
          <span
            v-if="recorderStore.status === 'recording'"
            class="absolute inset-[-5px] rounded-full border border-[rgba(252,165,165,0.2)]"
          />
          <LoaderCircle v-if="primaryActionBusy" class="relative z-10 h-8 w-8 animate-spin" />
          <Mic v-else class="relative z-10 h-9 w-9" />
        </button>

        <div class="recorder-liquid-capsule mx-auto mt-5 max-w-[12.75rem] rounded-[22px] bg-[rgba(255,255,255,0.12)] px-3 py-2.5 dark:bg-white/7">
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div class="flex min-w-0 items-center gap-1.5">
              <span
                class="h-1.5 w-1.5 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.34)]"
                :class="recorderStore.status === 'recording' ? 'bg-[#EF4444]' : 'bg-[#0062FF]'"
              />
              <span class="truncate text-[12px] font-medium text-[#5B677A] dark:text-slate-300">
                {{ compactStatusText }}
              </span>
            </div>
            <span class="font-mono text-[18px] font-semibold tabular-nums tracking-[-0.05em] text-[#1F2937] dark:text-slate-50">
              {{ durationLabel }}
            </span>
            <Button
              variant="ghost"
              size="sm"
              class="ml-auto h-7 rounded-full px-2.5 text-[12px] font-medium text-[#5B677A] shadow-none hover:bg-white/42 dark:text-slate-300 dark:hover:bg-white/10"
              :disabled="diagnosticsBusy"
              @click="handleDiagnostics"
            >
              {{ diagnosticsBusy ? "检测中" : "自检" }}
            </Button>
          </div>
          <div class="mx-1 mt-2.5 h-[3px] overflow-hidden rounded-full bg-slate-900/8 dark:bg-white/10">
            <div
              class="h-full rounded-full transition-all duration-150"
              :class="recorderStore.status === 'recording' ? 'bg-[#EF4444]/76' : 'bg-[#7C97C8]'"
              :style="{ width: `${liveLevelPercent}%` }"
            />
          </div>
        </div>
      </div>

      <div v-if="transcriptPreview || playbackUrl || recorderStore.diagnostics" class="mt-3 space-y-2">
        <div v-if="transcriptPreview" class="recorder-liquid-card rounded-[18px] bg-[rgba(255,255,255,0.12)] p-3 dark:bg-[#101A28]/38">
          <p class="mb-2 text-[11px] font-medium text-[#7A8699] dark:text-slate-400">
            {{ recorderStore.finalTranscriptText ? "最终转写" : "实时转写" }}
          </p>
          <p class="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[#334155] dark:text-slate-100">
            {{ transcriptPreview }}
          </p>
        </div>

        <div
          v-if="playbackUrl"
          class="recorder-liquid-card space-y-2 rounded-[18px] bg-[rgba(255,255,255,0.12)] p-3 dark:bg-[#101A28]/38"
        >
          <audio
            class="h-10 w-full"
            :src="playbackUrl"
            controls
            preload="metadata"
          />
        </div>

        <div v-if="recorderStore.diagnostics" class="recorder-liquid-card space-y-2 rounded-[18px] bg-[rgba(255,255,255,0.12)] p-3 dark:bg-[#101A28]/38">
          <p class="text-[12px] leading-5 text-[#5B677A] dark:text-slate-300">
            {{ diagnosticsSummary }}
          </p>
          <div v-if="recorderStore.diagnostics" class="grid gap-2 text-[12px] text-[#5B677A] dark:text-slate-300">
            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-[14px] bg-white/42 px-3 py-2 dark:bg-white/[0.04]">
                <p class="text-[11px] text-[#7A8699] dark:text-slate-400">默认设备</p>
                <p class="mt-1 font-medium">{{ recorderStore.diagnostics.deviceName ?? "未识别" }}</p>
              </div>
              <div class="rounded-[14px] bg-white/42 px-3 py-2 dark:bg-white/[0.04]">
                <p class="text-[11px] text-[#7A8699] dark:text-slate-400">权限</p>
                <p class="mt-1 font-medium">
                  {{
                    recorderStore.diagnostics.permissionGranted === null
                      ? "未知"
                      : recorderStore.diagnostics.permissionGranted
                        ? "已授权"
                        : "未授权"
                  }}
                </p>
              </div>
              <div class="rounded-[14px] bg-white/42 px-3 py-2 dark:bg-white/[0.04]">
                <p class="text-[11px] text-[#7A8699] dark:text-slate-400">采样配置</p>
                <p class="mt-1 font-medium">
                  {{
                    recorderStore.diagnostics.sampleRate && recorderStore.diagnostics.channels
                      ? `${recorderStore.diagnostics.sampleRate} Hz / ${recorderStore.diagnostics.channels} ch`
                      : "不可用"
                  }}
                </p>
              </div>
              <div class="rounded-[14px] bg-white/42 px-3 py-2 dark:bg-white/[0.04]">
                <p class="text-[11px] text-[#7A8699] dark:text-slate-400">输入信号</p>
                <p class="mt-1 font-medium">
                  {{
                    recorderStore.diagnostics.inputSignalDetected === null
                      ? "未知"
                      : recorderStore.diagnostics.inputSignalDetected
                        ? "已检测到"
                        : "未检测到"
                  }}
                </p>
              </div>
            </div>

            <ul
              v-if="recorderStore.diagnostics.notes.length"
              class="space-y-1 rounded-[14px] border border-dashed border-[#D9E6F7] px-3 py-2 text-[11px] leading-5 text-[#7A8699] dark:border-white/10 dark:text-slate-400"
            >
              <li v-for="(note, index) in recorderStore.diagnostics.notes" :key="`${index}-${note}`">
                {{ note }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recorder-liquid-shell {
  backdrop-filter: blur(14px) url(#ims-recorder-liquid-filter);
  -webkit-backdrop-filter: blur(14px) url(#ims-recorder-liquid-filter);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.48),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18),
    inset 10px 10px 24px rgba(255, 255, 255, 0.1),
    0 18px 42px rgba(15, 23, 42, 0.12);
}

.recorder-liquid-capsule,
.recorder-liquid-card {
  backdrop-filter: blur(4px) url(#ims-recorder-liquid-filter);
  -webkit-backdrop-filter: blur(4px) url(#ims-recorder-liquid-filter);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.34),
    inset 0 -1px 0 rgba(255, 255, 255, 0.1),
    0 8px 18px rgba(15, 23, 42, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.36);
}

@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .recorder-liquid-shell {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(244, 247, 251, 0.66));
  }

  .recorder-liquid-capsule,
  .recorder-liquid-card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.42));
  }
}
</style>
