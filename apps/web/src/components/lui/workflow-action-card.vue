<template>
  <div v-if="workflow && shouldRender" class="w-full max-w-none rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-3 shadow-none dark:border-white/10 dark:bg-white/7">
    <div class="space-y-2.5">
      <div v-if="needsAssessmentNotes" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-[13px] font-semibold text-foreground">请先提供面试纪要</p>
          <span class="inline-flex h-6 items-center rounded-[6px] border border-[#CFE0FF] bg-[#EEF4FF] px-2 text-[11px] font-semibold text-[#0062FF] shadow-none dark:border-primary/25 dark:bg-primary/10 dark:text-primary">
            {{ stageLabel(workflow.currentStage) }}
          </span>
        </div>
        <p class="text-xs leading-5 text-muted-foreground">
          请在输入框给我你和面试人的面试纪要；也可以上传文件。
        </p>
      </div>

      <div v-if="workflow.requiresRoundConfirmation" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-[13px] font-semibold text-foreground">选择角色轮次，直接出题</p>
          <span class="inline-flex h-6 items-center rounded-[6px] border border-[#CFE0FF] bg-[#EEF4FF] px-2 text-[11px] font-semibold text-[#0062FF] shadow-none dark:border-primary/25 dark:bg-primary/10 dark:text-primary">
            {{ stageLabel(workflow.currentStage) }}
          </span>
        </div>
        <p class="text-xs leading-5 text-muted-foreground">
          <template v-if="workflow.suggestedNextRound">
            建议优先继续{{ formatInterviewRoundLabel(workflow.suggestedNextRound) }}；点击一个角色轮次后会立即开始生成该轮面试题。
          </template>
          <template v-else>
            点击一个角色轮次后会立即开始生成该轮面试题。
          </template>
          <span v-if="!canGenerateRoundDirectly" class="text-amber-600 dark:text-amber-400">请先选择模型。</span>
        </p>
      </div>

      <div v-if="workflow.requiresRoundConfirmation" class="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Button
          v-for="round in [1, 2, 3, 4]"
          :key="round"
          type="button"
          :variant="round === 1 ? 'default' : 'outline'"
          :disabled="isSubmitting || !canGenerateRoundDirectly"
          class="h-auto min-h-11 flex-col items-start justify-center gap-0.5 rounded-[6px] px-3 py-2 text-left shadow-none"
          @click="generateRound(round)"
        >
          <span class="text-sm font-semibold">{{ getInterviewRoundRoleLabel(round) ?? `第${round}轮` }}</span>
          <span class="text-xs opacity-80">{{ `第${round}轮 · 立即出题` }}</span>
        </Button>
      </div>

      <div v-if="showAssessmentActionPanel" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-[13px] font-semibold text-foreground">{{ assessmentActionTitle }}</p>
          <span class="inline-flex h-6 items-center rounded-[6px] border border-[#CFE0FF] bg-[#EEF4FF] px-2 text-[11px] font-semibold text-[#0062FF] shadow-none dark:border-primary/25 dark:bg-primary/10 dark:text-primary">
            {{ stageLabel("S2") }}
          </span>
          <span
            v-if="assessmentRound"
            class="inline-flex h-6 items-center rounded-[6px] border border-[#E5E7EB] bg-[#F8FAFD] px-2 text-[11px] font-semibold text-[#4B5563] shadow-none dark:border-white/10 dark:bg-white/8 dark:text-slate-300"
          >
            {{ formatInterviewRoundLabel(assessmentRound) }}
          </span>
        </div>
        <p class="text-xs leading-5 text-muted-foreground">
          {{ assessmentActionDescription }}
        </p>
        <div class="grid gap-2 sm:grid-cols-3">
          <Button
            v-if="canLoopToNextRound"
            type="button"
            :disabled="isSubmitting"
            class="h-auto min-h-12 flex-col items-start justify-center gap-0.5 rounded-[6px] px-3 py-2 text-left shadow-none whitespace-normal"
            @click="advanceToStage('S1')"
          >
            <span class="text-sm font-semibold">
              {{ workflow.suggestedNextRound ? `继续${formatInterviewRoundLabel(workflow.suggestedNextRound)}` : "继续下一轮角色面试" }}
            </span>
            <span class="text-xs opacity-80">返回 S1，立即开始下一轮出题</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="isSubmitting"
            class="h-auto min-h-12 flex-col items-start justify-center gap-0.5 rounded-[6px] px-3 py-2 text-left shadow-none whitespace-normal"
            @click="scoreDialogOpen = true"
          >
            <span class="text-sm font-semibold">上传面试成绩</span>
            <span class="text-xs opacity-80">同步到抱抱数据平台</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="isSubmitting"
            class="h-auto min-h-12 flex-col items-start justify-center gap-0.5 rounded-[6px] px-3 py-2 text-left shadow-none whitespace-normal"
            @click="copyWechatSummary"
          >
            <span class="text-sm font-semibold">复制评价同步到微信</span>
            <span class="text-xs opacity-80">复制当前 S2 微信文案</span>
          </Button>
        </div>
      </div>

      <div v-if="isCompletedWorkflow" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-[13px] font-semibold text-foreground">流程已完成</p>
          <span class="inline-flex h-6 items-center rounded-[6px] border border-[#CFE0FF] bg-[#EEF4FF] px-2 text-[11px] font-semibold text-[#0062FF] shadow-none dark:border-primary/25 dark:bg-primary/10 dark:text-primary">
            {{ stageLabel(workflow.currentStage) }}
          </span>
        </div>
        <p class="text-xs leading-5 text-muted-foreground">
          你可以恢复到最近的工作阶段继续执行，也可以从初筛重新开始一轮完整流程。
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            :disabled="isSubmitting"
            class="h-auto min-h-12 flex-col items-start justify-center gap-0.5 rounded-[6px] px-3 py-2 text-left shadow-none whitespace-normal"
            @click="restoreWorkflow()"
          >
            <span class="text-sm font-semibold">恢复到{{ compactStageLabel(restoreTargetStage) }}</span>
            <span class="text-xs opacity-80">保留当前产物与上下文，继续执行</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="isSubmitting"
            class="h-auto min-h-12 flex-col items-start justify-center gap-0.5 rounded-[6px] px-3 py-2 text-left shadow-none whitespace-normal"
            @click="restartWorkflowFromS0()"
          >
            <span class="text-sm font-semibold">从初筛重新开始</span>
            <span class="text-xs opacity-80">保留历史文档，但将流程状态重置到 S0</span>
          </Button>
        </div>
      </div>

      <div v-if="canAdvanceStage" class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-[13px] font-semibold text-foreground">{{ isCompletionConfirmation ? "确认完成流程" : "进入下一阶段" }}</p>
            <span class="inline-flex h-6 items-center rounded-[6px] border border-[#CFE0FF] bg-[#EEF4FF] px-2 text-[11px] font-semibold text-[#0062FF] shadow-none dark:border-primary/25 dark:bg-primary/10 dark:text-primary">
              {{ stageLabel(workflow.currentStage) }}
            </span>
            <span
              v-if="!isCompletionConfirmation"
              class="inline-flex h-6 items-center rounded-[6px] border border-[#E5E7EB] bg-[#F8FAFD] px-2 text-[11px] font-semibold text-[#4B5563] shadow-none dark:border-white/10 dark:bg-white/8 dark:text-slate-300"
            >
              下一步 · {{ compactStageLabel(workflow.recommendedNextStage!) }}
            </span>
          </div>
          <p class="text-xs leading-5 text-muted-foreground">
            <template v-if="isCompletionConfirmation">
              当前流程已经可以收尾，点击后会直接标记为完成。
            </template>
            <template v-else>
              点击后会立即推进到 {{ compactStageLabel(workflow.recommendedNextStage!) }}。
            </template>
          </p>
        </div>
        <Button
          type="button"
          :disabled="isSubmitting"
          class="h-8 shrink-0 rounded-[6px] bg-[#0062FF] px-3 text-xs font-semibold text-white shadow-none hover:bg-[#0057E6]"
          @click="advanceStage"
        >
          <span>
            {{ isCompletionConfirmation ? "确认完成当前流程" : `进入${compactStageLabel(workflow.recommendedNextStage!)}` }}
          </span>
        </Button>
      </div>
    </div>

    <InterviewScoreUploadDialog
      :open="scoreDialogOpen"
      :workflow="workflow"
      :files="files"
      :candidate-detail="candidateDetail"
      @update:open="scoreDialogOpen = $event"
      @uploaded="handleScoreUploaded"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { formatInterviewRoundLabel, getInterviewRoundRoleLabel, type CandidateDetailData } from "@ims/shared"
