<template>
  <div class="min-h-screen flex">
    <aside class="w-56 bg-card border-r border-border flex flex-col shrink-0">
      <div class="p-4 font-semibold text-sm border-b border-border">📋 面试管理</div>
      <nav class="flex-1 p-2">
        <RouterLink to="/candidates" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">👥 候选人</RouterLink>
        <RouterLink to="/import" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">📥 导入任务</RouterLink>
        <RouterLink to="/settings" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">⚙️ 设置</RouterLink>
      </nav>
    </aside>

    <main class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-border flex items-center px-6 gap-4 shrink-0">
        <h1 class="font-medium text-sm">导入任务</h1>
        <div class="flex-1" />
        <button @click="triggerImport" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">+ 新建导入</button>
      </header>

      <div class="flex-1 overflow-auto p-6">
        <div v-if="loading" class="text-center py-20 text-muted-foreground text-sm">加载中…</div>
        <div v-else-if="!batches.length" class="text-center py-20">
          <p class="text-muted-foreground text-sm">暂无导入记录</p>
        </div>
        <div v-else class="space-y-3">
          <div v-for="b in batches" :key="b.id" class="border border-border rounded-xl p-5">
            <div class="flex items-center gap-3 mb-3">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="statusClass(b.status)">{{ statusLabel(b.status) }}</span>
              <span class="text-sm text-muted-foreground">{{ b.totalFiles }} 个文件</span>
              <div class="flex-1" />
              <span class="text-xs text-muted-foreground">{{ fmtTime(b.createdAt) }}</span>
            </div>
            <div v-if="b.totalFiles > 0" class="mb-2">
              <div class="h-1.5 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full transition-all" :style="{ width: `${Math.round((b.processedFiles / b.totalFiles) * 100)}%` }" />
              </div>
              <p class="text-xs text-muted-foreground mt-1">
                已处理 {{ b.processedFiles }}/{{ b.totalFiles }}，成功 {{ b.successFiles }}，失败 {{ b.failedFiles }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { importApi } from "@/api/import";
import type { ImportBatchListData } from "@ims/shared";

const batches = ref<ImportBatchListData["items"]>([]);
const loading = ref(false);

onMounted(fetchBatches);
async function fetchBatches() {
  loading.value = true;
  try { batches.value = (await importApi.list()).items; } finally { loading.value = false; }
}

function triggerImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.zip";
  input.multiple = true;
  input.onchange = async () => {
    const paths = Array.from(input.files ?? []).map(f => (f as any).path || f.name);
    if (!paths.length) return;
    await importApi.create(paths);
    await fetchBatches();
  };
  input.click();
}

function statusClass(status: string) {
  return { completed: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700", processing: "bg-yellow-100 text-yellow-700", queued: "bg-muted text-muted-foreground" }[status] ?? "bg-muted text-muted-foreground";
}

function statusLabel(status: string) {
  return { completed: "已完成", failed: "失败", processing: "处理中", partial_success: "部分成功", queued: "排队中", cancelled: "已取消" }[status] ?? status;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
</script>
