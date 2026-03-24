<template>
  <div>
    <div v-if="loading" class="space-y-3">
      <Card v-for="i in 4" :key="i" class="p-4">
        <div class="flex items-center gap-4">
          <Skeleton class="h-10 w-10 rounded-full" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-3 w-48" />
          </div>
        </div>
      </Card>
    </div>

    <EmptyState
      v-else-if="!items.length"
      scenario="candidates"
      :action-text="'新建候选人'"
      :action-icon="Plus"
      :action-handler="() => emit('create')"
      :secondary-action-text="'导入文件'"
      :secondary-action-handler="() => emit('import')"
    />

    <div v-else class="space-y-3">
      <Card
        v-for="candidate in items"
        :key="candidate.id"
        class="group relative overflow-hidden transition-colors hover:bg-accent/50 cursor-pointer"
        @click="emit('select', candidate.id)"
      >
        <div class="flex items-center gap-4 p-4">
          <div class="shrink-0">
            <div class="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {{ candidate.name.charAt(0) }}
            </div>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="truncate font-medium text-foreground">{{ candidate.name }}</h3>
              <Badge :variant="candidate.source === 'local' ? 'secondary' : 'default'" class="h-4 px-1.5 py-0 text-[10px]">
                {{ sourceLabel(candidate.source) }}
              </Badge>
            </div>
            <p class="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
              {{ candidate.position || '暂无岗位信息' }}
              <span v-if="candidate.yearsOfExperience" class="text-muted-foreground/60">
                · {{ candidate.yearsOfExperience }}年经验
              </span>
            </p>
          </div>

          <div class="shrink-0 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              class="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
              :disabled="workspaceLoadingId === candidate.id"
              @click.stop="emit('open-workspace', candidate.id)"
            >
              <MessageSquare class="h-4 w-4 sm:mr-1.5" />
              <span class="hidden sm:inline">{{ workspaceLoadingId === candidate.id ? '启动中' : 'AI工作台' }}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              class="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
              :disabled="exportLoadingId === candidate.id"
              @click.stop="emit('export', candidate.id)"
            >
              <Download class="h-4 w-4 sm:mr-1.5" />
              <span class="hidden sm:inline">{{ exportLoadingId === candidate.id ? '导出中' : '导出' }}</span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Download, MessageSquare, Plus } from "lucide-vue-next";
import type { CandidateListData, CandidateSource } from "@ims/shared";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import EmptyState from "@/components/ui/empty-state.vue";
import Skeleton from "@/components/ui/skeleton.vue";

interface CandidateListProps {
  items: CandidateListData["items"];
  loading: boolean;
  workspaceLoadingId?: string | null;
  exportLoadingId?: string | null;
}

defineProps<CandidateListProps>();

const emit = defineEmits<{
  (e: "create"): void;
  (e: "import"): void;
  (e: "select", candidateId: string): void;
  (e: "open-workspace", candidateId: string): void;
  (e: "export", candidateId: string): void;
}>();

function sourceLabel(source: CandidateSource) {
  const map: Record<string, string> = { local: "本地", remote: "远程", hybrid: "混合" };
  return map[source] ?? source;
}
</script>
