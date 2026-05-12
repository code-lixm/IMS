<template>
  <div class="space-y-6">
    <section class="space-y-4 rounded-lg border border-border/60 bg-muted/10 px-4 py-4 sm:px-5">
      <div class="space-y-1.5">
        <p class="text-sm font-semibold tracking-tight text-foreground">导入目标</p>
        <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
          当前入口会把 PDF 与会议纪要交给 AI 处理，并同步结果状态。
        </p>
      </div>

      <div class="grid gap-3 rounded-lg border border-border/60 bg-card/70 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold tracking-tight text-foreground">{{ candidateName || "系统识别中" }}</p>
            <Badge variant="outline" class="rounded-full px-2 py-0 text-[10px] font-medium">简化入口</Badge>
          </div>
          <p class="text-sm leading-6 text-muted-foreground">
            这里只保留 PDF 和会议纪要；候选人、轮次与落库建议由系统自动识别，确认一步即可继续。
          </p>
        </div>

        <div class="space-y-1 text-xs text-muted-foreground lg:text-right">
          <p>candidateId：<span class="font-medium text-foreground">{{ candidateId }}</span></p>
          <p>已有 {{ existingInterviewCount }} 条面试记录</p>
          <p>默认从第 {{ nextRoundLabel }} 轮开始</p>
        </div>
      </div>
    </section>

    <section class="space-y-4 rounded-lg border border-border/60 bg-card/70 px-4 py-4 sm:px-5 sm:py-5">
      <div class="space-y-1.5">
        <p class="text-sm font-semibold tracking-tight text-foreground">输入内容</p>
        <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
          只需要上传 PDF 和补充会议纪要，其它候选人、轮次与结果判断都由系统处理。
        </p>
      </div>

      <div class="grid gap-4 xl:grid-cols-2 xl:gap-x-6">
        <div class="space-y-2">
          <Label for="interview-import-resume">PDF 简历（可选）</Label>
          <input
            id="interview-import-resume"
            accept=".pdf,application/pdf"
            type="file"
            class="flex h-10 w-full rounded-lg border border-input bg-card/80 px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            @change="handleResumeFileChange"
          >
          <p class="text-xs text-muted-foreground">
            {{ resumePdf ? `当前文件：${resumePdf.name}` : '不上传也可以，只填写会议纪要同样可以提交。' }}
          </p>
        </div>

        <div class="space-y-2 xl:col-span-2">
          <Label for="interview-import-notes">会议纪要</Label>
          <Textarea
            id="interview-import-notes"
            v-model="form.meetingNotesText"
            :rows="6"
            placeholder="填写本次导入的会议纪要、补充说明或同步结论"
          />
          <p v-if="fieldErrors.meetingNotesText" class="text-xs text-destructive">
            {{ fieldErrors.meetingNotesText }}
          </p>
          <p v-else class="text-xs text-muted-foreground">
            建议补充足够上下文，便于 AI 更准确识别历史轮次。
          </p>
        </div>
      </div>

      <Alert v-if="generalWarnings.length" variant="default" class="border-border/60 bg-muted/30">
        <AlertDescription>
          <ul class="space-y-1 text-sm text-muted-foreground">
            <li v-for="warning in generalWarnings" :key="warning.field + warning.message">• {{ warning.message }}</li>
          </ul>
        </AlertDescription>
      </Alert>
    </section>

    <InterviewImportResultSummary :state="submissionState" :confirming="confirming" @confirm="confirmPending" />

    <div class="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-xs text-muted-foreground">
        提交后会进入 AI 处理中状态；若出现低置信度，只需确认一次即可继续。
      </p>
      <div class="flex items-center gap-2 self-end sm:self-auto">
        <Button type="button" variant="outline" :disabled="submitting" @click="resetForm">
          重置
        </Button>
        <Button type="button" :disabled="!canSubmit" @click="handleSubmit">
          {{ submitting ? "提交中..." : submissionState.phase === "processing" ? "处理中..." : "提交导入" }}
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
}>();

const {
  form,
  resumePdf,
  fieldErrors,
  generalWarnings,
  canSubmit,
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
const candidateId = computed(() => props.candidateId || "自动识别");
const nextRoundLabel = computed(() => {
  const value = Number.isFinite(props.nextRoundNumber) ? Math.trunc(props.nextRoundNumber) : 1;
  return value > 0 ? value : 1;
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
