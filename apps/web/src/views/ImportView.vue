<template>
  <div class="flex min-h-screen bg-background">
    <!-- Sidebar -->
    <aside class="flex w-52 shrink-0 flex-col border-r border-border bg-muted/20">
      <div class="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold text-sm">
        <Briefcase class="h-4 w-4 text-muted-foreground" />
        面试管理
      </div>
      <nav class="flex-1 p-2 space-y-0.5">
        <RouterLink
          to="/candidates"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          active-class="bg-accent font-medium text-accent-foreground"
        >
          <User class="h-4 w-4" />
          候选人
        </RouterLink>
        <RouterLink
          to="/import"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          active-class="bg-accent font-medium text-accent-foreground"
        >
          <Upload class="h-4 w-4" />
          导入任务
        </RouterLink>
        <RouterLink
          to="/settings"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          active-class="bg-accent font-medium text-accent-foreground"
        >
          <Settings class="h-4 w-4" />
          设置
        </RouterLink>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="flex flex-1 flex-col min-w-0">
      <!-- Header -->
      <header class="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-muted/10 px-6">
        <h1 class="text-sm font-medium">导入任务</h1>
        <div class="flex-1" />
        <Button class="gap-2" @click="triggerImport">
          <Plus class="h-4 w-4" />
          新建导入
        </Button>
      </header>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-6">
        <!-- Loading -->
        <Card v-if="loading" class="p-6 space-y-3">
          <Skeleton class="h-4 w-full rounded-md" />
          <Skeleton class="h-4 w-4/5 rounded-md" />
          <Skeleton class="h-4 w-3/5 rounded-md" />
        </Card>

        <!-- Empty -->
        <Card v-else-if="!batches.length" class="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground">
          暂无导入记录
        </Card>

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
          </Card>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Briefcase, Plus, Settings, Upload, User } from "lucide-vue-next";
import { importApi } from "@/api/import";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Progress from "@/components/ui/progress.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import type { ImportBatchListData } from "@ims/shared";

const batches = ref<ImportBatchListData["items"]>([]);
const loading = ref(false);

onMounted(fetchBatches);

async function fetchBatches() {
  loading.value = true;
  try {
    batches.value = (await importApi.list()).items;
  } finally {
    loading.value = false;
  }
}

function triggerImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.zip";
  input.multiple = true;
  input.onchange = async () => {
    const paths = Array.from(input.files ?? []).map((file) => {
      const fileWithPath = file as File & { path?: string };
      return fileWithPath.path ?? file.name;
    });
    if (!paths.length) return;
    await importApi.create(paths);
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

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
