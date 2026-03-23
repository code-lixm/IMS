<template>
  <Separator
    :orientation="orientation"
    :decorative="decorative"
    :class="cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', props.class)"
  />
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { Separator } from "radix-vue"
import { cn } from "@/lib/utils"

interface SeparatorProps {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
  class?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<SeparatorProps>(), {
  orientation: "horizontal",
  decorative: true,
})
</script>
