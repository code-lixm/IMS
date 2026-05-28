<template>
  <Dialog
    :open="open"
    content-class="max-w-4xl max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
    @update:open="onUpdateOpen"
  >
    <template #content>
      <AppDialogLayout class="h-[85vh] max-h-[85vh]" body-class="flex min-h-0 flex-col overflow-hidden py-0" footer-class="shrink-0">
        <template #header>
          <div class="flex items-start justify-between gap-3 pr-8">
            <DialogHeader class="min-w-0">
              <DialogTitle class="truncate">{{ dialogTitle }}</DialogTitle>
            </DialogHeader>
            <span
              v-if="showPositionIndicator"
              class="inline-flex shrink-0 items-center rounded-md border-0 bg-[#F1F5FB] px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums"
            >
              {{ currentPosition }} / {{ totalPositions }}
            </span>
          </div>
        </template>

        <Tabs v-model="activeTab" default-value="screening" class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center justify-between rounded-[6px] bg-[#F1F5FB] p-2">
            <TabsList>
              <TabsTrigger value="screening">
                <span class="inline-flex items-center gap-1.5">
                  <Sparkles class="h-3.5 w-3.5 shrink-0" />
                  <span>AI 初筛详情</span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="preview">
                <span class="inline-flex items-center gap-1.5">
                  <FileText class="h-3.5 w-3.5 shrink-0" />
                  <span>原件预览</span>
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div class="relative mt-4 min-h-0 flex-1 overflow-hidden">
            <button
              type="button"
              class="absolute -left-7 top-1/2 z-10 inline-flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-r-full bg-gradient-to-r from-transparent via-background/4 to-transparent text-foreground/10 transition hover:via-muted/20 hover:text-foreground/30 disabled:cursor-not-allowed disabled:opacity-5"
              :disabled="!hasPrev"
              aria-label="查看上一份报告"
              @click="emit('navigate-prev')"
            >
              <ChevronLeft class="h-8 w-8" />
            </button>
            <button
              type="button"
              class="absolute -right-7 top-1/2 z-10 inline-flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-full bg-gradient-to-l from-transparent via-background/4 to-transparent text-foreground/10 transition hover:via-muted/20 hover:text-foreground/30 disabled:cursor-not-allowed disabled:opacity-5"
              :disabled="!hasNext"
              aria-label="查看下一份报告"
              @click="emit('navigate-next')"
            >
              <ChevronRight class="h-8 w-8" />
            </button>

          <!-- AI Screening Tab -->
          <TabsContent value="screening" class="flex h-full min-h-0 flex-col overflow-hidden">
            <div class="flex-1 overflow-y-auto space-y-4 py-2 px-4">
              <!-- 未初筛空态 -->
              <div v-if="!hasScreeningConclusion && !isScreeningRunning" class="flex flex-col items-center justify-center h-full gap-4 py-12">
                <div class="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <ClipboardList class="h-8 w-8 text-muted-foreground" />
                </div>
                <div class="text-center space-y-2">
                  <p class="text-sm font-medium text-foreground">尚未进行 AI 初筛</p>
                  <p class="text-xs text-muted-foreground max-w-xs">
                    该文件已完成解析，但尚未进行 AI 初筛。点击下方按钮推送到 AI 初筛队列。
                  </p>
                </div>
                <Button
                  v-if="file?.candidateId"
                  class="gap-2"
                  @click="file && emit('run-screening', file.id)"
                >
                  <Sparkles class="h-4 w-4" />
                  推送到 AI 初筛队列
                </Button>
              </div>

              <!-- 运行中状态 -->
              <div v-else-if="isScreeningRunning" class="flex flex-col items-center justify-center h-full gap-4 py-12">
                <div class="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 class="h-8 w-8 text-primary animate-spin" />
                </div>
                <div class="text-center space-y-2">
                  <p class="text-sm font-medium text-foreground">AI 初筛进行中</p>
                  <p class="text-xs text-muted-foreground">
                    正在分析候选人资质，请稍候...
                  </p>
                </div>
              </div>

              <!-- 有结论状态 -->
              <template v-else-if="hasScreeningConclusion && screeningData">
                <!-- Match degree card -->
                <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                  <div class="rounded-lg border-0 bg-[#F1F5FB] p-4">
                  <div class="flex items-baseline gap-2">
                    <span class="text-3xl font-bold" :class="matchDegreeColorClass">{{ score }}%</span>
                    <span class="text-sm font-semibold text-foreground">{{ matchDegreeLabel }}</span>
                  </div>
                  <p v-if="displayRecommendedAction" class="mt-2 text-sm leading-6 text-[#4B5563]">
                    {{ displayRecommendedAction }}
                  </p>
                  <div class="mt-3 space-y-1 text-xs text-[#64748B]">
                    <p v-if="templateInfo">模板：{{ screeningTemplateLabel(templateInfo) }}</p>
                    <p>来源：{{ screeningSourceLabel(screeningData.screeningSource) }}</p>
                    <p v-if="recommendationThresholdText">推荐规则：{{ recommendationThresholdText }}</p>
                  </div>
                </div>

                  <div class="space-y-3 rounded-lg border-0 bg-[#F1F5FB] p-4">
                    <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">基础信息</h3>
                    <dl class="space-y-2">
                      <div
                        v-for="item in candidateOverviewItems"
                        :key="item.label"
                        class="text-sm leading-6"
                      >
                        <dt class="inline text-muted-foreground">{{ item.label }}：</dt>
                        <dd class="inline font-medium text-foreground break-words">{{ item.value }}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div class="rounded-lg border-0 bg-[#F1F5FB] p-4">
                  <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">院校信息</h3>
                  <div class="mt-3 space-y-2">
                    <p class="text-base font-semibold leading-tight">{{ universityDisplayName }}</p>
                    <div class="flex items-center gap-2 flex-wrap">
                      <template v-if="verdictBadge">
                        <Badge :variant="verdictBadge.variant" :class="verdictBadge.class">{{ verdictBadge.label }}</Badge>
                      </template>
                      <template v-else-if="isMissingUniversityInfo">
                        <Badge variant="outline" class="border-0 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">院校信息缺失</Badge>
                      </template>
                      <Badge v-else variant="outline">{{ universityFallbackBadge }}</Badge>
                      <Badge v-for="tag in universityTags" :key="tag" variant="secondary">{{ tag }}</Badge>
                    </div>
                    <div v-if="isUniversityVerificationUnavailable" class="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                      <span>外部院校验证服务暂不可用，本次结果不计入不匹配统计，可稍后重试。</span>
                      <Button
                        v-if="file?.id"
                        type="button"
                        variant="outline"
                        size="sm"
                        class="h-7 gap-1.5 border-0 px-2 text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/20"
                        @click="emit('retry-university-verification', file.id)"
                      >
                        <RefreshCw class="h-3 w-3" />
                        重试
                      </Button>
                    </div>
                    <p v-else-if="isUniversityNotFound" class="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                      {{ universityNotFoundHint }}
                    </p>
                    <p v-else-if="universityDetail" class="text-xs text-muted-foreground leading-relaxed">
                      {{ universityDetail }}
                    </p>
                    <p v-else-if="isMissingUniversityInfo" class="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                      {{ universityFallbackHint }}
                    </p>
                    <p v-else class="text-xs text-muted-foreground leading-relaxed">
                      {{ universityFallbackHint }}
                    </p>
                  </div>
                </div>

                <!-- Template Evidence Panel -->
                <Collapsible v-if="hasTemplateEvidence" class="rounded-lg border-0 bg-[#F1F5FB] p-4" :default-open="false">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">模板匹配证据</h3>
                      <p class="mt-1 text-xs leading-5 text-[#64748B]">默认收起，只有在需要核对模板命中依据时再展开。</p>
                    </div>
                    <CollapsibleTrigger class="inline-flex items-center gap-1.5 rounded-[6px] bg-white px-3 py-1.5 text-xs font-semibold text-[#4B5563]">
                      查看证据
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent class="mt-4 space-y-4">
                    <div v-if="templateEvidence?.matched?.length" class="space-y-2">
                      <h4 class="text-sm font-medium text-green-700 flex items-center gap-1.5">
                        <Check class="h-4 w-4" />
                        已匹配 ({{ templateEvidence.matched.length }})
                      </h4>
                      <ul class="space-y-2">
                        <li
                          v-for="(entry, idx) in templateEvidence.matched"
                          :key="idx"
                          class="text-sm flex items-start gap-2"
                        >
                          <Check class="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          <div class="flex-1 min-w-0">
                            <span class="font-medium text-foreground">{{ entry.item }}</span>
                            <p v-if="entry.evidence" class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {{ entry.evidence }}
                            </p>
                          </div>
                        </li>
                      </ul>
                    </div>

                    <div v-if="templateEvidence?.unmatched?.length" class="space-y-2">
                      <h4 class="text-sm font-medium text-amber-700 flex items-center gap-1.5">
                        <AlertCircle class="h-4 w-4" />
                        未匹配 ({{ templateEvidence.unmatched.length }})
                      </h4>
                      <ul class="space-y-2">
                        <li
                          v-for="(entry, idx) in templateEvidence.unmatched"
                          :key="idx"
                          class="text-sm flex items-start gap-2"
                        >
                          <XCircle class="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <div class="flex-1 min-w-0">
                            <span class="font-medium text-foreground">{{ entry.item }}</span>
                            <p v-if="entry.reason" class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {{ entry.reason }}
                            </p>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible v-if="hasAiConclusionDetails" v-slot="{ open }" class="rounded-lg border-0 bg-[#F1F5FB] p-4" :default-open="true">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI 结论详情</h3>
                      <p class="mt-1 text-xs leading-5 text-[#64748B]">综合评价、优点、顾虑和建议可按需展开或收起。</p>
                    </div>
                    <CollapsibleTrigger class="inline-flex items-center gap-1.5 rounded-[6px] bg-white px-3 py-1.5 text-xs font-semibold text-[#4B5563]">
                      {{ open ? "收起结论" : "查看结论" }}
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent class="mt-4 space-y-4">
                    <div v-if="screeningData.screeningConclusion?.summary" class="space-y-2">
                      <h3 class="text-sm font-medium text-muted-foreground">综合评价</h3>
                      <p class="text-sm">{{ screeningData.screeningConclusion.summary }}</p>
                    </div>

                    <div v-if="screeningData.screeningConclusion?.strengths?.length" class="space-y-2">
                      <h3 class="text-sm font-medium text-green-600 flex items-center gap-1.5">
                        <Check class="h-4 w-4" />
                        优点
                      </h3>
                      <ul class="space-y-1.5">
                        <li
                          v-for="(strength, idx) in screeningData.screeningConclusion.strengths"
                          :key="idx"
                          class="text-sm flex items-start gap-2"
                        >
                          <Check class="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          <span>{{ strength }}</span>
                        </li>
                      </ul>
                    </div>

                    <div v-if="screeningData.screeningConclusion?.concerns?.length" class="space-y-2">
                      <h3 class="text-sm font-medium text-amber-600 flex items-center gap-1.5">
                        <AlertCircle class="h-4 w-4" />
                        顾虑
                      </h3>
                      <ul class="space-y-1.5">
                        <li
                          v-for="(concern, idx) in screeningData.screeningConclusion.concerns"
                          :key="idx"
                          class="text-sm flex items-start gap-2"
                        >
                          <AlertCircle class="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <span>{{ concern }}</span>
                        </li>
                      </ul>
                    </div>

                    <div v-if="displayRecommendedAction" class="space-y-2">
                      <h3 class="text-sm font-medium text-muted-foreground">建议操作</h3>
                      <p class="text-sm text-foreground/80">
                        {{ displayRecommendedAction }}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <!-- Error message -->
                <div v-if="screeningData.screeningError" class="space-y-2">
                  <h3 class="text-sm font-medium text-destructive">错误信息</h3>
                  <p class="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 rounded-lg px-3 py-2">
                    {{ screeningData.screeningError }}
                  </p>
                </div>

                <div v-if="showLearningFeedbackPanel" class="space-y-4 rounded-[8px] border-0 bg-[#F1F5FB] p-4">
                  <div class="flex flex-col gap-3">
                    <div class="min-w-0">
                      <h3 class="text-sm font-semibold text-[#1A1A1A]">人工改分与学习反馈</h3>
                      <p class="mt-1 text-xs leading-5 text-[#64748B]">
                        保留原始 AI 分数，人工改分作为覆盖层参与推荐判断。
                      </p>
                    </div>
                    <Badge variant="secondary" class="w-fit rounded-[6px] border-0 bg-white px-3 py-1 text-xs font-semibold text-[#4B5563]">
                      {{ learningStatusText }}
                    </Badge>
                  </div>

                  <div class="space-y-3">
                    <div class="grid gap-2 sm:grid-cols-3">
                      <div class="rounded-[6px] border-0 bg-white p-3">
                        <p class="text-[11px] text-[#64748B]">原始 AI</p>
                        <p class="mt-1 text-xl font-semibold text-[#1A1A1A]">{{ rawScore }}%</p>
                      </div>
                      <div class="rounded-[6px] border-0 bg-white p-3">
                        <p class="text-[11px] text-[#64748B]">当前生效</p>
                        <p class="mt-1 text-xl font-semibold" :class="matchDegreeColorClass">{{ score }}%</p>
                      </div>
                      <div class="rounded-[6px] border-0 bg-white p-3">
                        <p class="text-[11px] text-[#64748B]">覆盖状态</p>
                        <p class="mt-1 text-sm font-semibold leading-6 text-[#1A1A1A]">{{ currentOverride ? '已改分' : '未覆盖' }}</p>
                      </div>
                    </div>

                    <div v-if="currentOverride" class="space-y-1.5 rounded-[6px] border-0 bg-[#EEF4FF] p-3 text-sm">
                      <p class="font-medium text-[#1A1A1A]">最近一次：{{ currentOverride.originalScore }} → {{ currentOverride.overriddenScore }}</p>
                      <p v-if="currentOverride.reason" class="break-words text-[#64748B]">{{ currentOverride.reason }}</p>
                      <p class="text-xs text-[#64748B]">
                        {{ formatFeedbackTime(currentOverride.createdAt) }}
                        <span v-if="currentOverride.learningEnabledSnapshot">· 已纳入本地学习</span>
                      </p>
                    </div>
                  </div>

                  <div class="rounded-[6px] border-0 bg-white p-4">
                    <div class="space-y-3">
                      <div class="space-y-2">
                        <Label for="override-score-input" class="text-xs font-semibold text-[#4B5563]">修改后分数</Label>
                        <Input id="override-score-input" v-model="overrideScoreInput" class="h-10 rounded-[6px] border-0 bg-[#F8FAFD] text-base shadow-none" inputmode="numeric" placeholder="0-100" />
                      </div>
                      <div class="space-y-2">
                        <Label for="override-reason-input" class="text-xs font-semibold text-[#4B5563]">修改原因</Label>
                        <Textarea id="override-reason-input" v-model="overrideReasonInput" class="min-h-[116px] rounded-[6px] border-0 bg-[#F8FAFD] px-3 py-2 text-sm leading-6 shadow-none placeholder:text-[#6B7A90] focus:bg-white focus:ring-1 focus:ring-[#0062FF]/25" rows="4" placeholder="例如：项目经历比 AI 判断更贴近岗位，补充了低代码平台实战经验" />
                      </div>
                    </div>

                    <p v-if="overrideValidationMessage" class="mt-3 text-sm text-destructive">{{ overrideValidationMessage }}</p>

                    <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <Button
                        v-if="currentOverride"
                        type="button"
                        variant="secondary"
                        :disabled="scoreActionPending"
                        @click="file?.id && emit('clear-score-override', file.id)"
                      >
                        清除当前改分
                      </Button>
                      <Button
                        type="button"
                        :disabled="Boolean(overrideValidationMessage) || scoreActionPending || !file?.id"
                        @click="submitScoreOverride"
                      >
                        {{ scoreActionPending ? '保存中...' : '保存人工改分' }}
                      </Button>
                    </div>
                  </div>

                  <div v-if="feedbackHistory.length > 0" class="space-y-2">
                    <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">改分记录</h4>
                    <div class="space-y-2">
                      <div v-for="item in feedbackHistory" :key="item.id" class="space-y-1 rounded-lg border-0 bg-white p-3 text-sm">
                        <p class="font-medium text-foreground">{{ item.originalScore }} → {{ item.overriddenScore }}</p>
                        <p v-if="item.reason" class="break-words text-muted-foreground">原因：{{ item.reason }}</p>
                        <p class="text-xs text-muted-foreground">
                          {{ formatFeedbackTime(item.createdAt) }}
                          <span v-if="item.learningEnabledSnapshot">· 已纳入本地学习样本</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </TabsContent>

          <!-- Preview Tab -->
          <TabsContent value="preview" class="flex h-full min-h-0 flex-col overflow-hidden">
            <div class="mx-4 min-h-0 flex-1 rounded-md border-0 bg-[#F1F5FB]">
              <!-- Loading -->
              <div v-if="previewLoading" class="flex h-full items-center justify-center text-sm text-muted-foreground py-12">
                <Loader2 class="h-5 w-5 mr-2 animate-spin" />
                正在加载原件预览…
              </div>

              <!-- Error -->
              <div v-else-if="previewError" class="flex h-full items-center justify-center px-6 text-sm text-destructive py-12">
                <AlertCircle class="h-5 w-5 mr-2" />
                {{ previewError }}
              </div>

              <!-- PDF Preview -->
              <iframe
                v-else-if="previewObjectUrl && isPdf"
                :src="previewObjectUrl"
                class="h-full min-h-[56vh] w-full rounded-md"
                title="PDF 预览"
              />

              <!-- Image Preview -->
              <div v-else-if="previewObjectUrl && isImage" class="flex h-full min-h-[56vh] items-center justify-center bg-background p-4">
                <img
                  :src="previewObjectUrl"
                  :alt="previewFileName || '原件预览'"
                  class="max-h-full max-w-full rounded-md object-contain"
                />
              </div>

              <!-- Unsupported -->
              <div v-else class="flex h-full items-center justify-center px-6 text-sm text-muted-foreground py-12">
                <FileText class="h-8 w-8 mb-2 text-muted-foreground/50" />
                <p>当前原件暂不支持内嵌阅读，请下载后查看。</p>
              </div>
            </div>
          </TabsContent>
          </div>
        </Tabs>

        <template #footer>
          <Button variant="outline" @click="emit('update:open', false)">
            关闭
          </Button>
        </template>
      </AppDialogLayout>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from "vue";
import type { BatchScreeningConfig, ImportTaskResultData } from "@ims/shared";
import { deriveScreeningRecommendation, formatScreeningThresholdSummary, getEffectiveScreeningScore } from "@ims/shared";
import type { ImportFileTask } from "@ims/shared";
import { candidatesApi, resolveResumePreviewContentType } from "@/api/candidates";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2, FileText, ClipboardList, Sparkles, RefreshCw, XCircle } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AppDialogLayout, Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { TabsList } from "@/components/ui/tabs";
import { TabsTrigger } from "@/components/ui/tabs";
import { TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractImportOriginalFileName, screeningSourceLabel, screeningUniversityTags, screeningUniversityVerdictBadgeProps, screeningTemplateLabel } from "@/composables/import/formatters";
import { buildScreeningCandidateOverviewItems } from "@/composables/import/screening-summary";

