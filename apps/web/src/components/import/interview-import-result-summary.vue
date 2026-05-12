<template>
  <section v-if="state.phase !== 'idle'" class="border-t border-border/60 pt-5">
    <div class="space-y-3" :class="summaryShellClass">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-medium text-foreground">结果反馈</h3>
            <Badge :variant="statusVariant(resolvedStatus)" class="rounded-full px-2 py-0 text-[10px] font-medium">
              {{ statusText }}
            </Badge>
          </div>
          <p class="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{{ sourceText }}</p>
          <p class="text-sm leading-6 text-muted-foreground">{{ descriptionText }}</p>
        </div>

        <div class="space-y-1 text-xs text-muted-foreground md:text-right">
          <p>批次 ID：<span class="font-medium text-foreground">{{ state.batch?.id ?? '待创建' }}</span></p>
          <p v-if="state.lastUpdatedAt">最后刷新：{{ formatImportTimestamp(state.lastUpdatedAt) }}</p>
        </div>
      </div>

      <Alert v-if="state.errorMessage" variant="destructive">
        <AlertTitle>{{ alertTitle }}</AlertTitle>
        <AlertDescription>{{ state.errorMessage }}</AlertDescription>
      </Alert>

      <div v-if="resolvedSummary" class="grid gap-3 sm:grid-cols-3">
        <div
          v-for="(item, index) in overviewItems"
          :key="`${item?.label ?? 'item'}-${index}`"
          class="space-y-1 rounded-lg border border-border/50 bg-background/40 px-3 py-3"
        >
          <p class="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{{ item?.label }}</p>
          <p class="text-sm font-semibold text-foreground">{{ item?.value }}</p>
          <p v-if="item?.hint" class="text-xs text-muted-foreground">{{ item?.hint }}</p>
        </div>
      </div>

      <div v-if="resolvedSummary?.workflowAdvance" class="border-t border-border/50 pt-3 text-sm">
        <p class="font-medium text-foreground">Workflow 推进</p>
        <p class="mt-1 text-muted-foreground">
          {{ interviewImportWorkflowDescription(resolvedSummary.workflowAdvance) }}
        </p>
      </div>

      <div v-if="resolvedSummary?.errors?.length" class="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/15">
        <p class="text-sm font-medium text-amber-900 dark:text-amber-200">处理提示</p>
        <ul class="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300">
          <li v-for="item in resolvedSummary.errors" :key="item">• {{ item }}</li>
        </ul>
      </div>

      <div v-if="needsConfirmation" class="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4 space-y-3">
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">最小确认</p>
          <p class="text-sm text-muted-foreground">确认候选人与轮次建议后，系统会继续落库；如果不对，直接改上方内容后重新提交。</p>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <div v-if="candidateSuggestions.length" class="space-y-1">
            <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">候选人建议</p>
            <div class="space-y-1 text-sm text-foreground">
              <p v-for="item in candidateSuggestions" :key="item">• {{ item }}</p>
            </div>
          </div>
          <div v-if="roundSuggestions.length" class="space-y-1">
            <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">轮次建议</p>
            <div class="space-y-1 text-sm text-foreground">
              <p v-for="item in roundSuggestions" :key="item">• {{ item }}</p>
            </div>
          </div>
        </div>
        <div class="flex justify-end">
          <Button type="button" :disabled="confirming" @click="emit('confirm')">
            {{ confirming ? '确认中…' : '确认并继续落库' }}
          </Button>
        </div>
      </div>

      <div v-if="state.task?.resultJson && !resolvedSummary" class="text-sm text-muted-foreground">
        任务已返回结果，但摘要尚未生成；稍后刷新即可查看聚合计数。
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatImportTimestamp,
  statusVariant,
} from "@/composables/import/formatters";
import {
  buildInterviewImportOverviewItems,
  INTERVIEW_IMPORT_SOURCE_TYPE,
  interviewImportSourceTypeLabel,
  interviewImportStatusDescription,
  interviewImportStatusLabel,
  interviewImportWorkflowDescription,
  resolveInterviewImportBatchSummary,
} from "@/composables/import/interview-import-formatters";
import type { InterviewImportSubmissionState } from "@/composables/import/use-interview-import-form";

interface Props {
  state: InterviewImportSubmissionState;
  confirming?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "confirm"): void }>();

const taskResult = computed(() => {
  if (!props.state.task?.resultJson) {
    return null;
  }

  try {
    return JSON.parse(props.state.task.resultJson) as {
      aiDraft?: {
        candidateOptions?: Array<{ candidateName: string; candidateId?: string; confidence?: number; reason?: string }>;
        rounds?: Array<{ resolvedRoundNumber: number; confidence?: number; reason?: string }>;
      };
    };
  } catch {
    return null;
  }
});

const fallbackStatus = computed(() => {
  if (props.state.phase === "submitting") return "queued";
  if (props.state.phase === "processing") return "processing";
  if (props.state.phase === "completed") return "completed";
  return "failed";
});

const resolvedStatus = computed(() => props.state.batch?.status ?? fallbackStatus.value);
const resolvedSummary = computed(() => resolveInterviewImportBatchSummary({
  summary: props.state.summary,
  summaryJson: props.state.batch?.summaryJson ?? null,
  resultJson: props.state.task?.resultJson ?? null,
}));
const overviewItems = computed(() => buildInterviewImportOverviewItems(resolvedSummary.value));
const needsConfirmation = computed(() => resolvedSummary.value?.decisionState === "needs_confirmation");
const candidateSuggestions = computed(() => (taskResult.value?.aiDraft?.candidateOptions ?? []).map((option) => (
  option.candidateId ? `${option.candidateName}（${option.candidateId}）` : option.candidateName
)));
const roundSuggestions = computed(() => (taskResult.value?.aiDraft?.rounds ?? []).map((round) => `第 ${round.resolvedRoundNumber} 轮`));
const isSettled = computed(() => (
  resolvedStatus.value === "completed"
  || resolvedStatus.value === "partial_success"
  || resolvedStatus.value === "failed"
));
const statusText = computed(() => interviewImportStatusLabel({
  status: resolvedStatus.value,
  currentStage: props.state.batch?.currentStage ?? null,
  summary: resolvedSummary.value,
}));
const sourceText = computed(() => interviewImportSourceTypeLabel(
  props.state.batch?.sourceType ?? INTERVIEW_IMPORT_SOURCE_TYPE,
));
const alertTitle = computed(() => {
  if (resolvedSummary.value?.decisionState === "needs_confirmation") {
    return "需要确认";
  }

  if (resolvedStatus.value === "failed") {
    return "处理失败";
  }

  return "需要手动关注";
});

const descriptionText = computed(() => {
  if (resolvedStatus.value === "completed" || resolvedStatus.value === "partial_success" || resolvedStatus.value === "failed") {
    return interviewImportStatusDescription({
      status: resolvedStatus.value,
      currentStage: props.state.batch?.currentStage ?? null,
      summary: resolvedSummary.value,
    });
  }

  if (props.state.message) {
    return props.state.message;
  }

  return interviewImportStatusDescription({
    status: resolvedStatus.value,
    currentStage: props.state.batch?.currentStage ?? null,
    summary: resolvedSummary.value,
  });
});

const summaryShellClass = computed(() => {
  if (!isSettled.value) {
    return "";
  }

  if (resolvedStatus.value === "failed") {
    return "rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-4 sm:px-5";
  }

  return "rounded-lg border border-border/60 bg-muted/10 px-4 py-4 sm:px-5";
});
</script>
