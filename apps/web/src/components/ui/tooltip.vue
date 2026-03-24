<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot v-bind="forwarded">
      <slot />
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  TooltipProvider,
  TooltipRoot,
  type TooltipRootEmits,
  type TooltipRootProps,
  useForwardPropsEmits,
} from 'radix-vue'

interface Props extends TooltipRootProps {
  class?: HTMLAttributes['class']
  delayDuration?: number
}

const props = withDefaults(defineProps<Props>(), {
  delayDuration: 0,
})
const emits = defineEmits<TooltipRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, delayDuration: __, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>
