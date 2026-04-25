<template>
  <Dialog
    :open="open"
    content-class="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
    @update:open="onUpdateOpen"
  >
    <template #content>
      <div class="flex-1 grid gap-4 overflow-hidden">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ dialogTitle }}</h2>
          <Button variant="ghost" size="icon" class="h-8 w-8" @click="emit('update:open', false)">
            <X class="h-4 w-4" />
          </Button>
        </div>

        <Tabs v-model="activeTab" default-value="screening" class="flex-1 flex flex-col min-h-0">
          <div class="flex items-center justify-between border-b pb-2">
            <TabsList>
              <TabsTrigger value="screening" class="gap-1.5">
                <Sparkles class="h-3.5 w-3.5" />
                AI 初筛详情
              </TabsTrigger>
              <TabsTrigger value="preview" class="gap-1.5">
                <FileText class="h-3.5 w-3.5" />
                原件预览
              </TabsTrigger>
            </TabsList>
          </div>

          <div class="relative mt-4 flex-1 min-h-0 overflow-hidden">
            <button
              type="button"
              class="absolute -left-5 inset-y-2 z-10 inline-flex w-14 items-center justify-center bg-gradient-to-r from-transparent via-background/5 to-transparent text-foreground/15 transition hover:from-muted/20 hover:via-muted/35 hover:to-transparent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-10"
              :disabled="!hasPrev"
              aria-label="查看上一份报告"
              @click="emit('navigate-prev')"
            >
              <ChevronLeft class="h-11 w-11" />
            </button>
            <button
              type="button"
              class="absolute -right-5 inset-y-2 z-10 inline-flex w-14 items-center justify-center bg-gradient-to-l from-transparent via-background/5 to-transparent text-foreground/15 transition hover:from-muted/20 hover:via-muted/35 hover:to-transparent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-10"
              :disabled="!hasNext"
              aria-label="查看下一份报告"
              @click="emit('navigate-next')"
            >
              <ChevronRight class="h-11 w-11" />
            </button>

          <!-- AI Screening Tab -->
          <TabsContent value="screening" class="flex h-full overflow-hidden flex-col">
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
                <div class="rounded-lg border p-4 space-y-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-2xl font-bold" :class="matchDegreeColorClass">{{ score }}%</p>
                      <p class="text-sm font-medium">{{ matchDegreeLabel }}</p>
                    </div>
                    <div class="text-right text-xs text-muted-foreground">
                      <p v-if="templateInfo">模板：{{ screeningTemplateLabel(templateInfo) }}</p>
                      <p>来源：{{ screeningSourceLabel(screeningData.screeningSource) }}</p>
                    </div>
                  </div>
                </div>

                <!-- University verification -->
                <div v-if="universityVerification" class="rounded-lg border p-4 space-y-2">
                  <h3 class="text-sm font-medium">院校信息</h3>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm">{{ universityVerification.schoolName }}</span>
                    <Badge v-for="tag in screeningUniversityTags(universityVerification)" :key="tag" variant="secondary">{{ tag }}</Badge>
                    <Badge v-if="universityVerification.verdict === 'not_found'" variant="destructive">高危</Badge>
                    <Badge v-else-if="universityVerification.verdict === 'api_failed'" variant="outline">查询失败</Badge>
                  </div>
                  <p v-if="universityVerification.detail" class="text-xs text-muted-foreground">
                    {{ universityVerification.detail }}
                  </p>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <div class="rounded-lg border bg-muted/30 px-3 py-2 space-y-1.5">
                    <div class="text-xs font-medium text-muted-foreground">结果来源</div>
                    <div class="text-sm font-medium text-foreground">
                      {{ screeningSourceLabel(screeningData.screeningSource) || "未标记" }}
                    </div>
                    <p class="text-xs text-muted-foreground leading-5">
                      {{ screeningSourceHint }}
                    </p>
                  </div>

                  <div class="rounded-lg border bg-muted/30 px-3 py-2 space-y-1.5">
                    <div class="text-xs font-medium text-muted-foreground">提取置信度</div>
                    <div class="text-sm font-medium text-foreground">
                      {{ extractionConfidenceText }}
                    </div>
                    <p class="text-xs text-muted-foreground leading-5">
                      {{ extractionConfidenceHint }}
                    </p>
                  </div>
                </div>

                <!-- Summary -->
                <div v-if="screeningData.screeningConclusion?.summary" class="space-y-2">
                  <h3 class="text-sm font-medium text-muted-foreground">综合评价</h3>
                  <p class="text-sm">{{ screeningData.screeningConclusion.summary }}</p>
                </div>

                <!-- Strengths -->
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

                <!-- Concerns -->
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

                <!-- Recommended action -->
                <div v-if="screeningData.screeningConclusion?.recommendedAction" class="space-y-2">
                  <h3 class="text-sm font-medium text-muted-foreground">建议操作</h3>
                  <p class="text-sm text-foreground/80">
                    {{ screeningData.screeningConclusion.recommendedAction }}
                  </p>
                </div>

                <!-- Error message -->
                <div v-if="screeningData.screeningError" class="space-y-2">
                  <h3 class="text-sm font-medium text-destructive">错误信息</h3>
                  <p class="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 rounded-lg px-3 py-2">
                    {{ screeningData.screeningError }}
                  </p>
                </div>
              </template>
            </div>
          </TabsContent>

          <!-- Preview Tab -->
          <TabsContent value="preview" class="flex h-full overflow-hidden flex-col">
            <div class="flex-1 rounded-md border bg-muted/20 min-h-0 mx-4">
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
                class="h-[60vh] w-full rounded-md"
                title="PDF 预览"
              />

              <!-- Image Preview -->
              <div v-else-if="previewObjectUrl && isImage" class="flex h-[60vh] items-center justify-center bg-background p-4">
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

        <div class="flex justify-end pt-2 border-t">
          <Button variant="outline" @click="emit('update:open', false)">
            关闭
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from "vue";
import type { ImportTaskResultData } from "@ims/shared/src/api-types";
import type { ImportFileTask } from "@ims/shared";
import { candidatesApi, resolveResumePreviewContentType } from "@/api/candidates";
import { AlertCircle, Check, ChevronLeft, ChevronRight, X, Loader2, FileText, ClipboardList, Sparkles } from "lucide-vue-next";
import Button from "@/components/ui/button.vue";
import Badge from "@/components/ui/badge.vue";
import Dialog from "@/components/ui/dialog.vue";
import Tabs from "@/components/ui/tabs.vue";
import TabsList from "@/components/ui/tabs-list.vue";
import TabsTrigger from "@/components/ui/tabs-trigger.vue";
import TabsContent from "@/components/ui/tabs-content.vue";
import { screeningSourceLabel, screeningUniversityTags, screeningTemplateLabel } from "@/composables/import/formatters";