type TemplateEvidence = {
  matched: { item: string; evidence?: string }[];
  unmatched: { item: string; reason?: string }[];
};

type ImportTaskResultWithConfidence = ImportTaskResultData & {
  extractionConfidence?: number | null;
  screeningConclusion?: (ImportTaskResultData["screeningConclusion"] & {
    templateEvidence?: TemplateEvidence | null;
  }) | null;
};

const props = defineProps<{
  open: boolean;
  screeningData: ImportTaskResultWithConfidence | null;
  file: ImportFileTask | null;
  batchScreeningConfig?: BatchScreeningConfig | null;
  scoreActionPending?: boolean;
  currentPosition?: number;
  totalPositions?: number;
  hasPrev?: boolean;
  hasNext?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "run-screening", taskId: string): void;
  (e: "retry-university-verification", taskId: string): void;
  (e: "override-score", payload: { taskId: string; score: number; reason?: string | null }): void;
  (e: "clear-score-override", taskId: string): void;
  (e: "navigate-prev"): void;
  (e: "navigate-next"): void;
}>();

// Tabs state
const activeTab = ref("screening");

// Preview state
const previewObjectUrl = ref<string | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const previewContentType = ref<string | null>(null);
const previewFileName = ref<string | null>(null);
const previewRequestToken = ref(0);

