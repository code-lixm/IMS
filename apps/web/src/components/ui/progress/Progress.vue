<script setup lang="ts">
import type { ProgressRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ProgressIndicator, ProgressRoot } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<ProgressRootProps & {
    class?: HTMLAttributes["class"]
    indicatorClass?: HTMLAttributes["class"]
    max?: number
    value?: number
  }>(),
  {
    max: 100,
    modelValue: 0,
  },
);

const delegatedProps = reactiveOmit(props, "class", "indicatorClass", "value");
</script>

<template>
  <ProgressRoot
    v-bind="delegatedProps"
    :class="
      cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        props.class,
      )
    "
  >
    <ProgressIndicator
      :class="cn('h-full w-full flex-1 bg-primary transition-all', indicatorClass)"
      :style="`transform: translateX(-${100 - Math.min(100, Math.max(0, ((props.modelValue ?? props.value ?? 0) / props.max) * 100))}%);`"
    />
  </ProgressRoot>
</template>