import { luiApi } from "@/api/lui"
import { Button } from "@/components/ui/button"
import { useAppNotifications } from "@/composables/use-app-notifications"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useLuiStore } from "@/stores/lui"
import type { FileResource, Workflow } from "@/stores/lui"
import InterviewScoreUploadDialog from "./interview-score-upload-dialog.vue"
import {
  getLatestS2Artifact,
  getArtifactContent,
  extractWechatCopyText,
  stripMarkdownFormat,
  extractInterviewRound,
} from "./interview-score-utils"

const props = defineProps<{
  workflow: Workflow | null
  files: FileResource[]
  candidateDetail: CandidateDetailData | null
}>()

const emit = defineEmits<{
  updated: []
}>()

const { notifyError, notifySuccess } = useAppNotifications()
const luiStore = useLuiStore()
const isSubmitting = ref(false)
const scoreDialogOpen = ref(false)

const canGenerateRoundDirectly = computed(() => {
  const modelId = luiStore.selectedModelId
  const provider = luiStore.selectedModelProvider

  if (!modelId || !provider) {
    return false
  }

  const manualModelSelected = modelId.endsWith("::__manual__")
  if (manualModelSelected && !luiStore.customModelName.trim()) {
    return false
  }

  return true
})

const availableNextStages = computed(() => props.workflow?.availableNextStages ?? [])
const latestAssessment = computed(() => props.workflow?.latestAssessment ?? null)
const latestS2Artifact = computed(() => getLatestS2Artifact(props.workflow))
const latestS2Content = computed(() => getArtifactContent(latestS2Artifact.value, props.files))
const latestWechatCopyText = computed(() => latestAssessment.value?.wechatCopyText ?? extractWechatCopyText(latestS2Content.value) ?? "")
const hasAssessmentArtifact = computed(() => Boolean(latestS2Artifact.value))
const needsAssessmentNotes = computed(() => {
  return Boolean(props.workflow?.currentStage === "S2" && !hasAssessmentArtifact.value)
})
const canLoopToNextRound = computed(() => {
  return Boolean(props.workflow?.currentStage === "S2" && availableNextStages.value.includes("S1"))
})
const showAssessmentActionPanel = computed(() => {
  return Boolean(hasAssessmentArtifact.value)
})
const isCompletedWorkflow = computed(() => {
  return Boolean(props.workflow?.currentStage === "completed" || props.workflow?.status === "completed")
})
const restoreTargetStage = computed<Workflow["currentStage"]>(() => {
  if (!props.workflow) {
    return "S0"
  }

  const stages = new Set(props.workflow.artifacts.map((artifact) => artifact.stage))
  if (stages.has("S2")) {
    return "S2"
  }
  if (stages.has("S1")) {
    return "S1"
  }
  return "S0"
})
const canAdvanceStage = computed(() => {
  return Boolean(
    props.workflow
    && !props.workflow.requiresRoundConfirmation
    && !needsAssessmentNotes.value
    && props.workflow.recommendedNextStage
    && props.workflow.currentStage !== "completed"
    && props.workflow.recommendedNextStage !== props.workflow.currentStage,
  )
})
const isCompletionConfirmation = computed(() => {
  return props.workflow?.recommendedNextStage === "completed"
})
const shouldRender = computed(() => {
  return Boolean(
    props.workflow
    && (
      needsAssessmentNotes.value
      || props.workflow.requiresRoundConfirmation
      || showAssessmentActionPanel.value
      || isCompletedWorkflow.value
      || canAdvanceStage.value
    ),
  )
})
const assessmentRound = computed(() => {
  if (latestAssessment.value?.round) {
    return latestAssessment.value.round
  }
  const roundFromWechat = extractInterviewRound(latestWechatCopyText.value)
  if (roundFromWechat) {
    return roundFromWechat
  }
  return props.workflow?.confirmedRound ?? null
})
const assessmentActionTitle = computed(() => {
  return props.workflow?.currentStage === "S2" ? "打分环节" : "面试结果操作"
})
const assessmentActionDescription = computed(() => {
  if (props.workflow?.currentStage === "S2" && canLoopToNextRound.value) {
    return "你可以继续进入下一轮角色面试；上传面试成绩和复制评价同步到微信会常驻保留，后续随时都能再次触发。"
  }

  if (props.workflow?.currentStage === "S2") {
    return "当前轮次已完成打分；你仍可随时上传面试成绩，或复制评价同步到微信。"
  }

  return "最近一次面试环节的评分结果已保留；上传面试成绩和复制评价同步到微信会常驻显示。"
})

