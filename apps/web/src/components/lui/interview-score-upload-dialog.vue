<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { INTERVIEW_TYPE_LABELS, type CandidateDetailData } from "@ims/shared"
import { interviewsApi, type BaobaoInterviewResultOption, type BaobaoEliminateReasonOption } from "@/api/interviews"
import { useAppNotifications } from "@/composables/use-app-notifications"
import type { FileResource, Workflow } from "@/stores/lui"
import {
  extractInterviewResultLabel,
  extractRecommendedRank,
  extractWechatCopyText,
  getArtifactContent,
  getLatestS2Artifact,
  stripMarkdownFormat,
} from "./interview-score-utils"
import Button from "@/components/ui/button.vue"
import Checkbox from "@/components/ui/checkbox.vue"
import Input from "@/components/ui/input.vue"
import Label from "@/components/ui/label.vue"
import Textarea from "@/components/ui/textarea.vue"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const FALLBACK_INTERVIEW_RESULTS: BaobaoInterviewResultOption[] = [
  { value: 6, label: "A+", description: "推荐复试，优先录用，重点培养" },
  { value: 7, label: "A", description: "推荐复试，可录用" },
  { value: 8, label: "B+", description: "推荐复试，offer数量不够，可择优录用" },
  { value: 9, label: "B", description: "面试淘汰，但特殊情况可推荐复试" },
  { value: 10, label: "C", description: "面试淘汰" },
]

const FALLBACK_ELIMINATE_REASONS: BaobaoEliminateReasonOption[] = [
  { id: 1, name: "技术能力/业务能力无法达到标准" },
  { id: 2, name: "能力经验与岗位不匹配" },
  { id: 3, name: "沟通能力较差" },
  { id: 51, name: "薪酬待遇不匹配" },
  { id: 52, name: "行业背景不匹配" },
  { id: 53, name: "学历不匹配" },
  { id: 54, name: "稳定性不强" },
  { id: 55, name: "理念风格与团队不符合" },
  { id: 115, name: "放弃面试" },
  { id: 56, name: "其他原因" },
]

const props = defineProps<{
  open: boolean
  workflow: Workflow | null
  files: FileResource[]
  candidateDetail: CandidateDetailData | null
}>()

const emit = defineEmits<{
  (e: "update:open", value: boolean): void
  (e: "uploaded"): void
}>()

const { notifyError, notifySuccess } = useAppNotifications()
const isLoadingMeta = ref(false)
const isSubmitting = ref(false)
const loadError = ref<string | null>(null)
const positionRankOptions = ref<Array<{ value: string; label: string }>>([])
const interviewResultOptions = ref<BaobaoInterviewResultOption[]>([])
const eliminateReasonOptions = ref<BaobaoEliminateReasonOption[]>([])

const form = ref({
  candidateName: "",
  applyPositionName: "",
  interviewTimeText: "",
  interviewTypeText: "",
  interviewEvaluation: "",
  interviewResult: "",
  positionRank: "",
  eliminateReasonIds: [] as number[],
})

const latestS2Artifact = computed(() => getLatestS2Artifact(props.workflow))
const latestS2Content = computed(() => getArtifactContent(latestS2Artifact.value, props.files))
const latestAssessment = computed(() => props.workflow?.latestAssessment ?? null)
const latestWechatCopyText = computed(() => {
  const rawText = latestAssessment.value?.wechatCopyText ?? extractWechatCopyText(latestS2Content.value) ?? ""
  return stripMarkdownFormat(rawText)
})
const candidateInterviews = computed(() => props.candidateDetail?.interviews ?? [])
const selectedInterview = computed(() => candidateInterviews.value[0] ?? null)

const normalizedInterviewResultOptions = computed(() => {
  const options = interviewResultOptions.value.length
    ? interviewResultOptions.value
    : FALLBACK_INTERVIEW_RESULTS

  const currentLabel = normalizeStringValue(form.value.interviewResult).trim()
  if (!currentLabel || options.some((item) => item.label === currentLabel)) {
    return options
  }

  return [
    ...options,
    { value: -1, label: currentLabel, description: null },
  ]
})

const normalizedPositionRankOptions = computed(() => {
  const options = positionRankOptions.value.length
    ? positionRankOptions.value
    : []

  const currentValue = normalizeStringValue(form.value.positionRank).trim()
  if (!currentValue || options.some((item) => item.value === currentValue)) {
    return options
  }

  return [
    ...options,
    { value: currentValue, label: currentValue },
  ]
})

const selectedInterviewResultOption = computed(() => {
  return normalizedInterviewResultOptions.value.find((item) => item.label === normalizeStringValue(form.value.interviewResult)) ?? null
})

const isEliminateReasonRequired = computed(() => {
  return selectedInterviewResultOption.value?.label === "B" || selectedInterviewResultOption.value?.label === "C"
})

