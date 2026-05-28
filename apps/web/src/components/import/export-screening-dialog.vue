<template>
  <Dialog
    :open="open"
    content-class="top-[5vh] max-w-[1160px] max-h-[90vh] -translate-y-0 overflow-hidden rounded-[18px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
    @update:open="handleDialogOpenChange"
  >
    <template #content>
      <AppDialogLayout class="max-h-[calc(90vh-2rem)]" body-class="pr-7 sm:pr-9">
        <template #header>
          <DialogHeader class="space-y-3">
            <DialogTitle class="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
              导出报告
            </DialogTitle>
            <DialogDescription class="max-w-[720px] text-[13px] leading-6 text-[#6B7280]">
              已完成初筛的结果会按统一命名导出。
            </DialogDescription>
          </DialogHeader>
        </template>

        <div class="space-y-6">
          <section class="space-y-3 border-t border-[#E5E7EB] pt-5">
            <div class="flex items-center justify-between gap-3">
              <p class="text-[13px] font-semibold text-[#1A1A1A]">导出方式</p>
              <p class="text-[12px] text-[#6B7280]">
                {{ selectedMode === "wechat_text" ? "适合直接发送" : selectedMode === "zip_bundle" ? "适合常规打包" : "适合精确指定文件" }}
              </p>
            </div>
            <div class="grid gap-2 rounded-[12px] bg-white/70 p-1 md:grid-cols-3">
              <button
                type="button"
                class="rounded-[10px] px-3 py-3 text-left transition-colors"
                :class="selectedMode === 'wechat_text' ? 'bg-[#EEF4FF] text-[#1A1A1A]' : 'text-[#6B7280] hover:bg-[#F3F6FA] hover:text-[#1A1A1A]'"
                @click="selectedMode = 'wechat_text'"
              >
                <div class="text-sm font-semibold">微信文案</div>
                <p class="mt-1 text-xs leading-5">复制即发</p>
              </button>
              <button
                type="button"
                class="rounded-[10px] px-3 py-3 text-left transition-colors"
                :class="selectedMode === 'zip_bundle' ? 'bg-[#EEF4FF] text-[#1A1A1A]' : 'text-[#6B7280] hover:bg-[#F3F6FA] hover:text-[#1A1A1A]'"
                @click="selectedMode = 'zip_bundle'"
              >
                <div class="text-sm font-semibold">ZIP 导出</div>
                <p class="mt-1 text-xs leading-5">一键打包</p>
              </button>
              <button
                type="button"
                class="rounded-[10px] px-3 py-3 text-left transition-colors"
                :class="selectedMode === 'custom_bundle' ? 'bg-[#EEF4FF] text-[#1A1A1A]' : 'text-[#6B7280] hover:bg-[#F3F6FA] hover:text-[#1A1A1A]'"
                @click="selectedMode = 'custom_bundle'"
              >
                <div class="text-sm font-semibold">自定义 ZIP</div>
                <p class="mt-1 text-xs leading-5">手动挑选</p>
              </button>
            </div>
          </section>

          <section class="space-y-3 border-t border-[#E5E7EB] pt-5">
            <Collapsible v-slot="{ open: advancedOpen }" :default-open="false" class="space-y-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-[#1A1A1A]">高级选项</p>
                  <p class="mt-1 text-xs leading-5 text-[#6B7280]">
                    {{ advancedSummary }}
                  </p>
                </div>
                <CollapsibleTrigger as-child>
                  <Button variant="ghost" size="sm" class="h-8 px-2 text-xs">
                    {{ advancedOpen ? "收起" : "调整" }}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent class="space-y-4">
                <div class="grid gap-3 sm:grid-cols-2 lg:max-w-[420px]">
                  <div class="space-y-2">
                    <Label for="score-min">最低分</Label>
                    <Input
                      id="score-min"
                      v-model="scoreMinInput"
                      class="h-[34px] rounded-[6px] border border-[#E5E7EB] bg-white shadow-none"
                      inputmode="numeric"
                      placeholder="不限"
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="score-max">最高分</Label>
                    <Input
                      id="score-max"
                      v-model="scoreMaxInput"
                      class="h-[34px] rounded-[6px] border border-[#E5E7EB] bg-white shadow-none"
                      inputmode="numeric"
                      placeholder="不限"
                    />
                  </div>
                </div>

                <div
                  v-if="selectedMode !== 'wechat_text'"
                  class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div class="text-[13px] text-[#4B5563]">
                    附带初筛报告
                    <span class="ml-1 text-[#9CA3AF]">
                      {{ includeReports ? "包含 Markdown" : "仅保留 PDF" }}
                    </span>
                  </div>
                  <Switch
                    :model-value="includeReports"
                    @update:model-value="includeReports = Boolean($event)"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <p class="text-xs leading-5 text-[#6B7280]">
              仅导出已完成初筛且原件为 PDF 的任务。
            </p>
          </section>

          <section class="space-y-3 border-t border-[#E5E7EB] pt-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-[#1A1A1A]">导出批次</p>
                <p class="mt-1 text-xs leading-5 text-[#6B7280]">
                  {{ selectedBatchIds.length }}/{{ completedBatches.length }} 个批次 · {{ filteredTasks.length }} 个文件
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-xs"
                :disabled="completedBatches.length === 0"
                @click="toggleAllBatches"
              >
                {{ allSelected ? "取消全选" : "全选" }}
              </Button>
            </div>

            <div
              v-if="completedBatches.length === 0"
              class="py-6 text-sm text-[#4B5563]"
            >
              暂无可导出的批次。
            </div>

            <ScrollArea
              v-else
              class="h-[260px]"
              viewport-class="pr-2"
            >
              <div class="divide-y divide-[#E5E7EB]">
                <label
                  v-for="batch in completedBatches"
                  :key="batch.id"
                  class="flex cursor-pointer items-start gap-3 py-3"
                >
                  <Checkbox
                    :checked="selectedBatchIds.includes(batch.id)"
                    class="mt-0.5"
                    @update:checked="toggleBatch(batch.id, $event)"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-[#1A1A1A]">{{
                        formatImportBatchDisplayName(batch)
                      }}</span>
                    </div>
                    <p class="mt-1 text-xs leading-5 text-[#6B7280]">
                      {{ formatImportTimestamp(batch.createdAt) }} · {{ batch.successFiles }}/{{ batch.totalFiles }}
                    </p>
                  </div>
                </label>
              </div>
            </ScrollArea>
          </section>

          <section
            v-if="selectedMode === 'custom_bundle'"
            class="space-y-3 border-t border-[#E5E7EB] pt-5"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-[#1A1A1A]">指定文件</p>
                <p class="mt-1 text-xs leading-5 text-[#6B7280]">
                  {{ selectedTaskIds.length }}/{{ filteredTasks.length }} 已勾选
                </p>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 px-2 text-xs"
                  :disabled="filteredTasks.length === 0"
                  @click="selectAllTasks"
                >
                  全选当前结果
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 px-2 text-xs"
                  :disabled="selectedTaskIds.length === 0"
                  @click="clearTaskSelection"
                >
                  清空勾选
                </Button>
              </div>
            </div>

            <div
              v-if="loadingTasks"
              class="py-6 text-sm text-[#4B5563]"
            >
              正在加载可导出的 PDF 列表...
            </div>

            <div
              v-else-if="filteredTasks.length === 0"
              class="py-6 text-sm text-[#4B5563]"
            >
              当前筛选条件下没有可导出的 PDF 文件。你可以调整分数范围，或切换导出批次。
            </div>

            <ScrollArea
              v-else
              class="h-[300px]"
              viewport-class="pr-2"
            >
              <div class="divide-y divide-[#E5E7EB]">
                <label
                  v-for="task in filteredTasks"
                  :key="task.id"
                  class="flex cursor-pointer items-start gap-3 py-3"
                >
                  <Checkbox
                    :checked="selectedTaskIds.includes(task.id)"
                    class="mt-1"
                    @update:checked="toggleTask(task.id, $event)"
                  />
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="truncate text-sm font-medium text-[#1A1A1A]">{{ task.displayName }}</span>
                      <Badge variant="outline" class="text-[11px]">
                        {{ task.score }} 分
                      </Badge>
                      <Badge
                        v-if="task.recommendationLabel"
                        :class="task.recommendationClass"
                        variant="outline"
                        class="text-[11px]"
                      >
                        {{ task.recommendationLabel }}
                      </Badge>
                      <Badge variant="secondary" class="text-[11px]">{{ task.batchLabel }}</Badge>
                    </div>
                    <p class="text-xs leading-5 text-[#6B7280]">
                      {{ task.position }} · {{ task.yearsLabel }} · {{ task.phoneLabel }}
                    </p>
                  </div>
                </label>
              </div>
            </ScrollArea>
          </section>
        </div>

        <div
          v-if="exportError"
          class="rounded-[6px] bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {{ exportError }}
        </div>

        <template #footer>
          <Button class="h-9 rounded-[6px] text-[13px] font-semibold" variant="outline" @click="emit('update:open', false)"
            >取消</Button
          >
          <Button
            class="h-9 rounded-[6px] bg-[#0062FF] px-4 text-[13px] font-semibold text-white shadow-none hover:bg-[#0057E5]"
            :disabled="
              exporting ||
              selectedBatchIds.length === 0 ||
              (selectedMode === 'custom_bundle' && selectedTaskIds.length === 0)
            "
            @click="handleExport"
          >
            <Upload v-if="!exporting" class="mr-2 h-4 w-4" />
            <Loader2 v-else class="mr-2 h-4 w-4 animate-spin" />
            {{ exporting ? "导出中..." : exportButtonText }}
          </Button>
        </template>
      </AppDialogLayout>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  BatchScreeningConfig,
  ImportBatch,
  ImportFileTask,
  ImportScreeningConclusion,
  ImportScreeningExportMode,
  ImportScreeningExportRequest,
} from "@ims/shared";
import { deriveScreeningRecommendation, getEffectiveScreeningScore, normalizeBatchScreeningConfig } from "@ims/shared";
import {
  Loader2,
  Upload,
} from "lucide-vue-next";
import { importApi } from "@/api/import";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AppDialogLayout } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  formatImportBatchDisplayName,
  formatImportTimestamp,
  parseImportTaskResult,
  screeningRecommendationClass,
} from "@/composables/import/formatters";

