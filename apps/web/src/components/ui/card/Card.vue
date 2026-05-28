<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  as?: string
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <component
    :is="as ?? 'div'"
    :class="
      cn(
        'rounded-[8px] border border-[#0063ff14] bg-white text-card-foreground shadow-none dark:border-white/10 dark:bg-card dark:text-card-foreground',
        props.class,
      )
    "
  >
    <slot />
  </component>
</template>
