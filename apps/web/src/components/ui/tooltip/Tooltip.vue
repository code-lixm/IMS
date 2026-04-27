<script setup lang="ts">
import type { TooltipRootEmits, TooltipRootProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { TooltipProvider, TooltipRoot, useForwardPropsEmits } from "reka-ui"

const props = withDefaults(defineProps<TooltipRootProps & { delayDuration?: number }>(), {
  delayDuration: 0,
})
const emits = defineEmits<TooltipRootEmits>()

const delegatedProps = reactiveOmit(props, "delayDuration")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot v-bind="forwarded">
      <slot />
    </TooltipRoot>
  </TooltipProvider>
</template>