// Computed properties
const hasScreeningConclusion = computed(() => {
  return !!props.screeningData?.screeningConclusion;
});

const score = computed(() => {
  return getEffectiveScreeningScore(props.screeningData?.screeningConclusion ?? null) ?? 0;
});

const rawScore = computed(() => {
  return props.screeningData?.screeningConclusion?.score ?? 0;
});

const derivedRecommendation = computed(() => {
  const conclusion = props.screeningData?.screeningConclusion;
  if (!conclusion) {
    return null;
  }

  return conclusion.derivedRecommendation
    ?? deriveScreeningRecommendation(getEffectiveScreeningScore(conclusion), props.batchScreeningConfig ?? null);
});

const currentOverride = computed(() => {
  return props.screeningData?.screeningConclusion?.scoreOverride ?? null;
});

const feedbackHistory = computed(() => {
  return props.screeningData?.scoreFeedbackHistory ?? [];
});

const learningStatusText = computed(() => {
  return props.batchScreeningConfig?.learningEnabled ? "本地学习已开启" : "本地学习未开启";
});

const showLearningFeedbackPanel = computed(() => {
  return Boolean(props.batchScreeningConfig?.learningEnabled);
});

const overrideScoreInput = ref("");
const overrideReasonInput = ref("");

const overrideValidationMessage = computed(() => {
  if (!overrideScoreInput.value.trim()) {
    return "请输入修改后的分数";
  }
  const parsed = Number(overrideScoreInput.value.trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return "改分必须是 0 到 100 之间的整数";
  }
  return null;
});

