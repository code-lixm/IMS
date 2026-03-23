<template>
  <div class="min-h-screen bg-background">
    <header class="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="flex h-16 items-center gap-4 px-4 sm:px-6">
        <RouterLink to="/candidates" class="flex items-center gap-2 shrink-0">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase class="h-4 w-4 text-primary" />
          </div>
          <span class="text-lg font-semibold tracking-tight hidden sm:block">IMS</span>
        </RouterLink>
        <div class="flex-1" />
        <div class="flex items-center gap-2 shrink-0">
          <Button variant="outline" class="gap-2 hidden sm:flex" @click="$router.push('/candidates')">
            <User class="h-4 w-4" />
            候选人
          </Button>
          <Button class="gap-2" @click="triggerImport">
            <Plus class="h-4 w-4" />
            新建导入
          </Button>
          <AppUserActions />
        </div>
      </div>
    </header>

    <main class="p-4 sm:p-6">
        <!-- Loading -->
        <Card v-if="loading" class="p-6 space-y-3">
          <Skeleton class="h-4 w-full rounded-md" />
          <Skeleton class="h-4 w-4/5 rounded-md" />
          <Skeleton class="h-4 w-3/5 rounded-md" />
        </Card>

        <!-- Empty -->
        <EmptyState
          v-else-if="!batches.length"
          scenario="import"
          :action-text="'新建导入'"
          :action-icon="Plus"
          :action-handler="triggerImport"
        />

        <!-- Batch list -->
        <div v-else class="space-y-3">
          <Card v-for="b in batches" :key="b.id" class="p-5 space-y-3">
            <!-- Batch header -->
            <div class="flex items-center gap-3">
              <Badge :variant="statusVariant(b.status)">
                {{ statusLabel(b.status) }}
              </Badge>
              <span class="text-sm text-muted-foreground">{{ b.totalFiles }} 个文件</span>
              <div class="flex-1" />
              <span class="text-xs text-muted-foreground">{{ fmtTime(b.createdAt) }}</span>
            </div>

            <!-- Progress -->
            <div v-if="b.totalFiles > 0" class="space-y-1.5">
              <Progress :value="Math.round((b.processedFiles / b.totalFiles) * 100)" />
              <p class="text-xs text-muted-foreground">
                已处理 {{ b.processedFiles }}/{{ b.totalFiles }}
                <span class="mx-1">·</span>
                成功 <span class="text-green-600">{{ b.successFiles }}</span>
                <span class="mx-1">·</span>
                失败 <span class="text-destructive">{{ b.failedFiles }}</span>
              </p>
            </div>

            <!-- Stage label -->
            <p v-if="b.currentStage && b.status === 'processing'" class="text-xs text-muted-foreground">
              {{ b.currentStage }}
            </p>

            <!-- File details toggle -->
            <div class="flex items-center gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 text-xs gap-1"
                @click="toggleFiles(b.id)"
              >
                <ChevronDown :class="['h-3 w-3 transition-transform', expandedBatches.has(b.id) ? 'rotate-180' : '']" />
                {{ expandedBatches.has(b.id) ? '收起' : '查看文件明细' }}
              </Button>
              <div class="flex-1" />
              <Button
                v-if="b.failedFiles > 0"
                variant="outline"
                size="sm"
                class="h-7 text-xs gap-1"
                @click="retryFailed(b.id)"
              >
                <RefreshCw class="h-3 w-3" />
                重试失败
              </Button>
              <Button
                v-if="b.status === 'processing'"
                variant="outline"
                size="sm"
                class="h-7 text-xs gap-1"
                @click="cancelBatch(b.id)"
              >
                <X class="h-3 w-3" />
                取消
              </Button>
            </div>

            <!-- File list -->
            <div v-if="expandedBatches.has(b.id)" class="border rounded-md mt-2">
              <div v-if="loadingFiles[b.id]" class="p-3 space-y-2">
                <Skeleton class="h-3 w-full rounded" v-for="i in 3" :key="i" />
              </div>
              <div v-else-if="!batchFiles[b.id]?.length" class="p-3 text-xs text-muted-foreground">
                暂无文件
              </div>
              <div v-else class="divide-y">
                <div
                  v-for="f in batchFiles[b.id]"
                  :key="f.id"
                  class="flex items-center gap-3 px-3 py-2"
                >
                  <Badge :variant="fileStatusVariant(f.status)" class="shrink-0 text-xs">
                    {{ fileStatusLabel(f.status) }}
                  </Badge>
                  <span class="text-sm truncate flex-1">{{ f.originalPath.split('/').pop() }}</span>
                  <span v-if="f.errorMessage" class="text-xs text-destructive truncate max-w-32">{{ f.errorMessage }}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
    </main>

    <!-- Conflict merge dialog -->
    <ConflictMergeDialog
      :open="conflictDialog.open"
      :conflict-data="conflictDialog.data"
      @update:open="conflictDialog.open = $event"
      @resolve="handleConflictResolve"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Briefcase, Plus, User, ChevronDown, RefreshCw, X } from "lucide-vue-next";
