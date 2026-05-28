<template>
  <div class="relative flex min-h-full flex-col">
    <div v-if="isBusy" class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-[22px] bg-white/80 backdrop-blur-[6px]">
      <div class="h-8 w-8 animate-spin rounded-full border-[3px] border-[#C7D8FF] border-t-[#0062FF]" />
      <p class="text-sm font-medium text-[#1A1A1A]">{{ busyMessage }}</p>
      <p class="text-xs text-muted-foreground">请勿关闭此窗口</p>
    </div>
    <div class="flex-1 space-y-5 pb-5">
      <section
        class="relative overflow-hidden rounded-[22px] border border-[#DCE6F4] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,250,255,0.94))] px-4 py-4 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.22)] sm:px-5"
      >
        <div aria-hidden="true" class="pointer-events-none absolute inset-0">
          <div class="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(201,216,255,0.30),rgba(201,216,255,0))]" />
          <div class="absolute -left-10 top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(132,164,255,0.12)_0%,rgba(132,164,255,0)_72%)]" />
          <div class="absolute inset-0 bg-[linear-gradient(rgba(145,170,224,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(145,170,224,0.07)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.38),transparent_78%)]" />
        </div>

        <div class="relative flex flex-col gap-5">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-[15px] font-semibold tracking-tight text-foreground">{{ candidateName || "系统自动识别候选人" }}</p>
              <Badge variant="secondary" class="rounded-full border-transparent bg-primary/10 px-2.5 text-primary">自动识别</Badge>
            </div>
            <p class="text-[14px] leading-6 text-muted-foreground">
              只需要提供资料，候选人、轮次和结果会自动判断。
            </p>
          </div>

          <div class="grid max-w-[560px] gap-2.5 text-[12px] text-muted-foreground sm:grid-cols-2">
            <span class="rounded-[14px] border border-white/70 bg-white/54 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-[10px]">
              <span class="block text-[11px] tracking-[0.04em] text-muted-foreground/80">已有记录</span>
              <span class="mt-1 block text-[18px] font-semibold tracking-[-0.02em] text-foreground">{{ existingInterviewCount }}</span>
            </span>
            <span class="rounded-[14px] border border-[#C7D8FF] bg-[linear-gradient(180deg,rgba(235,242,255,0.92),rgba(227,236,255,0.72))] px-3.5 py-3 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <span class="block text-[11px] tracking-[0.04em] text-primary/75">默认轮次</span>
              <span class="mt-1 block text-[18px] font-semibold tracking-[-0.02em]">第 {{ nextRoundLabel }} 轮</span>
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
            <span>
              默认流程
              <span class="ml-1 font-medium text-foreground">传资料 → 提交 → 确认</span>
            </span>
          </div>
        </div>
      </section>

      <section class="space-y-4 rounded-[18px] border border-[#E8EEF7] bg-white/72 px-4 py-4 sm:px-5 sm:py-5">
      <div class="grid gap-2.5 text-sm sm:grid-cols-3">
        <div class="rounded-[14px] border border-white/70 bg-white/58 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[10px]">
          <p class="font-medium text-foreground">1. 传资料</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">PDF 或会议纪要。</p>
        </div>
        <div class="rounded-[14px] border border-[#C7D8FF] bg-[linear-gradient(180deg,rgba(235,242,255,0.92),rgba(227,236,255,0.72))] px-4 py-3 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
          <p class="font-medium">2. 提交</p>
          <p class="mt-1 text-xs leading-5 text-primary/80">自动识别候选人和轮次。</p>
        </div>
        <div class="rounded-[14px] border border-white/70 bg-white/58 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[10px]">
          <p class="font-medium text-foreground">3. 确认</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">低置信度时再看一眼。</p>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-2 xl:gap-x-6">
        <div class="space-y-2">
          <Label for="interview-import-resume">PDF 简历（可选）</Label>
          <label
            for="interview-import-resume"
            class="flex h-11 cursor-pointer items-center gap-3 rounded-[12px] border border-[#DCE6F4] bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(244,248,254,0.92))] px-2.5 text-sm transition-colors hover:border-[#C7D8FF] hover:bg-[#EEF4FF]/60 focus-within:ring-1 focus-within:ring-[#0062FF]/25"
          >
            <span class="inline-flex h-8 shrink-0 items-center rounded-[8px] bg-[#EEF4FF] px-3 text-[13px] font-semibold text-[#0062FF]">
              选择 PDF
            </span>
            <span class="min-w-0 flex-1 truncate text-[#4B5563]">
              {{ resumePdf?.name ?? '未选择文件' }}
            </span>
            <input
              id="interview-import-resume"
              accept=".pdf,application/pdf"
              type="file"
              class="sr-only"
              @change="handleResumeFileChange"
            >
          </label>
          <p class="text-xs text-muted-foreground">没有 PDF 也可以提交。</p>
        </div>

        <div class="space-y-2 xl:col-span-2">
          <Label for="interview-import-notes">会议纪要</Label>
          <Textarea
            id="interview-import-notes"
            v-model="form.meetingNotesText"
            :rows="6"
            class="min-h-[160px] rounded-[14px] border border-[#DCE6F4] bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(244,248,254,0.92))] px-4 py-3 text-sm leading-6 text-[#1A1A1A] placeholder:text-[#6B7A90] focus:bg-white focus:ring-1 focus:ring-[#0062FF]/25"
            placeholder="粘贴会议纪要，或写下本轮面试结论"
          />
          <p v-if="fieldErrors.meetingNotesText" class="text-xs text-destructive">
            {{ fieldErrors.meetingNotesText }}
          </p>
          <p v-else class="text-xs text-muted-foreground">
            写清面试时间、轮次、结论会更准确。
          </p>
        </div>
      </div>

      <Alert v-if="generalWarnings.length" variant="default" class="rounded-[14px] border border-[#DCE6F4] bg-[linear-gradient(180deg,rgba(241,245,251,0.96),rgba(236,242,250,0.92))]">
        <AlertDescription>
          <ul class="space-y-1 text-sm text-muted-foreground">
            <li v-for="warning in generalWarnings" :key="warning.field + warning.message">• {{ warning.message }}</li>
          </ul>
        </AlertDescription>
      </Alert>
    </section>

      <InterviewImportResultSummary :state="submissionState" :confirming="confirming" @confirm="confirmPending" />
    </div>

    <div class="sticky bottom-0 -mx-6 flex flex-col gap-3 bg-[#F8FAFD] px-6 py-4 sm:-mx-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <p class="text-xs text-muted-foreground">
        至少上传 PDF 或填写会议纪要。
      </p>
      <div class="flex items-center gap-2 self-end sm:self-auto">
        <Button type="button" variant="outline" :disabled="isBusy" @click="resetForm">
          重置
        </Button>
        <Button type="button" :disabled="isBusy" @click="handleSubmit">
          {{ isBusy ? (submitting ? "提交中…" : "解析中…") : "提交导入" }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import type { InterviewImportCreateResult } from "@/api/interview-import";
import InterviewImportResultSummary from "@/components/import/interview-import-result-summary.vue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInterviewImportForm } from "@/composables/import/use-interview-import-form";

interface InterviewImportFormProps {
  open?: boolean;
  candidateId?: string;
  candidateName?: string | null;
  nextRoundNumber?: number;
  existingInterviewCount?: number;
}

const props = withDefaults(defineProps<InterviewImportFormProps>(), {
  open: true,
  candidateId: "",
  candidateName: null,
  nextRoundNumber: 1,
  existingInterviewCount: 0,
});

const emit = defineEmits<{
  (e: "submitted", result: InterviewImportCreateResult): void;
  (e: "update:busy", value: boolean): void;
}>();

const {
  form,
  resumePdf,
  fieldErrors,
  generalWarnings,
  isBusy,
  submitting,
  confirming,
  submissionState,
  setResumePdf,
  resetForm,
  submit,
  confirmPending,
} = useInterviewImportForm({
  candidateId: () => props.candidateId,
  candidateName: () => props.candidateName,
  nextRoundNumber: () => props.nextRoundNumber,
});

const candidateName = computed(() => props.candidateName ?? null);
const nextRoundLabel = computed(() => {
  const value = Number.isFinite(props.nextRoundNumber) ? Math.trunc(props.nextRoundNumber) : 1;
  return value > 0 ? value : 1;
});

const busyMessage = computed(() => {
  if (submitting.value) return "正在提交面试记录…";
  if (submissionState.value.phase === "processing") return "正在解析面试记录…";
  return "";
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm();
    }
  },
  { immediate: true },
);

watch(isBusy, (busy) => {
  emit("update:busy", busy);
}, { immediate: true });

function handleResumeFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  setResumePdf(target.files?.[0] ?? null);
}

async function handleSubmit() {
  const result = await submit();
  if (result) {
    emit("submitted", result);
  }
}
</script>
