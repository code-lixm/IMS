<template>
  <div :class="cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', props.class)">
    <progress
      :class="cn('h-full w-full appearance-none bg-transparent [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary', props.indicatorClass)"
      :max="max"
      :value="resolvedValue"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

interface ProgressProps {
  value?: number
  modelValue?: number
  max?: number
  class?: HTMLAttributes["class"]
  indicatorClass?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<ProgressProps>(), {
  max: 100,
})

const resolvedValue = computed(() => props.modelValue ?? props.value ?? 0)
</script>
