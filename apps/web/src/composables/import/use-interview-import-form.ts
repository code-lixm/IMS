import { computed, onBeforeUnmount, ref, watch } from "vue";
import type {
  InterviewImportBatchSummary,
} from "@ims/shared";
import {
  interviewImportApi,
  type InterviewImportBatchItem,
  type InterviewImportCreateResult,
  type InterviewImportTaskItem,
} from "@/api/interview-import";
import { formatImportTimestamp } from "@/composables/import/formatters";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import {
  buildInterviewImportPayload,
  validateInterviewImportFormDraft,
  type InterviewImportFormDraft,
  type InterviewImportSubmissionContext,
  type InterviewImportValidationIssue,
} from "./interview-import-payload";

const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 90;

export interface InterviewImportSubmissionState {
  phase: "idle" | "submitting" | "processing" | "awaiting_confirmation" | "completed" | "failed";
  batch: InterviewImportBatchItem | null;
  task: InterviewImportTaskItem | null;
  summary: InterviewImportBatchSummary | null;
  lastUpdatedAt: number | null;
  message: string;
  errorMessage: string;
}

export type InterviewImportFormContext = "candidate_detail_append";

interface UseInterviewImportFormOptions {
  context?: () => InterviewImportFormContext;
  candidateId?: () => string;
  candidateName?: () => string | null;
  nextRoundNumber?: () => number;
}

function createSubmissionState(): InterviewImportSubmissionState {
  return {
    phase: "idle",
    batch: null,
    task: null,
    summary: null,
    lastUpdatedAt: null,
    message: "",
    errorMessage: "",
  };
}

function resolveSubmissionPhase(status: string | undefined): InterviewImportSubmissionState["phase"] {
  if (status === "completed" || status === "partial_success") {
    return "completed";
  }
  if (status === "failed" || status === "cancelled") {
    return "failed";
  }
  return "processing";
}

function isTerminalStatus(status: string | undefined) {
  return status === "completed"
    || status === "partial_success"
    || status === "failed"
    || status === "cancelled";
}

function extractSummaryFromTask(task: InterviewImportTaskItem | null) {
  if (!task?.resultJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(task.resultJson) as { summary?: InterviewImportBatchSummary | null };
    return parsed.summary ?? null;
  } catch (_error) {
    return null;
  }
}