import { importApi } from "@/api/import";
import { shareApi } from "@/api/share";
import AppUserActions from "@/components/app-user-actions.vue";
import ConflictMergeDialog from "@/components/conflict-merge-dialog.vue";
import type { ConflictData } from "@/components/conflict-merge-dialog.vue";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Progress from "@/components/ui/progress.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import EmptyState from "@/components/ui/empty-state.vue";
import type { ImportBatchListData, ImportFileListData } from "@ims/shared";

const batches = ref<ImportBatchListData["items"]>([]);
const loading = ref(false);
const expandedBatches = ref<Set<string>>(new Set());
const batchFiles = ref<Record<string, ImportFileListData["items"]>>({});
const loadingFiles = ref<Record<string, boolean>>({});
let pollInterval: ReturnType<typeof setInterval> | null = null;

const conflictDialog = ref<{
  open: boolean;
  data: ConflictData | null;
}>({
  open: false,
  data: null,
});

onMounted(() => {
  fetchBatches();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});

function startPolling() {
  pollInterval = setInterval(async () => {
    const hasProcessing = batches.value.some(b => b.status === "processing" || b.status === "queued");
    if (hasProcessing) {
      await fetchBatches();
    }
  }, 3000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function fetchBatches() {
  loading.value = true;
  try {
    batches.value = (await importApi.list()).items;
  } finally {
    loading.value = false;
  }
}

async function toggleFiles(batchId: string) {
  if (expandedBatches.value.has(batchId)) {
    expandedBatches.value.delete(batchId);
    expandedBatches.value = new Set(expandedBatches.value);
    return;
  }
  expandedBatches.value.add(batchId);
  expandedBatches.value = new Set(expandedBatches.value);
  if (!batchFiles.value[batchId]) {
    loadingFiles.value[batchId] = true;
    try {
      batchFiles.value[batchId] = (await importApi.files(batchId)).items;
    } finally {
      loadingFiles.value[batchId] = false;
    }
  }
}

async function retryFailed(batchId: string) {
  await fetch(`/api/import/batches/${batchId}/retry-failed`, { method: "POST" });
  await fetchBatches();
}

async function cancelBatch(batchId: string) {
  await importApi.cancel(batchId);
  await fetchBatches();
}

async function handleConflictResolve(strategy: "local" | "import") {
  if (!conflictDialog.value.data) return;
  const candidateId = conflictDialog.value.data.candidateName; // Use name as temp ID
  await shareApi.resolve(candidateId, strategy);
  conflictDialog.value.open = false;
  conflictDialog.value.data = null;
}

function triggerImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.zip,.imr";
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files ?? []);
    if (!files.length) return;

    // Check if any .imr files
    const imrFiles = files.filter(f => f.name.endsWith(".imr"));
    const regularFiles = files.filter(f => !f.name.endsWith(".imr"));

    // Handle regular files
    if (regularFiles.length > 0) {
      const paths = regularFiles.map((file) => {
        const fileWithPath = file as File & { path?: string };
        return fileWithPath.path ?? file.name;
      });
      await importApi.create(paths);
    }

    // Handle IMR files
    for (const file of imrFiles) {
      const fileWithPath = file as File & { path?: string };
      const filePath = fileWithPath.path ?? file.name;
      const result = await shareApi.import(filePath);
      if (result.result === "conflict") {
        const r = result as { result: string; candidateName?: string; phone?: string | null; email?: string | null; conflicts?: Array<{ name: string; label: string; localValue: string | number | null; importValue: string | number | null }> };
        conflictDialog.value = {
          open: true,
          data: {
            candidateName: r.candidateName ?? "",
            source: "import",
            phone: r.phone ?? null,
            email: r.email ?? null,
            conflicts: (r.conflicts ?? []).map(c => ({
              name: c.name,
              label: c.label,
              localValue: c.localValue,
              importValue: c.importValue,
            })),
          },
        };
      }
    }

    await fetchBatches();
  };
  input.click();
}

function statusVariant(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    partial_success: "secondary",
    processing: "secondary",
    failed: "destructive",
    queued: "outline",
    cancelled: "outline",
  };
  return map[status] ?? "outline";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    processing: "处理中",
    partial_success: "部分成功",
    queued: "排队中",
    cancelled: "已取消",
  };
  return map[status] ?? status;
}

function fileStatusVariant(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    failed: "destructive",
    processing: "secondary",
    queued: "outline",
    cancelled: "outline",
  };
  return map[status] ?? "outline";
}

function fileStatusLabel(status: string) {
  const map: Record<string, string> = {
    completed: "成功",
    failed: "失败",
    processing: "处理中",
    queued: "排队",
    cancelled: "取消",
  };
  return map[status] ?? status;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
