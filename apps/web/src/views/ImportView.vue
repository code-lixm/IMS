<template>
  <AppPageShell>
    <AppPageHeader>
      <AppBrandLink />
      <div class="flex-1" />
      <div class="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          class="gap-2"
          data-onboarding="export-screening"
          @click="exportDialogOpen = true"
        >
          <Download class="h-4 w-4" />
          导出 AI
        </Button>
        <div class="relative">
          <Button
            class="gap-2"
            :disabled="isImporting"
            data-onboarding="new-import"
            @click="startImport"
          >
            <Plus class="h-4 w-4" />
            新建导入
          </Button>
          <Badge
            v-if="importBatches.activeBatchCount.value > 0"
            variant="default"
            class="absolute -right-2 -top-2 min-w-5 justify-center rounded-full px-1.5 py-0"
          >
            {{ importBatches.activeBatchCount.value }}
          </Badge>
        </div>
        <AppUserActions />
      </div>
    </AppPageHeader>

    <AppPageContent class="space-y-6">
      <Card
        class="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-muted/30"
      >
        <div
          class="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
        >
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl font-semibold tracking-tight">
                批量导入工作台
              </h1>
              <Badge v-if="hasActiveImports" variant="secondary"
                >{{ importBatches.activeBatchCount }} 个任务进行中</Badge
              >
            </div>
            <p class="text-sm text-muted-foreground">
              支持 PDF、图片、ZIP 批量导入。开启 AI
              初筛后，会在文本解析完成后追加 Agent 风格结论，并持续刷新状态。
            </p>
          </div>

          <div
            data-onboarding="screening-toggle"
            class="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 p-4 md:min-w-[320px]"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium">AI 初筛</p>
                <p class="text-xs text-muted-foreground">
                  导入后自动生成通过 / 待定 / 淘汰结论
                </p>
              </div>
              <Switch
                :model-value="autoScreen"
                @update:model-value="onAutoScreenChange"
              />
            </div>
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                class="inline-flex h-2 w-2 rounded-full"
                :class="autoScreen ? 'bg-green-500' : 'bg-muted-foreground/50'"
              />
              {{
                autoScreen
                  ? "新建导入默认启用 AI 初筛"
                  : "新建导入仅做解析，不自动初筛"
              }}
            </div>
          </div>
        </div>
      </Card>

      <div class="grid gap-3 md:grid-cols-3">
        <Card class="p-4 space-y-1.5">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            批次总数
          </p>
          <p class="text-2xl font-semibold">{{ batches.length }}</p>
          <p class="text-xs text-muted-foreground">
            含历史导入与当前进行中的批次
          </p>
        </Card>
        <Card class="p-4 space-y-1.5">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            运行中
          </p>
          <p class="text-2xl font-semibold">
            {{ importBatches.activeBatchCount.value }}
          </p>
          <p class="text-xs text-muted-foreground">
            会每 3 秒自动刷新，无需手动轮询
          </p>
        </Card>
        <Card class="p-4 space-y-1.5">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            已完成文件
          </p>
          <p class="text-2xl font-semibold">
            {{ completedFiles }}/{{ totalFiles }}
          </p>
          <p class="text-xs text-muted-foreground">
            成功 {{ successFiles }} · 失败 {{ failedFiles }}
          </p>
        </Card>
      </div>

      <Card v-if="loading" class="p-6 space-y-3">
        <Skeleton class="h-4 w-full rounded-md" />
        <Skeleton class="h-4 w-4/5 rounded-md" />
        <Skeleton class="h-4 w-3/5 rounded-md" />
      </Card>

      <EmptyState
        v-else-if="!batches.length"
        scenario="import"
        :action-text="'新建导入'"
        :action-icon="Plus"
        :action-handler="startImport"
      />

      <div v-else class="space-y-4">
        <Card
          v-for="b in batches"
          :key="b.id"
          :class="[
            'overflow-hidden border-border/70 shadow-sm',
            b.status === 'processing'
              ? 'ring-2 ring-primary/30 bg-primary/5'
              : '',
          ]"
        >
          <div class="space-y-4 p-5">
            <div
              class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
            >
              <div class="space-y-2 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <Badge :variant="statusVariant(b.status)">{{
                    statusLabel(b.status)
                  }}</Badge>
                  <Badge
                    v-if="b.status === 'processing'"
                    variant="default"
                    class="animate-pulse"
                    >正在处理</Badge
                  >
                  <Badge v-if="b.autoScreen" variant="outline">AI 初筛</Badge>
                  <span class="text-sm font-medium text-foreground/90"
                    >{{ b.totalFiles }} 个文件</span
                  >
                  <span class="text-xs text-muted-foreground">{{
                    formatImportTimestamp(b.createdAt)
                  }}</span>
                </div>
                <div
                  class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground"
                >
                  <span>批次 {{ b.id.slice(-8) }}</span>
                  <span>·</span>
                  <span>当前阶段：{{ importStageLabel(b.currentStage) }}</span>
                </div>
              </div>

              <div class="flex items-center gap-2 self-start">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="toggleFiles(b.id)"
                >
                  <ChevronDown
                    :class="[
                      'h-3.5 w-3.5 transition-transform',
                      expandedBatches.has(b.id) ? 'rotate-180' : '',
                    ]"
                  />
                  {{ expandedBatches.has(b.id) ? "收起文件" : "查看文件" }}
                </Button>
                <Button
                  v-if="b.failedFiles > 0"
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="retryFailed(b.id)"
                >
                  <RefreshCw class="h-3.5 w-3.5" />
                  重试失败
                </Button>
                <Button
                  v-if="canRerunBatchScreening(b)"
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="rerunBatchScreening(b.id)"
                >
                  <RefreshCw class="h-3.5 w-3.5" />
                  重跑 AI 初筛
                </Button>
                <Button
                  v-if="b.status === 'processing'"
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="cancelBatch(b.id)"
                >
                  <X class="h-3.5 w-3.5" />
                  取消
                </Button>
                <Button
                  v-else
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs text-destructive/70 hover:text-destructive"
                  @click="removeBatch(b.id)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </div>

            <div
              class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
            >
              <div class="space-y-2">
                <Progress
                  :model-value="batchProgress(b.processedFiles, b.totalFiles)"
                  :indicator-class="progressIndicatorClass(b.status)"
                />
                <div
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
                >
                  <span>已处理 {{ b.processedFiles }}/{{ b.totalFiles }}</span>
                  <span
                    >成功
                    <span class="font-medium text-green-600">{{
                      b.successFiles
                    }}</span></span
                  >
                  <span
                    >失败
                    <span class="font-medium text-destructive">{{
                      b.failedFiles
                    }}</span></span
                  >
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-semibold tabular-nums">
                  {{ batchProgress(b.processedFiles, b.totalFiles) }}%
                </p>
                <p class="text-xs text-muted-foreground">
                  {{
                    b.status === "processing" ? "后台持续处理中" : "批次已收口"
                  }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="expandedBatches.has(b.id)"
            class="border-t bg-muted/20 px-5 py-4"
          >
            <div v-if="loadingFiles[b.id]" class="space-y-2">
              <Skeleton
                class="h-16 w-full rounded-xl"
                v-for="i in 3"
                :key="i"
              />
            </div>
            <div
              v-else-if="!batchFiles[b.id]?.length"
              class="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
            >
              暂无文件明细
            </div>
            <div v-else class="space-y-3">
              <article
                v-for="f in batchFiles[b.id]"
                :key="f.id"
                class="rounded-xl border bg-background px-4 py-3 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors"
                @click="
                  parseImportTaskResult(f.resultJson)?.parsedResume &&
                  showScreeningDetail(f)
                "
              >
                <div
                  class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div class="min-w-0 space-y-2 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <Badge
                        :variant="fileStatusVariant(f.status)"
                        class="shrink-0 text-xs"
                      >
                        {{ fileStatusLabel(f.status) }}
                      </Badge>
                      <span
                        v-if="
                          f.stage === 'ai_screening' &&
                          !screeningResult(f)?.screeningConclusion
                        "
                        class="inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900 dark:text-blue-300"
                      >
                        AI 初筛中
                      </span>
                      <span
                        class="min-w-0 flex-1 truncate text-sm font-medium"
                        >{{ fileNameOf(f.originalPath) }}</span
                      >
                      <span
                        v-if="screeningResult(f)?.screeningConclusion"
                        :class="[
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          screeningScoreClass(
                            screeningResult(f)?.screeningConclusion?.score,
                          ),
                        ]"
                      >
                        初筛{{ screeningResult(f)?.screeningConclusion?.label }}
                        <span class="ml-1 opacity-80"
                          >{{
                            screeningResult(f)?.screeningConclusion?.score
                          }}分</span
                        >
                      </span>
                    </div>

                    <div
                      class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground"
                    >
                      <span>阶段：{{ importStageLabel(f.stage) }}</span>
                      <span v-if="screeningResult(f)?.screeningSource"
                        >·
                        {{
                          screeningSourceLabel(
                            screeningResult(f)?.screeningSource,
                          )
                        }}</span
                      >
                    </div>

                    <p
                      v-if="screeningResult(f)?.screeningConclusion?.summary"
                      class="text-sm text-muted-foreground"
                    >
                      {{ screeningResult(f)?.screeningConclusion?.summary }}
                    </p>

                    <p
                      v-if="
                        screeningResult(f)?.screeningConclusion
                          ?.recommendedAction
                      "
                      class="text-sm text-foreground/80"
                    >
                      建议：{{
                        screeningResult(f)?.screeningConclusion
                          ?.recommendedAction
                      }}
                    </p>

                    <p
                      v-if="screeningResult(f)?.screeningError"
                      class="text-xs text-amber-600"
                    >
                      AI 初筛不可用，已回退规则结论：{{
                        screeningResult(f)?.screeningError
                      }}
                    </p>

                    <p
                      v-if="f.errorMessage"
                      class="text-xs text-destructive break-all"
                    >
                      {{ f.errorMessage }}
                    </p>
                  </div>

                  <div
                    class="flex items-center gap-2 shrink-0 mt-2 lg:mt-0 lg:flex-col lg:items-stretch"
                  >
                    <button
                      v-if="parseImportTaskResult(f.resultJson)?.parsedResume"
                      :disabled="
                        screeningResult(f)?.screeningStatus === 'running'
                      "
                      :title="
                        screeningResult(f)?.screeningStatus === 'running'
                          ? '分析中...'
                          : '重新分析'
                      "
                      class="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      @click.stop="
                        screeningResult(f)?.screeningStatus === 'running'
                          ? null
                          : importBatches.rerunFileScreening(f.id, f.batchId)
                      "
                    >
                      <RefreshCw class="h-3.5 w-3.5" />
                      {{
                        screeningResult(f)?.screeningStatus === "running"
                          ? "分析中"
                          : "重新分析"
                      }}
                    </button>
                    <button
                      v-if="parseImportTaskResult(f.resultJson)?.parsedResume"
                      class="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      @click.stop="showScreeningDetail(f)"
                    >
                      <FileSearch class="h-3.5 w-3.5" />
                      查看详情
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </Card>
      </div>
      <ExportScreeningDialog v-model:open="exportDialogOpen" />
    </AppPageContent>

    <ConflictMergeDialog
      :open="conflictDialog.open"
      :conflict-data="conflictDialog.data"
      @update:open="fileImport.setConflictDialogOpen"
      @resolve="fileImport.resolveConflict"
    />

    <AiScreeningDetailDialog
      :open="screeningDialogOpen"
      :screening-data="selectedScreeningData"
      :file="selectedFile"
      @update:open="screeningDialogOpen = $event"
      @run-screening="handleRunFileScreening"
    />
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Download,
  FileSearch,
  Plus,
  ChevronDown,
  RefreshCw,
  Trash2,
  X,
} from "lucide-vue-next";
import AppUserActions from "@/components/app-user-actions.vue";
import AiScreeningDetailDialog from "@/components/import/ai-screening-detail-dialog.vue";
import ExportScreeningDialog from "@/components/import/export-screening-dialog.vue";
import ConflictMergeDialog from "@/components/conflict-merge-dialog.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import { useImportBatches } from "@/composables/import/use-import-batches";
import { useImportFileSelection } from "@/composables/import/use-import-file-selection";
import { useImportPreferences } from "@/composables/import/use-import-preferences";
import {
  fileStatusLabel,
  fileStatusVariant,
  formatImportTimestamp,
  importStageLabel,
  parseImportTaskResult,
  progressIndicatorClass,
  screeningScoreClass,
  screeningSourceLabel,
  statusLabel,
  statusVariant,
} from "@/composables/import/formatters";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Progress from "@/components/ui/progress.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import { Switch } from "@/components/ui/switch";
import EmptyState from "@/components/ui/empty-state.vue";
import type { ImportFileTask } from "@ims/shared";
const importBatches = useImportBatches();
const { autoScreen, setAutoScreen } = useImportPreferences();
const fileImport = useImportFileSelection({
  onImportFinished: importBatches.refresh,
});
const { conflictDialog, isImporting } = fileImport;