export function useInterviewImportForm(options: UseInterviewImportFormOptions = {}) {
  const { notifyError, notifyInfo, notifySuccess } = useAppNotifications();

  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const form = ref<InterviewImportFormDraft>({
    meetingNotesText: "",
  });
  const resumePdf = ref<File | null>(null);
  const showValidation = ref(false);
  const submitting = ref(false);
  const submissionState = ref<InterviewImportSubmissionState>(createSubmissionState());

  function resolveContext(): InterviewImportFormContext {
    return options.context?.() ?? "candidate_detail_append";
  }

  function resolveCandidateId(): string {
    return options.candidateId?.().trim() ?? "";
  }

  function resolveCandidateName(): string | null {
    const value = options.candidateName?.() ?? null;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  function resolveNextRoundNumber(): number {
    const value = options.nextRoundNumber?.() ?? 1;
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
  }

  const validationIssues = computed<InterviewImportValidationIssue[]>(() => validateInterviewImportFormDraft(
    form.value,
    {
      resumePdf: resumePdf.value,
    },
  ));

  const fieldErrors = computed<Record<string, string>>(() => {
    if (!showValidation.value) {
      return {};
    }

    return validationIssues.value.reduce<Record<string, string>>((result, issue) => {
      if (issue.severity === "error" && !result[issue.field]) {
        result[issue.field] = issue.message;
      }
      return result;
    }, {});
  });

  const generalWarnings = computed(() => (
    showValidation.value
      ? validationIssues.value.filter((issue) => issue.severity === "warning")
      : []
  ));

  const canSubmit = computed(() => !submitting.value && submissionState.value.phase !== "processing");
  const confirming = ref(false);
  const canConfirm = computed(() => (
    !confirming.value
    && submissionState.value.phase === "awaiting_confirmation"
    && Boolean(submissionState.value.batch?.id)
  ));

  function clearPollTimer() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function resetSubmissionState() {
    clearPollTimer();
    submissionState.value = createSubmissionState();
  }

  function setResumePdf(file: File | null) {
    resumePdf.value = file;
  }

  function resetForm() {
    form.value = {
      meetingNotesText: "",
    };
    resumePdf.value = null;
    showValidation.value = false;
    resetSubmissionState();
  }

  async function pollBatch(batchId: string, remainingAttempts = POLL_ATTEMPTS): Promise<void> {
    try {
      const detail = await interviewImportApi.getBatch(batchId);
      const firstTask = detail.items[0] ?? submissionState.value.task;
      const summary = detail.batch.summary ?? extractSummaryFromTask(firstTask);
      const awaitingConfirmation = summary?.decisionState === "needs_confirmation";

      submissionState.value = {
        phase: awaitingConfirmation ? "awaiting_confirmation" : resolveSubmissionPhase(detail.batch.status),
        batch: detail.batch,
        task: firstTask,
        summary,
        lastUpdatedAt: Date.now(),
        message: awaitingConfirmation
          ? "AI 已给出待确认建议，确认后会继续落库。"
          : isTerminalStatus(detail.batch.status)
            ? `最后更新：${formatImportTimestamp(Date.now())}`
            : "服务器正在处理本次面试导入，请稍候...",
        errorMessage: "",
      };

      if (awaitingConfirmation) {
        notifyInfo("AI 需要一次最小确认，确认后会继续处理。");
        return;
      }

      if (isTerminalStatus(detail.batch.status)) {
        if (detail.batch.status === "completed" || detail.batch.status === "partial_success") {
          notifySuccess("面试数据导入已处理完成");
        } else {
          notifyInfo("面试数据导入已结束，请检查失败原因后重试");
        }
        return;
      }

      if (remainingAttempts <= 0) {
        submissionState.value = {
          ...submissionState.value,
          message: "任务仍在处理中，可稍后刷新页面查看最终结果。",
        };
        return;
      }

      clearPollTimer();
      await new Promise<void>((resolve) => {
        pollTimer = setTimeout(() => resolve(), POLL_INTERVAL_MS);
      });
      await pollBatch(batchId, remainingAttempts - 1);
    } catch (error) {
      submissionState.value = {
        ...submissionState.value,
        errorMessage: "批次已创建，但自动刷新结果失败。你可以稍后刷新页面查看最终状态。",
      };
      notifyError(
        reportAppError("import/poll-interview-batch", error, {
          title: "刷新面试导入结果失败",
          fallbackMessage: "导入任务已提交，但暂时无法拉取最新进度",
        }),
      );
    }
  }

  async function submit(): Promise<InterviewImportCreateResult | null> {
    showValidation.value = true;
    const hasBlockingErrors = validationIssues.value.some((issue) => issue.severity === "error");
    if (hasBlockingErrors) {
      notifyInfo("请先补充会议纪要或上传 PDF");
      return null;
    }

    submitting.value = true;
    resetSubmissionState();
    submissionState.value = {
      phase: "submitting",
      batch: null,
      task: null,
      summary: null,
      lastUpdatedAt: Date.now(),
      message: "正在创建面试数据导入任务...",
      errorMessage: "",
    };

    const submissionContext: InterviewImportSubmissionContext = {
      candidateId: resolveCandidateId(),
      candidateName: resolveCandidateName(),
      nextRoundNumber: resolveNextRoundNumber(),
      resumePdf: resumePdf.value,
    };

    try {
      const result = await interviewImportApi.createForCandidateDetail(
        buildInterviewImportPayload(form.value, submissionContext),
        resumePdf.value,
      );

      submissionState.value = {
        phase: result.batch.summary?.decisionState === "needs_confirmation"
          ? "awaiting_confirmation"
          : resolveSubmissionPhase(result.batch.status),
        batch: result.batch,
        task: result.task,
        summary: result.batch.summary ?? extractSummaryFromTask(result.task),
        lastUpdatedAt: Date.now(),
        message: result.batch.summary?.decisionState === "needs_confirmation"
          ? "AI 已生成待确认建议，请先确认后继续。"
          : "任务已提交，正在等待服务器处理。",
        errorMessage: "",
      };
      if (result.batch.summary?.decisionState === "needs_confirmation") {
        notifyInfo("AI 已给出待确认建议，请先确认后继续。");
      } else {
        notifySuccess("面试数据导入任务已提交");
      }

      if (!isTerminalStatus(result.batch.status)) {
        await pollBatch(result.batch.id);
      }

      return result;
    } catch (error) {
      submissionState.value = {
        ...createSubmissionState(),
        phase: "failed",
        errorMessage: "创建导入任务失败，请检查表单后重试。",
      };
      notifyError(
        reportAppError("import/create-interview-batch", error, {
          title: "提交面试导入失败",
          fallbackMessage: "暂时无法创建面试导入任务，请稍后重试",
        }),
      );
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function confirmPending(): Promise<InterviewImportCreateResult | null> {
    const batchId = submissionState.value.batch?.id;
    if (!batchId || !canConfirm.value) {
      return null;
    }

    confirming.value = true;
    submissionState.value = {
      ...submissionState.value,
      phase: "processing",
      message: "正在确认建议并继续落库...",
      errorMessage: "",
    };

    try {
      const result = await interviewImportApi.confirmBatch(batchId);
      submissionState.value = {
        phase: resolveSubmissionPhase(result.batch.status),
        batch: result.batch,
        task: result.task,
        summary: result.batch.summary ?? extractSummaryFromTask(result.task),
        lastUpdatedAt: Date.now(),
        message: "确认已提交，正在继续处理。",
        errorMessage: "",
      };

      if (!isTerminalStatus(result.batch.status)) {
        await pollBatch(result.batch.id);
      }

      return result;
    } catch (error) {
      submissionState.value = {
        ...submissionState.value,
        phase: "awaiting_confirmation",
        errorMessage: "确认建议失败，请稍后重试。",
      };
      notifyError(
        reportAppError("import/confirm-interview-batch", error, {
          title: "确认面试导入失败",
          fallbackMessage: "暂时无法继续处理这批待确认结果",
        }),
      );
      return null;
    } finally {
      confirming.value = false;
    }
  }

  watch(
    () => [resolveContext(), resolveCandidateId(), resolveCandidateName(), resolveNextRoundNumber()] as const,
    () => {
      resetForm();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    clearPollTimer();
  });

  return {
    form,
    resumePdf,
    fieldErrors,
    generalWarnings,
    canSubmit,
    submitting,
    confirming,
    canConfirm,
    submissionState,
    setResumePdf,
    resetForm,
    submit,
    confirmPending,
  };
}