type ImportTaskResultWithConfidence = ImportTaskResultData & {
  extractionConfidence?: number | null;
};

const props = defineProps<{
  open: boolean;
  screeningData: ImportTaskResultWithConfidence | null;
  file: ImportFileTask | null;
  hasPrev?: boolean;
  hasNext?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "run-screening", taskId: string): void;
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
  return props.screeningData?.screeningConclusion?.score ?? 0;
});

const matchDegreeColorClass = computed(() => {
  const s = score.value;
  if (s >= 85) return "text-green-600";
  if (s >= 70) return "text-blue-600";
  if (s >= 55) return "text-amber-600";
  return "text-red-600";
});

const matchDegreeLabel = computed(() => {
  const s = score.value;
  if (s >= 85) return "强匹配";
  if (s >= 70) return "较匹配";
  if (s >= 55) return "待确认";
  return "不匹配";
});

const templateInfo = computed(() => {
  return props.screeningData?.screeningConclusion?.templateInfo ?? null;
});

const universityVerification = computed(() => {
  return props.screeningData?.screeningConclusion?.universityVerification ?? null;
});

const isScreeningRunning = computed(() => {
  return props.file?.stage === "ai_screening";
});
const extractionConfidenceValue = computed(() => {
  const raw = props.screeningData?.extractionConfidence;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
});

const extractionConfidenceText = computed(() => {
  const value = extractionConfidenceValue.value;
  return value === null ? "未记录" : `${Math.round(value)} / 100`;
});

const extractionConfidenceHint = computed(() => {
  const value = extractionConfidenceValue.value;
  if (value === null) {
    return "旧数据可能没有记录该值；系统会在重跑时尝试回查或估算。";
  }
  if (value >= 85) {
    return "文本提取质量较高，本次初筛可更多参考模型或规则输出。";
  }
  if (value >= 60) {
    return "文本提取质量中等，建议结合原件预览做人工复核。";
  }
  return "文本提取质量偏弱，当前初筛结论需要谨慎参考。";
});

const screeningSourceHint = computed(() => {
  if (props.screeningData?.screeningSource === "ai") {
    return "本次结论来自模型分析；如果模型失败，系统才会回退到规则评分。";
  }
  if (props.screeningData?.screeningSource === "heuristic") {
    return "本次结论来自规则回退，通常说明模型请求失败或不可用。";
  }
  return "当前结果没有明确来源标记。";
});

const dialogTitle = computed(() => {
  const fileName = props.file?.originalPath?.split("#").pop()?.split("/").pop() ?? "文件";
  return fileName;
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

    previewObjectUrl.value = candidatesApi.getResumePreviewUrl(latestResume.id);
    previewContentType.value = resolveResumePreviewContentType(latestResume.fileType, latestResume.fileName);
    previewFileName.value = latestResume.fileName;
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
  }
});

onBeforeUnmount(() => {
  cleanupPreview();
});
</script>