const {
  batches,
  loading,
  expandedBatches,
  batchFiles,
  loadingFiles,
  toggleFiles,
  retryFailed,
  rerunScreening,
  cancelBatch,
  deleteBatch,
} = importBatches;

const hasActiveImports = computed(
  () => importBatches.activeBatchCount.value > 0,
);
const totalFiles = computed(() =>
  batches.value.reduce((sum, batch) => sum + batch.totalFiles, 0),
);
const completedFiles = computed(() =>
  batches.value.reduce((sum, batch) => sum + batch.processedFiles, 0),
);
const successFiles = computed(() =>
  batches.value.reduce((sum, batch) => sum + batch.successFiles, 0),
);
const failedFiles = computed(() =>
  batches.value.reduce((sum, batch) => sum + batch.failedFiles, 0),
);

onMounted(() => {
  void importBatches.initialize();
});

function startImport() {
  void fileImport.triggerImport({ autoScreen: autoScreen.value });
}

function screeningResult(file: ImportFileTask) {
  return parseImportTaskResult(file.resultJson);
}

function batchProgress(processed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((processed / total) * 100);
}

function fileNameOf(originalPath: string) {
  return originalPath.split("#").pop()?.split("/").pop() ?? originalPath;
}

function onAutoScreenChange(value: boolean | string) {
  setAutoScreen(Boolean(value));
}