function syncOverrideForm() {
  overrideScoreInput.value = currentOverride.value
    ? String(currentOverride.value.overriddenScore)
    : String(rawScore.value || 0);
  overrideReasonInput.value = currentOverride.value?.reason ?? "";
}

function formatFeedbackTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function submitScoreOverride() {
  if (!props.file?.id || overrideValidationMessage.value) {
    return;
  }

  emit("override-score", {
    taskId: props.file.id,
    score: Number(overrideScoreInput.value.trim()),
    reason: overrideReasonInput.value.trim() || null,
  });
}

const matchDegreeColorClass = computed(() => {
  if (derivedRecommendation.value?.verdict === "pass") return "text-blue-600";
  if (derivedRecommendation.value?.verdict === "review") return "text-amber-600";
  if (derivedRecommendation.value?.verdict === "reject") return "text-red-600";
  return "text-muted-foreground";
});

const matchDegreeLabel = computed(() => {
  return derivedRecommendation.value ? `推荐${derivedRecommendation.value.label}` : "待确认";
});

const displayRecommendedAction = computed(() => {
  const recommendation = derivedRecommendation.value;
  if (recommendation?.verdict === "reject") {
    return "建议先淘汰或转人工复核，不直接推进技术面试。";
  }

  if (recommendation?.verdict === "review") {
    return "建议进入人工复核，重点核查边界信息和关键经历真实性。";
  }

  if (recommendation?.verdict === "pass") {
    return props.screeningData?.screeningConclusion?.recommendedAction
      ?? "建议安排技术面试，围绕岗位关键能力继续深挖。";
  }

  return props.screeningData?.screeningConclusion?.recommendedAction ?? "";
});

