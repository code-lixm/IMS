<template>
  <TooltipTrigger v-bind="forwarded" :class="cn(props.class)">
    <slot />
  </TooltipTrigger>
</template>

<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  TooltipTrigger,
  type TooltipTriggerProps,
  useForwardProps,
} from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<TooltipTriggerProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwarded = useForwardProps(delegatedProps)
</script>