interface ExportTaskOption {
  id: string;
  batchId: string;
  batchLabel: string;
  score: number;
  recommendationLabel: string;
  recommendationClass: string;
  displayName: string;
  position: string;
  yearsLabel: string;
  phoneLabel: string;
  fileName: string;
}

type ImportScreeningConclusionWithMetadata = ImportScreeningConclusion & {
  candidateName?: string | null;
  candidatePosition?: string | null;
  candidateYearsOfExperience?: number | null;
};

type ExportUiMode = ImportScreeningExportMode | "zip_bundle";

const props = defineProps<{
  open: boolean;
  batches: ImportBatch[];
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const completedBatches = computed(() =>
  props.batches.filter(
    (batch) => batch.status === "completed" || batch.status === "partial_success",
  ),
);

const selectedMode = ref<ExportUiMode>("zip_bundle");
const selectedBatchIds = ref<string[]>([]);
const selectedTaskIds = ref<string[]>([]);
const scoreMinInput = ref("");
const scoreMaxInput = ref("");
const includeReports = ref(true);
const exporting = ref(false);
const exportError = ref<string | null>(null);
const loadingTasks = ref(false);
const taskCache = ref<Record<string, ImportFileTask[]>>({});
const { notifyError, notifySuccess, notifyWarning } = useAppNotifications();

const allSelected = computed(
  () =>
    completedBatches.value.length > 0 &&
    selectedBatchIds.value.length === completedBatches.value.length,
);

const scoreMin = computed(() => parseScoreValue(scoreMinInput.value));
const scoreMax = computed(() => parseScoreValue(scoreMaxInput.value));
const advancedSummary = computed(() => {
  const parts: string[] = [];
  if (scoreMin.value === null && scoreMax.value === null) {
    parts.push("默认分数范围");
  } else {
    const minLabel = scoreMin.value === null ? "不限" : String(scoreMin.value);
    const maxLabel = scoreMax.value === null ? "不限" : String(scoreMax.value);
    parts.push(`分数 ${minLabel}-${maxLabel}`);
  }

  if (selectedMode.value !== "wechat_text") {
    parts.push(includeReports.value ? "附带报告" : "仅 PDF");
  }

  return parts.join(" · ");
});

const availableTasks = computed<ExportTaskOption[]>(() => {
  return selectedBatchIds.value
    .flatMap((batchId) => {
      const batch = completedBatches.value.find((item) => item.id === batchId);
      const batchScreeningConfig = normalizeBatchScreeningConfig((batch as (ImportBatch & { batchScreeningConfig?: BatchScreeningConfig }) | undefined)?.batchScreeningConfig ?? null);
      const files = taskCache.value[batchId] ?? [];

      return files.flatMap((task) => {
        if (!isPdfTask(task)) return [];
        const result = parseImportTaskResult(task.resultJson);
        const conclusion = result?.screeningConclusion;
        if (
          !result?.parsedResume ||
          result.screeningStatus !== "completed" ||
          !conclusion
        ) {
          return [];
        }
        const conclusionWithMetadata =
          conclusion as ImportScreeningConclusionWithMetadata;
        const effectiveScore = getEffectiveScreeningScore(conclusion) ?? conclusion.score;
        const recommendation = conclusion.derivedRecommendation ?? deriveScreeningRecommendation(effectiveScore, batchScreeningConfig);

        return [
          {
            id: task.id,
            batchId,
            batchLabel: batch ? formatImportBatchDisplayName(batch) : batchId,
            score: effectiveScore,
            recommendationLabel: recommendation?.label ?? conclusion.label,
            recommendationClass: screeningRecommendationClass(recommendation?.verdict ?? conclusion.derivedRecommendation?.verdict ?? conclusion.verdict),
            displayName:
              conclusionWithMetadata.candidateName ??
              result.parsedResume.name ??
              "未命名候选人",
            position:
              conclusionWithMetadata.candidatePosition ??
              result.parsedResume.position ??
              "职位未填写",
            yearsLabel: formatYearsLabel(
              conclusionWithMetadata.candidateYearsOfExperience ??
                result.parsedResume.yearsOfExperience,
            ),
            phoneLabel: result.parsedResume.phone ?? "手机号未填写",
            fileName: resolveTaskFileName(task),
          } satisfies ExportTaskOption,
        ];
      });
    })
    .sort((left, right) => right.score - left.score);
});

const filteredTasks = computed(() => {
  return availableTasks.value.filter((task) => {
    if (scoreMin.value !== null && task.score < scoreMin.value) return false;
    if (scoreMax.value !== null && task.score > scoreMax.value) return false;
    return true;
  });
});

const exportButtonText = computed(() => {
  if (selectedMode.value === "wechat_text") return "导出微信文案";
  if (selectedMode.value === "zip_bundle") return "导出 ZIP 包";
  return "导出自定义 ZIP";
});

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      return;
    }

    exportError.value = null;
    selectedMode.value = "zip_bundle";
    includeReports.value = true;
    scoreMinInput.value = "";
    scoreMaxInput.value = "";
    selectedBatchIds.value = completedBatches.value.map((batch) => batch.id);
    await ensureBatchFilesLoaded(selectedBatchIds.value);
    selectedTaskIds.value = filteredTasks.value.map((task) => task.id);
  },
);