const normalizedEliminateReasonOptions = computed(() => {
  const options = eliminateReasonOptions.value.length
    ? eliminateReasonOptions.value
    : FALLBACK_ELIMINATE_REASONS

  return options
})

const latestAssessmentEliminateReasons = computed(() => {
  const rawReasons = (latestAssessment.value as { eliminateReasons?: unknown } | null)?.eliminateReasons
  return Array.isArray(rawReasons)
    ? rawReasons.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
    : []
})

function normalizeStringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
}

const canSubmit = computed(() => {
  const evaluation = normalizeStringValue(form.value.interviewEvaluation)
  const result = normalizeStringValue(form.value.interviewResult)
  const rank = normalizeStringValue(form.value.positionRank)
  const reasonIds = Array.isArray(form.value.eliminateReasonIds) ? form.value.eliminateReasonIds : []

  const baseValid = Boolean(
    selectedInterview.value?.id
    && selectedInterview.value?.remoteId
    && evaluation.trim()
    && result.trim()
    && selectedInterviewResultOption.value
    && selectedInterviewResultOption.value.value > 0
    && rank.trim(),
  )

  if (!baseValid) {
    return false
  }

  if (isEliminateReasonRequired.value) {
    return reasonIds.length > 0
  }

  return true
})

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      loadError.value = null
      return
    }

    initializeForm()
    await loadBaobaoMeta()
  },
)

function initializeForm() {
  loadError.value = null

  const interview = selectedInterview.value
  const candidate = props.candidateDetail?.candidate
  const localWechatText = latestWechatCopyText.value

  form.value = {
    candidateName: latestAssessment.value?.candidateName ?? candidate?.name ?? "",
    applyPositionName: candidate?.position ?? "",
    interviewTimeText: formatInterviewTime(interview?.scheduledAt ?? null),
    interviewTypeText: resolveInterviewTypeLabel(interview?.interviewType ?? null),
    interviewEvaluation: localWechatText,
    interviewResult: latestAssessment.value?.grade ?? extractInterviewResultLabel(localWechatText) ?? interview?.interviewResultString ?? "",
    positionRank: latestAssessment.value?.normalizedRecommendedLevel ?? extractRecommendedRank(localWechatText) ?? "",
    eliminateReasonIds: [],
  }

  positionRankOptions.value = form.value.positionRank
    ? [{ value: form.value.positionRank, label: form.value.positionRank }]
    : []
  interviewResultOptions.value = []
  eliminateReasonOptions.value = []
}

function syncEliminateReasonsFromAssessment() {
  if (!isEliminateReasonRequired.value) {
    form.value.eliminateReasonIds = []
    return
  }

  if (form.value.eliminateReasonIds.length > 0) {
    return
  }

  const reasonNameSet = new Set(latestAssessmentEliminateReasons.value.map((item: string) => item.trim()))
  if (reasonNameSet.size === 0) {
    return
  }

  form.value.eliminateReasonIds = normalizedEliminateReasonOptions.value
    .filter((option) => reasonNameSet.has(option.name))
    .map((option) => option.id)
}

watch(
  [isEliminateReasonRequired, normalizedEliminateReasonOptions, latestAssessmentEliminateReasons],
  () => {
    syncEliminateReasonsFromAssessment()
  },
)

watch(
  () => form.value.interviewResult,
  () => {
    if (!isEliminateReasonRequired.value) {
      form.value.eliminateReasonIds = []
    }
  },
)

async function loadBaobaoMeta() {
  const interview = selectedInterview.value
  if (!interview?.id || !interview.remoteId) {
    loadError.value = "当前候选人还没有可上传到抱抱的面试记录。"
    return
  }

  isLoadingMeta.value = true
  loadError.value = null
  try {
    const result = await interviewsApi.getBaobaoScoreForm(interview.id)

    positionRankOptions.value = result.positionRanks
    interviewResultOptions.value = result.interviewResults
    eliminateReasonOptions.value = result.eliminateReasons

    form.value = {
      candidateName: result.interview.name || form.value.candidateName,
      applyPositionName: result.interview.applyPositionName || form.value.applyPositionName,
      interviewTimeText: formatInterviewTime(result.interview.interviewTime ?? interview.scheduledAt ?? null),
      interviewTypeText: resolveInterviewTypeLabel(result.interview.interviewType ?? interview.interviewType ?? null),
      interviewEvaluation: form.value.interviewEvaluation || result.interview.interviewEvaluation || "",
      interviewResult: form.value.interviewResult || result.interview.interviewResultString || "",
      positionRank: form.value.positionRank || result.interview.positionRank || "",
      eliminateReasonIds: normalizeNumberArray(result.interview.eliminateReasonIds),
    }

    syncEliminateReasonsFromAssessment()
  }
  catch (error) {
    loadError.value = error instanceof Error ? error.message : "加载抱抱面试信息失败"
    notifyError(error, {
      title: "加载抱抱面试信息失败",
      fallbackMessage: "暂时无法读取抱抱的面试表单数据",
    })
  }
  finally {
    isLoadingMeta.value = false
  }
}

