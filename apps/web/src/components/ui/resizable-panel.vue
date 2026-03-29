<script setup lang="ts">
import type { SplitterPanelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { SplitterPanel, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<SplitterPanelProps & { class?: HTMLAttributes["class"] }>()
const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <SplitterPanel
    v-bind="forwarded"
    :class="cn('min-h-0 min-w-0 overflow-hidden', props.class)"
  >
    <slot />
  </SplitterPanel>
</template>