function stageLabel(stage: Workflow["currentStage"]) {
  switch (stage) {
    case "S0":
      return "S0 · 初筛"
    case "S1":
      return "S1 · 出题"
    case "S2":
      return "S2 · 面试环节"
    default:
      return "已完成"
  }
}

function compactStageLabel(stage: Workflow["currentStage"]) {
  switch (stage) {
    case "S0":
      return "初筛"
    case "S1":
      return "出题"
    case "S2":
      return "面试环节"
    default:
      return "已完成"
  }
}

async function generateRound(round: number) {
  if (!props.workflow || isSubmitting.value) {
    return
  }

  if (!canGenerateRoundDirectly.value) {
    notifyError(new Error("请先选择可用模型后再生成面试题"), {
      title: "生成面试题失败",
      fallbackMessage: "请先选择模型后再生成面试题",
    })
    return
  }

  const conversationId = props.workflow.conversationId
  if (!conversationId) {
    notifyError(new Error("当前没有可用会话"), {
      title: "生成面试题失败",
      fallbackMessage: "当前会话不可用，请刷新后重试",
    })
    return
  }

  isSubmitting.value = true
  let roundConfirmed = false
  try {
    await luiApi.confirmWorkflowRound(props.workflow.id, round, { silent: true })
    roundConfirmed = true
    const roundLabel = formatInterviewRoundLabel(round)
    await luiStore.sendMessage(conversationId, `请直接生成${roundLabel}的面试题，延续该轮默认考察重点。`)
    emit("updated")
  }
  catch (error) {
    if (roundConfirmed) {
      emit("updated")
    }
    notifyError(error, {
      title: "生成面试题失败",
      fallbackMessage: `暂时无法生成${formatInterviewRoundLabel(round)}面试题`,
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function copyWechatSummary() {
  const rawContent = latestWechatCopyText.value.trim() || latestS2Content.value.trim()
  if (!rawContent) {
    notifyError(new Error("当前没有可复制的微信文案"), {
      title: "复制失败",
      fallbackMessage: "当前 S2 评分报告里没有可复制内容",
    })
    return
  }

  const content = stripMarkdownFormat(rawContent)

  const copied = await copyTextToClipboard(content)
  if (!copied) {
    notifyError(new Error("当前环境不支持剪贴板"), {
      title: "复制失败",
      fallbackMessage: "当前环境不支持复制到剪贴板",
    })
    return
  }

  notifySuccess("已复制评价文案，可直接同步到微信")
}

async function advanceStage() {
  if (!props.workflow || !canAdvanceStage.value || isSubmitting.value) {
    return
  }

  await advanceToStage(props.workflow.recommendedNextStage!)
}

async function advanceToStage(targetStage: Workflow["currentStage"]) {
  if (!props.workflow || isSubmitting.value) {
    return
  }

  isSubmitting.value = true
  try {
    await luiApi.advanceWorkflow(props.workflow.id, {
      silent: true,
      targetStage,
    })
    notifySuccess(
      targetStage === "completed"
        ? "已将当前 workflow 标记为完成"
        : targetStage === "S1"
          ? "已回到出题阶段，准备下一轮"
          : `已推进到 ${compactStageLabel(targetStage)} 阶段`,
    )
    emit("updated")
  }
  catch (error) {
    notifyError(error, {
      title: targetStage === "completed" ? "完成流程失败" : "推进阶段失败",
      fallbackMessage: targetStage === "completed" ? "暂时无法完成当前流程" : "暂时无法推进到下一阶段",
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function restoreWorkflow() {
  if (!props.workflow || isSubmitting.value) {
    return
  }

  isSubmitting.value = true
  try {
    await luiApi.updateWorkflow(props.workflow.id, {
      currentStage: restoreTargetStage.value,
      status: "active",
    })
    notifySuccess(`已恢复到${compactStageLabel(restoreTargetStage.value)}阶段`)
    emit("updated")
  }
  catch (error) {
    notifyError(error, {
      title: "恢复流程失败",
      fallbackMessage: "暂时无法恢复当前流程",
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function restartWorkflowFromS0() {
  if (!props.workflow || isSubmitting.value) {
    return
  }

  isSubmitting.value = true
  try {
    await luiApi.resetWorkflow(props.workflow.id, { targetStage: "S0" })
    notifySuccess("已重置到初筛阶段，可以重新执行整轮流程")
    emit("updated")
  }
  catch (error) {
    notifyError(error, {
      title: "重置流程失败",
      fallbackMessage: "暂时无法重新开始当前流程",
    })
  }
  finally {
    isSubmitting.value = false
  }
}

function handleScoreUploaded() {
  emit("updated")
}
</script>
