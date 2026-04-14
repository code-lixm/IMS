<template>
  <div class="relative inline-flex flex-col items-center justify-center">
    <svg
      :width="size"
      :height="size"
      class="transform -rotate-90"
    >
      <!-- 背景圆环 -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        class="text-muted/30"
      />
      <!-- 进度圆环 -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :class="progressColor"
        stroke-linecap="round"
        class="transition-all duration-500 ease-out"
      />
    </svg>
    <!-- 中间内容 -->
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <p class="text-xl font-semibold tabular-nums">
        {{ Math.round(percent) }}%
      </p>
      <p v-if="label" class="text-[10px] text-muted-foreground mt-0.5">
        {{ label }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface CircularProgressProps {
  value?: number;
  modelValue?: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  status?: "processing" | "done" | "error" | "default";
}

const props = withDefaults(defineProps<CircularProgressProps>(), {
  value: 0,
  max: 100,
  size: 80,
  strokeWidth: 6,
  status: "default",
});

const resolvedValue = computed(() => props.modelValue ?? props.value ?? 0);

const percent = computed(() => {
  const safeMax = props.max > 0 ? props.max : 100;
  const normalized = Math.min(Math.max(resolvedValue.value, 0), safeMax);
  return (normalized / safeMax) * 100;
});

const radius = computed(() => (props.size - props.strokeWidth) / 2);

const circumference = computed(() => 2 * Math.PI * radius.value);

const offset = computed(() => {
  const progress = percent.value / 100;
  return circumference.value * (1 - progress);
});

const progressColor = computed(() => {
  switch (props.status) {
    case "processing":
      return "text-primary";
    case "done":
      return "text-green-600";
    case "error":
      return "text-destructive";
    default:
      return "text-primary";
  }
});
</script>