async function handleSubmit() {
  if (!selectedInterview.value?.id) {
    return
  }

  if (!canSubmit.value) {
    return
  }

  isSubmitting.value = true
  try {
    const evaluation = normalizeStringValue(form.value.interviewEvaluation).trim()
    const resultLabel = normalizeStringValue(form.value.interviewResult).trim()
    const rank = normalizeStringValue(form.value.positionRank).trim()
    const eliminateReasonIds = isEliminateReasonRequired.value
      ? [...new Set(normalizeNumberArray(form.value.eliminateReasonIds))]
      : undefined

    await interviewsApi.uploadBaobaoScore(selectedInterview.value.id, {
      interviewEvaluation: evaluation,
      interviewResult: selectedInterviewResultOption.value?.value ?? Number.NaN,
      interviewResultLabel: resultLabel,
      positionRank: rank,
      eliminateReasonIds,
    })

    notifySuccess("已上传面试成绩到抱抱")
    emit("uploaded")
    emit("update:open", false)
  }
  catch (error) {
    notifyError(error, {
      title: "上传面试成绩失败",
      fallbackMessage: "暂时无法将面试成绩同步到抱抱",
    })
  }
  finally {
    isSubmitting.value = false
  }
}

function handleOpenChange(open: boolean) {
  emit("update:open", open)
}

function formatInterviewTime(timestamp: number | null | undefined) {
  if (!timestamp) {
    return ""
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function resolveInterviewTypeLabel(interviewType: number | null | undefined) {
  if (typeof interviewType !== "number") {
    return "未填写"
  }

  return INTERVIEW_TYPE_LABELS[interviewType] ?? "未填写"
}

function toggleEliminateReason(reasonId: number, checked: boolean) {
  const next = new Set(normalizeNumberArray(form.value.eliminateReasonIds))
  if (checked) {
    next.add(reasonId)
  } else {
    next.delete(reasonId)
  }
  form.value.eliminateReasonIds = [...next]
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[860px]">
      <DialogHeader>
        <DialogTitle>面试评价</DialogTitle>
        <DialogDescription>
          将当前轮次的打分结果同步到抱抱，表单会优先读取当前 S2 评分报告中的微信复制文案。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5 py-2">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label>候选人：</Label>
            <Input :model-value="form.candidateName" readonly />
          </div>
          <div class="space-y-2">
            <Label>应聘岗位：</Label>
            <Input :model-value="form.applyPositionName" readonly />
          </div>
          <div class="space-y-2">
            <Label>面试时间：</Label>
            <Input :model-value="form.interviewTimeText" readonly />
          </div>
          <div class="space-y-2">
            <Label>面试形式：</Label>
            <Input :model-value="form.interviewTypeText" readonly />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="interview-evaluation">面试评价</Label>
          <Textarea
            id="interview-evaluation"
            v-model="form.interviewEvaluation"
            :rows="14"
            placeholder="请输入可直接同步到抱抱的面试评价内容"
            :disabled="isSubmitting"
            class="min-h-[260px]"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="interview-result">面试结果</Label>
            <Select v-model="form.interviewResult" :disabled="isSubmitting || isLoadingMeta">
              <SelectTrigger id="interview-result">
                <SelectValue placeholder="请选择面试结果" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in normalizedInterviewResultOptions"
                  :key="`${option.value}-${option.label}`"
                  :value="option.label"
                >
                  {{ option.label }}<span v-if="option.description" class="text-muted-foreground">（{{ option.description }}）</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label for="position-rank">推荐职级</Label>
            <Select v-model="form.positionRank" :disabled="isSubmitting || isLoadingMeta">
              <SelectTrigger id="position-rank">
                <SelectValue placeholder="请选择推荐职级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in normalizedPositionRankOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div v-if="isEliminateReasonRequired" class="space-y-3">
          <Label for="eliminate-reason">淘汰原因<span class="text-destructive">（必选，可多选）</span></Label>
          <div class="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
            <label
              v-for="option in normalizedEliminateReasonOptions"
              :key="option.id"
              class="flex items-center gap-2 text-sm"
            >
              <Checkbox
                :checked="form.eliminateReasonIds.includes(option.id)"
                @update:checked="toggleEliminateReason(option.id, $event)"
              />
              <span>{{ option.name }}</span>
            </label>
          </div>
        </div>

        <p v-if="loadError" class="text-sm text-destructive">
          {{ loadError }}
        </p>
      </div>

      <DialogFooter class="gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="isSubmitting"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          type="button"
          :disabled="isSubmitting || isLoadingMeta || !canSubmit"
          @click="handleSubmit"
        >
          {{ isSubmitting ? "提交中..." : "提交" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
