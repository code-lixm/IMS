<template>
  <ProgressRoot
    :model-value="resolvedValue"
    :max="max"
    :class="
      cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
        props.class,
      )
    "
  >
    <ProgressIndicator
      :class="
        cn(
          'h-full w-full flex-1 bg-primary transition-all',
          props.indicatorClass,
        )
      "
      :style="`transform: translateX(-${100 - progressPercent}%);`"
    />
  </ProgressRoot>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { HTMLAttributes } from "vue";
import { ProgressIndicator, ProgressRoot } from "reka-ui";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value?: number;
  modelValue?: number;
  max?: number;
  class?: HTMLAttributes["class"];
  indicatorClass?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<ProgressProps>(), {
  max: 100,
});

const resolvedValue = computed(() => props.modelValue ?? props.value ?? 0);
const progressPercent = computed(() => {
  const safeMax = props.max > 0 ? props.max : 100;
  const normalized = Math.min(Math.max(resolvedValue.value, 0), safeMax);
  return (normalized / safeMax) * 100;
});
</script>
