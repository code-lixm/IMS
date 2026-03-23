<template>
  <ScrollAreaRoot :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport class="h-full w-full rounded-[inherit]">
      <slot />
    </ScrollAreaViewport>
    <ScrollAreaScrollbar
      orientation="vertical"
      class="flex touch-none select-none border-l border-l-transparent p-[1px] transition-colors h-full w-2.5"
    >
      <ScrollAreaThumb class="relative flex-1 rounded-full bg-border" />
    </ScrollAreaScrollbar>
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "radix-vue"
import { cn } from "@/lib/utils"

interface ScrollAreaProps {
  class?: HTMLAttributes["class"]
}

const props = defineProps<ScrollAreaProps>()
</script>