const recommendationThresholdText = computed(() => {
  const recommendation = derivedRecommendation.value;
  if (!recommendation) {
    return "";
  }

  return formatScreeningThresholdSummary({
    groupId: props.batchScreeningConfig?.groupId ?? null,
    passThreshold: recommendation.passThreshold,
    reviewThreshold: recommendation.reviewThreshold,
    learningEnabled: props.batchScreeningConfig?.learningEnabled ?? false,
  });
});

const templateInfo = computed(() => {
  return props.screeningData?.screeningConclusion?.templateInfo ?? null;
});

const candidateOverviewItems = computed(() => {
  return buildScreeningCandidateOverviewItems(props.screeningData);
});

const universityVerification = computed(() => {
  return props.screeningData?.screeningConclusion?.universityVerification
    ?? props.screeningData?.universityVerification
    ?? null;
});

const parsedEducationItems = computed(() => {
  return props.screeningData?.parsedResume?.education
    ?.map(item => item.trim())
    .filter(Boolean) ?? [];
});

const universityDisplayName = computed(() => {
  return universityVerification.value?.schoolName
    ?? inferredSchoolName.value
    ?? "待院校认证";
});

const inferredSchoolName = computed(() => {
  const education = parsedEducationItems.value[0];
  if (!education) return null;
  const normalized = education.replace(/\s+/g, " ").trim();
  const schoolMatch = normalized.match(/([\u4e00-\u9fa5A-Za-z·.&\- ]{2,40}(?:大学|学院|学校|University|College|Institute))/i);
  return schoolMatch?.[1]?.trim() ?? null;
});

