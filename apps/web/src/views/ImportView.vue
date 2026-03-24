<template>
  <AppPageShell>
    <AppPageHeader>
        <AppBrandLink />
        <div class="flex-1" />
        <div class="flex items-center gap-2 shrink-0">
          <Button variant="outline" class="gap-2 hidden sm:flex" @click="$router.push('/candidates')">
            <User class="h-4 w-4" />
            候选人
          </Button>
          <Button class="gap-2" :disabled="fileImport.isImporting" @click="fileImport.triggerImport">
            <Plus class="h-4 w-4" />
            新建导入
          </Button>
          <AppUserActions />
        </div>
    </AppPageHeader>

    <AppPageContent>
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
          :action-handler="fileImport.triggerImport"
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
              <span class="text-xs text-muted-foreground">{{ formatImportTimestamp(b.createdAt) }}</span>
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
    </AppPageContent>

    <!-- Conflict merge dialog -->
    <ConflictMergeDialog
      :open="conflictDialog.open"
      :conflict-data="conflictDialog.data"
      @update:open="fileImport.setConflictDialogOpen"
      @resolve="fileImport.resolveConflict"
    />
  </AppPageShell>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { Plus, User, ChevronDown, RefreshCw, X } from "lucide-vue-next";
import AppUserActions from "@/components/app-user-actions.vue";
import ConflictMergeDialog from "@/components/conflict-merge-dialog.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import { useImportBatches } from "@/composables/import/use-import-batches";
import { useImportFileSelection } from "@/composables/import/use-import-file-selection";
import {
  fileStatusLabel,
  fileStatusVariant,
  formatImportTimestamp,
  statusLabel,
  statusVariant,
} from "@/composables/import/formatters";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Progress from "@/components/ui/progress.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import EmptyState from "@/components/ui/empty-state.vue";
const importBatches = useImportBatches();
const fileImport = useImportFileSelection({
  onImportFinished: importBatches.refresh,
});
const { conflictDialog } = fileImport;

const {
  batches,
  loading,
  expandedBatches,
  batchFiles,
  loadingFiles,
  toggleFiles,
  retryFailed,
  cancelBatch,
} = importBatches;

onMounted(() => {
  void importBatches.initialize();
});
</script>