async function removeBatch(batchId: string) {
  if (!window.confirm("删除后将移除此导入批次及其文件明细记录，继续吗？")) {
    return;
  }
  await deleteBatch(batchId);
}

// AI Screening detail dialog
const exportDialogOpen = ref(false);
const screeningDialogOpen = ref(false);
const selectedScreeningData =
  ref<ReturnType<typeof parseImportTaskResult>>(null);
const selectedFile = ref<ImportFileTask | null>(null);

function showScreeningDetail(file: ImportFileTask) {
  const result = parseImportTaskResult(file.resultJson);
  if (result?.parsedResume) {
    selectedScreeningData.value = result;
    selectedFile.value = file;
    screeningDialogOpen.value = true;
  }
}

async function handleRunFileScreening(taskId: string) {
  // Find the batchId for this file
  for (const [batchId, files] of Object.entries(batchFiles.value)) {
    const file = files.find((f) => f.id === taskId);
    if (file) {
      await importBatches.rerunFileScreening(taskId, batchId);
      screeningDialogOpen.value = false;
      return;
    }
  }
}

function canRerunBatchScreening(batch: (typeof batches.value)[number]) {
  return (
    batch.status !== "processing" &&
    batch.status !== "queued" &&
    batch.status !== "cancelled"
  );
}

async function rerunBatchScreening(batchId: string) {
  await rerunScreening(batchId);
}
</script>
