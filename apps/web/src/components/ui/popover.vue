<template>
  <PopoverRoot v-bind="forwarded">
    <slot />
  </PopoverRoot>
</template>

<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  PopoverRoot,
  type PopoverRootEmits,
  type PopoverRootProps,
  useForwardPropsEmits,
} from 'radix-vue'

const props = defineProps<PopoverRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<PopoverRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>
