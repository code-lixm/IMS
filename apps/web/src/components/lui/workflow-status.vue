<template>
  <div v-if="workflow" class="rounded-xl border border-border/70 bg-card p-4 text-sm shadow-sm">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Badge :variant="statusVariant" class="text-xs">
          {{ statusLabel }}
        </Badge>
        <span class="font-medium">{{ stageLabel }}</span>
      </div>
      <div class="flex items-center gap-1">
        <Button
          v-if="workflow.status === 'active'"
          variant="ghost"
          size="sm"
          class="h-6 w-6 p-0"
          @click="onPause"
        >
          <Pause class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="workflow.status === 'paused'"
          variant="ghost"
          size="sm"
          class="h-6 w-6 p-0"
          @click="onResume"
        >
          <Play class="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 w-6 p-0"
          @click="onReset"
        >
          <RotateCcw class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <!-- Stage Progress -->
    <div class="mt-3 flex items-center gap-1">
      <div
        v-for="stage in stages"
        :key="stage"
        class="flex-1"
      >
        <div
          class="h-1.5 rounded-full transition-colors"
          :class="stageClass(stage)"
        />
      </div>
    </div>

    <!-- Documents -->
    <div v-if="hasDocuments" class="mt-3 space-y-1 border-t pt-2">
      <div
        v-for="(doc, stage) in workflow.documents"
        :key="stage"
        class="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <FileText class="h-3 w-3" />
        <span>{{ stage }} 文档</span>
        <span v-if="doc?.generatedAt" class="ml-auto">
          {{ formatDate(doc.generatedAt) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Pause, Play, RotateCcw, FileText } from "lucide-vue-next";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import type { WorkflowState } from "@/api/lui";

interface WorkflowStatusProps {
  workflow: WorkflowState | null;
}

const props = defineProps<WorkflowStatusProps>();
const emit = defineEmits<{
  (e: "pause", workflowId: string): void;
  (e: "resume", workflowId: string): void;
  (e: "reset", workflowId: string): void;
}>();

const stages = ["S0", "S1", "S2", "completed"] as const;

type Stage = typeof stages[number];

const statusLabel = computed(() => {
  if (!props.workflow) return "";
  const labels: Record<string, string> = {
    active: "进行中",
    paused: "已暂停",
    completed: "已完成",
    error: "错误",
  };
  return labels[props.workflow.status] || props.workflow.status;
});

const statusVariant = computed(() => {
  if (!props.workflow) return "secondary";
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    paused: "secondary",
    completed: "default",
    error: "destructive",
  };
  return variants[props.workflow.status] || "secondary";
});

const stageLabel = computed(() => {
  if (!props.workflow) return "";
  const labels: Record<Stage, string> = {
    S0: "初筛阶段",
    S1: "出题阶段",
    S2: "评估阶段",
    completed: "已完成",
  };
  return labels[props.workflow.currentStage as Stage] || props.workflow.currentStage;
});

const hasDocuments = computed(() => {
  if (!props.workflow?.documents) return false;
  return Object.keys(props.workflow.documents).length > 0;
});

function stageClass(stage: Stage): string {
  if (!props.workflow) return "bg-muted";

  const stageIndex = stages.indexOf(stage);
  const currentIndex = stages.indexOf(props.workflow.currentStage as Stage);

  if (stageIndex < currentIndex) {
    return "bg-primary";
  } else if (stageIndex === currentIndex) {
    return props.workflow.status === "active" ? "bg-primary animate-pulse" : "bg-primary/60";
  }
  return "bg-muted";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function onPause() {
  if (props.workflow) {
    emit("pause", props.workflow.id);
  }
}

function onResume() {
  if (props.workflow) {
    emit("resume", props.workflow.id);
  }
}

function onReset() {
  if (props.workflow) {
    emit("reset", props.workflow.id);
  }
}
</script>
