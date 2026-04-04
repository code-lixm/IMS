<template>
  <div v-if="workflow" class="border-b bg-muted/15 p-2">
    <div class="mx-auto flex w-full items-start justify-between gap-4">
      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-semibold">
            面试流程：{{ currentWorkflowStageLabel ?? "流程处理中" }}
          </span>
          <Badge
            :variant="workflowStatusVariant"
            class="h-6 shrink-0 rounded-sm px-2 text-[11px] font-medium"
          >
            {{ workflowStatusLabel }}
          </Badge>
        </div>
        <div class="text-[11px] leading-5 text-muted-foreground">
          选择 AI 当前所处阶段：初筛看简历、出题准备问题、评估整理判断、完成输出结论。
        </div>
      </div>

      <div class="shrink-0">
        <div
          class="flex items-center gap-1 rounded-lg border border-border/50 bg-background p-1 shadow-sm"
        >
          <Button
            v-for="stage in workflowStageOptions"
            :key="stage.value"
            type="button"
            :variant="workflow.currentStage === stage.value ? 'default' : 'ghost'"
            size="sm"
            class="h-7 rounded-md px-2 text-[11px] font-medium shadow-none"
            @click="emit('select-stage', stage.value)"
          >
            {{ stage.label }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WorkflowState } from "@/api/lui";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";

interface WorkflowBannerProps {
  workflow: WorkflowState | null;
}

const props = defineProps<WorkflowBannerProps>();
const emit = defineEmits<{
  (e: "select-stage", stage: WorkflowState["currentStage"]): void;
}>();

const currentWorkflowStageLabel = computed(() => {
  const labels: Record<NonNullable<WorkflowState["currentStage"]>, string> = {
    S0: "初筛阶段",
    S1: "出题阶段",
    S2: "评估阶段",
    completed: "复盘阶段",
  };

  const stage = props.workflow?.currentStage;
  return stage ? labels[stage] : null;
});

const workflowStatusLabel = computed(() => {
  if (!props.workflow) return "";
  const labels: Record<string, string> = {
    active: "进行中",
    paused: "已暂停",
    completed: "已完成",
    error: "异常",
  };
  return labels[props.workflow.status] ?? props.workflow.status;
});

const workflowStatusVariant = computed<
  "default" | "secondary" | "destructive" | "outline"
>(() => {
  if (!props.workflow) return "secondary";
  const variants: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    active: "secondary",
    paused: "secondary",
    completed: "outline",
    error: "destructive",
  };
  return variants[props.workflow.status] ?? "secondary";
});

const workflowStageOptions = [
  { value: "S0", label: "初筛" },
  { value: "S1", label: "出题" },
  { value: "S2", label: "评估" },
  { value: "completed", label: "完成" },
] as const;
</script>
