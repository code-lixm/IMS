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

          <!-- AI Screening Tab -->
          <TabsContent value="screening" class="flex-1 overflow-hidden flex flex-col mt-4">
            <div class="flex-1 overflow-y-auto space-y-4 py-2">
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
                <!-- Verdict badge -->
                <div class="flex items-center gap-3">
                  <span
                    :class="[
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium',
                      screeningScoreClass(screeningData.screeningConclusion?.score),
                    ]"
                  >
                    初筛{{ screeningData.screeningConclusion?.label }}
                    <span class="ml-1 opacity-80">{{ screeningData.screeningConclusion?.score }}分</span>
                  </span>
                  <Badge variant="outline" class="text-xs">
                    {{ screeningSourceLabel(screeningData.screeningSource) }}
                  </Badge>
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
          <TabsContent value="preview" class="flex-1 overflow-hidden flex flex-col mt-4">
            <div class="flex-1 rounded-md border bg-muted/20 min-h-0">
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
import { candidatesApi } from "@/api/candidates";
import { AlertCircle, Check, X, Loader2, FileText, ClipboardList, Sparkles } from "lucide-vue-next";
import Button from "@/components/ui/button.vue";
import Badge from "@/components/ui/badge.vue";
import Dialog from "@/components/ui/dialog.vue";
import Tabs from "@/components/ui/tabs.vue";
import TabsList from "@/components/ui/tabs-list.vue";
import TabsTrigger from "@/components/ui/tabs-trigger.vue";
import TabsContent from "@/components/ui/tabs-content.vue";
import { screeningSourceLabel, screeningScoreClass } from "@/composables/import/formatters";

const props = defineProps<{
  open: boolean;
  screeningData: ImportTaskResultData | null;
  file: ImportFileTask | null;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "run-screening", taskId: string): void;
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

const isScreeningRunning = computed(() => {
  return props.file?.stage === "ai_screening";
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
    const { blob, contentType, fileName } = await candidatesApi.downloadResume(candidateId);
    const objectUrl = URL.createObjectURL(blob);

    if (requestToken !== previewRequestToken.value || !props.open) {
      URL.revokeObjectURL(objectUrl);
      return;
    }

    previewObjectUrl.value = objectUrl;
    previewContentType.value = contentType;
    previewFileName.value = fileName;
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
  URL.revokeObjectURL(previewObjectUrl.value);
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