const educationPreview = computed(() => {
  const education = parsedEducationItems.value[0]?.replace(/\s+/g, " ").trim();
  if (!education) return "";
  return education.length > 72 ? `${education.slice(0, 72)}…` : education;
});

const universityTags = computed(() => {
  return universityVerification.value ? screeningUniversityTags(universityVerification.value) : [];
});

const universityDetail = computed(() => {
  return universityVerification.value?.detail?.trim() ?? "";
});

const isUniversityVerificationUnavailable = computed(() => {
  return universityVerification.value?.verdict === "api_failed";
});

const isUniversityNotFound = computed(() => {
  return universityVerification.value?.verdict === "not_found";
});

const isMissingUniversityInfo = computed(() => {
  return !universityVerification.value && parsedEducationItems.value.length === 0;
});

const universityFallbackBadge = computed(() => {
  return parsedEducationItems.value.length > 0 ? "待重新分析" : "未识别";
});

const universityFallbackHint = computed(() => {
  return parsedEducationItems.value.length > 0
    ? `缺少院校认证结果，请重新分析以触发院校库查询。${educationPreview.value ? `教育经历：${educationPreview.value}` : ""}`
    : "简历中未识别到教育经历或院校信息，建议人工补充后再判断学历背景。";
});

const universityNotFoundHint = computed(() => {
  const detail = universityDetail.value;
  return detail
    ? `院校库未找到该院校，可能是院校名称填写异常，建议人工核实。${detail}`
    : "院校库未找到该院校，可能是院校名称填写异常，建议人工核实。";
});