watch(
  selectedBatchIds,
  async (batchIds) => {
    if (!props.open) return;
    await ensureBatchFilesLoaded(batchIds);
    syncSelectedTaskIds();
  },
  { deep: true },
);

watch(filteredTasks, () => {
  if (!props.open) return;
  syncSelectedTaskIds();
});

function handleDialogOpenChange(value: boolean) {
  emit("update:open", value);
}

function toggleBatch(batchId: string, checked: boolean) {
  if (checked) {
    if (!selectedBatchIds.value.includes(batchId)) {
      selectedBatchIds.value = [...selectedBatchIds.value, batchId];
    }
    return;
  }
  selectedBatchIds.value = selectedBatchIds.value.filter(
    (id) => id !== batchId,
  );
}

function toggleAllBatches() {
  selectedBatchIds.value = allSelected.value
    ? []
    : completedBatches.value.map((batch) => batch.id);
}

function toggleTask(taskId: string, checked: boolean) {
  if (checked) {
    if (!selectedTaskIds.value.includes(taskId)) {
      selectedTaskIds.value = [...selectedTaskIds.value, taskId];
    }
    return;
  }
  selectedTaskIds.value = selectedTaskIds.value.filter((id) => id !== taskId);
}

function selectAllTasks() {
  selectedTaskIds.value = filteredTasks.value.map((task) => task.id);
}

