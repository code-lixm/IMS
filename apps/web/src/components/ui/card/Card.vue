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
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        props.class,
      )
    "
  >
    <slot />
  </component>
</template>