const verdictBadge = computed(() => {
  return screeningUniversityVerdictBadgeProps(universityVerification.value?.verdict);
});

const templateEvidence = computed(() => {
  const te = props.screeningData?.screeningConclusion?.templateEvidence;
  if (!te) return null;
  return {
    matched: te.matched ?? [],
    unmatched: te.unmatched ?? [],
  };
});

const hasTemplateEvidence = computed(() => {
  const te = templateEvidence.value;
  return !!te && (te.matched.length > 0 || te.unmatched.length > 0);
});

const hasAiConclusionDetails = computed(() => {
  return Boolean(
    props.screeningData?.screeningConclusion?.summary
    || props.screeningData?.screeningConclusion?.strengths?.length
    || props.screeningData?.screeningConclusion?.concerns?.length
    || displayRecommendedAction.value,
  );
});

const isScreeningRunning = computed(() => {
  return props.file?.stage === "ai_screening";
});

const dialogTitle = computed(() => {
  return extractImportOriginalFileName(props.file?.originalPath, "文件");
});

const currentPosition = computed(() => {
  return props.currentPosition ?? 0;
});

const totalPositions = computed(() => {
  return props.totalPositions ?? 0;
});

const showPositionIndicator = computed(() => {
  return totalPositions.value > 0 && currentPosition.value > 0;
});