function clearTaskSelection() {
  selectedTaskIds.value = [];
}

async function ensureBatchFilesLoaded(batchIds: string[]) {
  const missingBatchIds = batchIds.filter(
    (batchId) => !taskCache.value[batchId],
  );
  if (missingBatchIds.length === 0) {
    return;
  }

  loadingTasks.value = true;
  try {
    const results = await Promise.all(
      missingBatchIds.map(async (batchId) => ({
        batchId,
        items: (await importApi.files(batchId)).items,
      })),
    );

    taskCache.value = {
      ...taskCache.value,
      ...Object.fromEntries(
        results.map((entry) => [entry.batchId, entry.items]),
      ),
    };
  } finally {
    loadingTasks.value = false;
  }
}

function syncSelectedTaskIds() {
  const visibleIds = new Set(filteredTasks.value.map((task) => task.id));
  const retained = selectedTaskIds.value.filter((id) => visibleIds.has(id));
  selectedTaskIds.value =
    retained.length > 0 || filteredTasks.value.length === 0
      ? retained
      : filteredTasks.value.map((task) => task.id);
}

async function handleExport() {
  exporting.value = true;
  exportError.value = null;

  try {
    const payload: ImportScreeningExportRequest = {
      mode:
        selectedMode.value === "wechat_text" ? "wechat_text" : "custom_bundle",
      batchIds: selectedBatchIds.value,
      selectedTaskIds:
        selectedMode.value === "custom_bundle"
          ? selectedTaskIds.value
          : undefined,
      scoreMin: scoreMin.value,
      scoreMax: scoreMax.value,
      includeReports:
        selectedMode.value === "wechat_text" ? false : includeReports.value,
    };

    const { blob, fileName, textContent } =
      await importApi.exportResults(payload);

    if (selectedMode.value === "wechat_text") {
      if (!textContent?.trim()) {
        throw new Error("微信文案为空，无法复制到剪贴板");
      }
      const copied = await copyTextToClipboard(textContent);
      if (!copied) {
        notifyWarning("当前环境不支持自动复制，请检查浏览器剪贴板权限");
        return;
      }
      notifySuccess(`已复制 ${filteredTasks.value.length} 条微信文案`);
      emit("update:open", false);
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    notifySuccess(`导出成功：${fileName}`);
    emit("update:open", false);
  } catch (err) {
    exportError.value =
      err instanceof Error ? err.message : "导出失败，请稍后重试";
    notifyError(exportError.value);
  } finally {
    exporting.value = false;
  }
}

function parseScoreValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function isPdfTask(task: ImportFileTask) {
  const rawName =
    `${task.originalPath} ${task.normalizedPath ?? ""}`.toLowerCase();
  return task.fileType === "pdf" || rawName.includes(".pdf");
}

function resolveTaskFileName(task: ImportFileTask) {
  const raw = task.originalPath.split("#").pop() ?? task.originalPath;
  return raw.split(/[\\/]/).pop() ?? raw;
}

function formatYearsLabel(years: number | null | undefined) {
  return years === null || years === undefined
    ? "经验未填写"
    : `${years} 年经验`;
}

</script>
