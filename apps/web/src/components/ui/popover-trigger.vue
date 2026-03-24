<template>
  <PopoverTrigger v-bind="forwarded" :class="cn(props.class)">
    <slot />
  </PopoverTrigger>
</template>

<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  PopoverTrigger,
  type PopoverTriggerProps,
  useForwardProps,
} from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<PopoverTriggerProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwarded = useForwardProps(delegatedProps)
</script>
