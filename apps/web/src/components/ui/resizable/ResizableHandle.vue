<script setup lang="ts">
import type { SplitterResizeHandleProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { SplitterResizeHandle, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<SplitterResizeHandleProps & { class?: HTMLAttributes["class"] }>()
const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <SplitterResizeHandle
    v-bind="forwarded"
    :class="cn(
      'group/handle relative flex w-5 shrink-0 cursor-col-resize items-center justify-center bg-background/90 after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border/80 after:transition-colors hover:bg-muted/40 hover:after:bg-primary/70 data-[panel-group-direction=vertical]:h-8 data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:bg-transparent data-[panel-group-direction=vertical]:after:inset-x-0 data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:top-1/2 data-[panel-group-direction=vertical]:after:h-px data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:hover:bg-muted/20',
      props.class,
    )"
  >
    <slot>
      <div class="h-12 w-2 rounded-full bg-border/70 shadow-sm transition-colors group-hover/handle:bg-primary/70 group-data-[panel-group-direction=vertical]/handle:h-1.5 group-data-[panel-group-direction=vertical]/handle:w-20 group-data-[panel-group-direction=vertical]/handle:bg-border/90 group-data-[panel-group-direction=vertical]/handle:shadow-md" />
    </slot>
  </SplitterResizeHandle>
</template>