const isPdf = computed(() => {
  return previewContentType.value === "application/pdf" || previewFileName.value?.toLowerCase().endsWith(".pdf");
});

const isImage = computed(() => {
  if (!previewContentType.value) return false;
  return previewContentType.value.startsWith("image/");
});

// Preview logic
async function loadPreview(candidateId: string | undefined) {
  if (!candidateId) {
    previewError.value = "无法预览：缺少候选人 ID";
    return;
  }

  const requestToken = ++previewRequestToken.value;
  previewLoading.value = true;
  previewError.value = null;
  previewContentType.value = null;
  previewFileName.value = null;
  revokePreviewObjectUrl();

  try {
    const { items } = await candidatesApi.listResumes(candidateId);
    const latestResume = [...items].sort((left, right) => right.createdAt - left.createdAt)[0];

    if (!latestResume) {
      throw new Error("该候选人暂无可预览的简历原件");
    }

    if (requestToken !== previewRequestToken.value || !props.open) {
      return;
    }

    const preview = await candidatesApi.loadResumePreviewSource(latestResume.id);
    if (requestToken !== previewRequestToken.value || !props.open) {
      URL.revokeObjectURL(preview.objectUrl);
      return;
    }

    previewObjectUrl.value = preview.objectUrl;
    previewContentType.value = preview.contentType
      ?? resolveResumePreviewContentType(latestResume.fileType, latestResume.fileName);
    previewFileName.value = preview.fileName ?? latestResume.fileName;
  } catch (error) {
    if (requestToken !== previewRequestToken.value) return;
    previewError.value = error instanceof Error ? error.message : "原件预览加载失败";
  } finally {
    if (requestToken === previewRequestToken.value) {
      previewLoading.value = false;
    }
  }
}

function revokePreviewObjectUrl() {
  if (!previewObjectUrl.value) return;

  if (previewObjectUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(previewObjectUrl.value);
  }

  previewObjectUrl.value = null;
}

function cleanupPreview() {
  previewRequestToken.value += 1;
  revokePreviewObjectUrl();
  previewError.value = null;
  previewLoading.value = false;
  previewContentType.value = null;
  previewFileName.value = null;
}

function onUpdateOpen(value: boolean) {
  emit("update:open", value);
  if (!value) {
    cleanupPreview();
    activeTab.value = "screening";
  }
}

// Watch for tab changes to load preview
watch(activeTab, (newTab) => {
  if (newTab === "preview") {
    const candidateId = props.file?.candidateId;
    if (candidateId) {
      void loadPreview(candidateId);
    } else {
      previewError.value = "无法预览：该文件尚未关联候选人";
    }
  }
});

// Watch for dialog open to reset state
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    activeTab.value = "screening";
    cleanupPreview();
    syncOverrideForm();
  }
});

watch(() => props.screeningData, () => {
  if (props.open) {
    syncOverrideForm();
  }
}, { deep: true });

onBeforeUnmount(() => {
  cleanupPreview();
});
</script>
