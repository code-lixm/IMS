<template>
  <div
    v-if="currentTask || pendingTasks.length > 0"
    class="mb-2 rounded-lg border bg-muted/50 px-3 py-2"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between text-left"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <Loader2 v-if="currentTask" class="h-4 w-4 animate-spin text-primary" />
        <CheckCircle2 v-else-if="allCompleted" class="h-4 w-4 text-green-500" />
        <Clock v-else class="h-4 w-4 text-muted-foreground" />

        <span class="text-sm">
          <template v-if="currentTask">
            {{ currentTask.description }}
          </template>
          <template v-else-if="pendingTasks.length > 0">
            等待中 ({{ pendingTasks.length }})
          </template>
          <template v-else>
            全部完成
          </template>
        </span>
      </div>

      <ChevronDown
        class="h-4 w-4 transition-transform"
        :class="expanded ? 'rotate-180' : ''"
      />
    </button>

    <div v-if="expanded" class="mt-2 space-y-1 border-t pt-2">
      <div
        v-for="task in displayedTasks"
        :key="task.id"
        class="flex items-center gap-2 text-sm"
      >
        <div class="flex h-4 w-4 items-center justify-center">
          <Loader2
            v-if="task.status === 'running'"
            class="h-3.5 w-3.5 animate-spin text-primary"
          />
          <Circle
            v-else-if="task.status === 'pending'"
            class="h-3 w-3 text-muted-foreground"
          />
          <CheckCircle2
            v-else-if="task.status === 'completed'"
            class="h-3.5 w-3.5 text-green-500"
          />
          <XCircle
            v-else-if="task.status === 'failed'"
            class="h-3.5 w-3.5 text-red-500"
          />
        </div>

        <span class="flex-1 truncate">{{ task.description }}</span>

        <div v-if="task.progress !== undefined" class="w-16">
          <Progress :value="task.progress ?? 0" class="h-1.5" />
        </div>

        <Badge v-if="task.status === 'running'" variant="default" class="text-[10px]">
          运行中
        </Badge>
        <Badge v-else-if="task.status === 'pending'" variant="secondary" class="text-[10px]">
          等待
        </Badge>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"
import {
  Loader2,
  CheckCircle2,
  Clock,
  ChevronDown,
  Circle,
  XCircle,
} from "lucide-vue-next"
import Badge from "@/components/ui/badge.vue"
import Progress from "@/components/ui/progress.vue"
import type { Task } from "@/stores/lui"

interface TaskQueueIndicatorProps {
  tasks: Task[]
}

const props = defineProps<TaskQueueIndicatorProps>()

const expanded = ref(false)

const currentTask = computed(() =>
  props.tasks.find((t) => t.status === "running")
)

const pendingTasks = computed(() =>
  props.tasks.filter((t) => t.status === "pending")
)

const allCompleted = computed(() =>
  props.tasks.length > 0 && props.tasks.every((t) => t.status === "completed")
)

const displayedTasks = computed(() =>
  props.tasks.slice(0, 5)
)
</script>
