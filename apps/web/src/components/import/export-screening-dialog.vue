<template>
  <Dialog
    :open="open"
    content-class="top-[5vh] max-w-5xl max-h-[90vh] -translate-y-0 overflow-hidden"
    @update:open="handleDialogOpenChange"
  >
    <template #content>
      <div class="flex max-h-[calc(90vh-2rem)] flex-col overflow-hidden p-1">
        <DialogHeader>
          <DialogTitle>自定义导出</DialogTitle>
          <DialogDescription>
            支持按分数范围、指定 PDF 文件导出。ZIP
            命名统一为“简历/初筛报告-FE|BE-姓名-工作年限-手机号或邮箱”。
          </DialogDescription>
        </DialogHeader>

        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
          <div class="space-y-5 pb-6">
            <div class="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
              <section
                class="space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div class="space-y-2">
                  <div
                    class="flex items-center gap-2 text-sm font-medium text-foreground"
                  >
                    <SlidersHorizontal class="h-4 w-4" />
                    导出方式
                  </div>
                  <div class="grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      class="rounded-xl border p-4 text-left transition"
                      :class="
                        selectedMode === 'wechat_text'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border/60 hover:border-border hover:bg-muted/30'
                      "
                      @click="selectedMode = 'wechat_text'"
                    >
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <MessageSquareText class="h-4 w-4" />
                        微信文案
                      </div>
                      <p class="mt-2 text-xs leading-5 text-muted-foreground">
                        导出当前筛选结果对应的结构化微信文案，适合直接复制发送。
                      </p>
                    </button>
                    <button
                      type="button"
                      class="rounded-xl border p-4 text-left transition"
                      :class="
                        selectedMode === 'zip_bundle'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border/60 hover:border-border hover:bg-muted/30'
                      "
                      @click="selectedMode = 'zip_bundle'"
                    >
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <PackageOpen class="h-4 w-4" />
                        ZIP 导出
                      </div>
                      <p class="mt-2 text-xs leading-5 text-muted-foreground">
                        快速导出筛选结果，默认按候选人文件夹打包 PDF +
                        初筛报告。
                      </p>
                    </button>
                    <button
                      type="button"
                      class="rounded-xl border p-4 text-left transition"
                      :class="
                        selectedMode === 'custom_bundle'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border/60 hover:border-border hover:bg-muted/30'
                      "
                      @click="selectedMode = 'custom_bundle'"
                    >
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <PackageOpen class="h-4 w-4" />
                        自定义 ZIP 包
                      </div>
                      <p class="mt-2 text-xs leading-5 text-muted-foreground">
                        支持勾选指定 PDF、按需决定是否携带每个人的初筛报告
                        Markdown。
                      </p>
                    </button>
                  </div>
                </div>

                <div
                  class="grid gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 md:grid-cols-2"
                >
                  <div class="space-y-2">
                    <Label for="score-min">最低分</Label>
                    <Input
                      id="score-min"
                      v-model="scoreMinInput"
                      inputmode="numeric"
                      placeholder="例如 70"
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="score-max">最高分</Label>
                    <Input
                      id="score-max"
                      v-model="scoreMaxInput"
                      inputmode="numeric"
                      placeholder="例如 100"
                    />
                  </div>
                </div>

                <div
                  v-if="selectedMode !== 'wechat_text'"
                  class="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4"
                >
                  <div class="space-y-1">
                    <p class="text-sm font-medium">携带每个人的初筛报告</p>
                    <p class="text-xs leading-5 text-muted-foreground">
                      {{
                        selectedMode === "zip_bundle"
                          ? "ZIP 导出默认按候选人目录打包；关闭后会退化为仅导出扁平 PDF 文件。"
                          : "开启后，每位候选人会单独占一个文件夹，包含重命名后的 PDF 和对应 Markdown 报告；关闭后 ZIP 内只保留扁平的 PDF 单文件。"
                      }}
                    </p>
                  </div>
                  <Switch
                    :model-value="includeReports"
                    @update:model-value="includeReports = Boolean($event)"
                  />
                </div>

                <div
                  class="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-xs leading-5 text-muted-foreground"
                >
                  当前导出规则：仅导出已完成初筛且原件为 PDF
                  的任务；文件名统一为
                  <span class="font-medium text-foreground"
                    >base-name-年限-职位-联系方式（手机号）</span
                  >。
                </div>
              </section>

              <section
                class="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium">选择批次</p>
                    <p class="text-xs text-muted-foreground">
                      仅展示可导出批次，切换后会自动刷新对应 PDF 列表。
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
                  class="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-sm text-muted-foreground"
                >
                  暂无可导出的批次。
                </div>

                <ScrollArea
                  v-else
                  class="h-72 rounded-xl border border-border/50 bg-muted/10"
                  viewport-class="p-3"
                >
                  <div class="space-y-2">
                    <label
                      v-for="batch in completedBatches"
                      :key="batch.id"
                      class="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition"
                      :class="
                        selectedBatchIds.includes(batch.id)
                          ? 'border-primary/60 bg-primary/5'
                          : 'border-border/60 hover:border-border hover:bg-muted/30'
                      "
                    >
                      <Checkbox
                        :checked="selectedBatchIds.includes(batch.id)"
                        class="mt-0.5"
                        @update:checked="toggleBatch(batch.id, $event)"
                      />
                      <div class="min-w-0 flex-1 space-y-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-sm font-medium text-foreground">{{
                            formatImportBatchDisplayName(batch)
                          }}</span>
                          <Badge variant="outline" class="text-[11px]"
                            >可导出</Badge
                          >
                        </div>
                        <p class="text-xs text-muted-foreground">
                          {{ formatImportTimestamp(batch.createdAt) }} · 文件
                          {{ batch.totalFiles }} · 成功
                          {{ batch.successFiles }} · 失败
                          {{ batch.failedFiles }}
                        </p>
                      </div>
                    </label>
                  </div>
                </ScrollArea>
              </section>
            </div>

            <section
              v-if="selectedMode === 'custom_bundle'"
              class="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">选择 PDF 文件</p>
                  <p class="text-xs text-muted-foreground">
                    共 {{ filteredTasks.length }} 个符合条件的 PDF
                    文件，当前已勾选 {{ selectedTaskIds.length }} 个。
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
                class="rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-sm text-muted-foreground"
              >
                正在加载可导出的 PDF 列表...
              </div>

              <div
                v-else-if="filteredTasks.length === 0"
                class="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-sm text-muted-foreground"
              >
                当前筛选条件下没有可导出的 PDF
                文件。你可以调整分数范围，或切换导出批次。
              </div>

              <ScrollArea
                v-else
                class="h-[320px] rounded-xl border border-border/50 bg-muted/10"
                viewport-class="p-3"
              >
                <div class="space-y-2">
                  <label
                    v-for="task in filteredTasks"
                    :key="task.id"
                    class="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition"
                    :class="
                      selectedTaskIds.includes(task.id)
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border/60 hover:border-border hover:bg-muted/30'
                    "
                  >
                    <Checkbox
                      :checked="selectedTaskIds.includes(task.id)"
                      class="mt-1"
                      @update:checked="toggleTask(task.id, $event)"
                    />
                    <div class="min-w-0 flex-1 space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class="truncate text-sm font-medium text-foreground"
                          >{{ task.displayName }}</span
                        >
                        <Badge variant="outline" class="text-[11px]"
                          >{{ task.score }} 分</Badge
                        >
                        <Badge variant="secondary" class="text-[11px]">{{
                          task.batchLabel
                        }}</Badge>
                      </div>
                      <div
                        class="grid gap-1 text-xs text-muted-foreground md:grid-cols-2"
                      >
                        <p>岗位：{{ task.position }}</p>
                        <p>年限：{{ task.yearsLabel }}</p>
                        <p>手机：{{ task.phoneLabel }}</p>
                        <p class="truncate">文件：{{ task.fileName }}</p>
                      </div>
                    </div>
                  </label>
                </div>
              </ScrollArea>
            </section>
          </div>
        </div>

        <div
          v-if="exportError"
          class="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {{ exportError }}
        </div>

        <DialogFooter class="mt-4 border-t border-border/60 bg-background pt-4">
          <Button variant="outline" @click="emit('update:open', false)"
            >取消</Button
          >
          <Button
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
        </DialogFooter>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ImportBatch,
  ImportFileTask,
  ImportScreeningConclusion,
  ImportScreeningExportMode,
  ImportScreeningExportRequest,
} from "@ims/shared";
import {
  Loader2,
  MessageSquareText,
  PackageOpen,
  SlidersHorizontal,
  Upload,
} from "lucide-vue-next";
import { importApi } from "@/api/import";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
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
} from "@/composables/import/formatters";

interface ExportTaskOption {
  id: string;
  batchId: string;
  batchLabel: string;
  score: number;
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

const availableTasks = computed<ExportTaskOption[]>(() => {
  return selectedBatchIds.value
    .flatMap((batchId) => {
      const batch = completedBatches.value.find((item) => item.id === batchId);
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

        return [
          {
            id: task.id,
            batchId,
            batchLabel: batch ? formatImportBatchDisplayName(batch) : batchId,
            score: conclusion.score,
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
