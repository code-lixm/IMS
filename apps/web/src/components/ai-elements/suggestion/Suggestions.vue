<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface SuggestionsProps {
  class?: HTMLAttributes['class']
  orientation?: 'horizontal' | 'vertical'
}

const props = withDefaults(defineProps<SuggestionsProps>(), {
  orientation: 'vertical',
})
</script>

<template>
  <ScrollArea
    v-if="props.orientation === 'horizontal'"
    class="w-full overflow-x-auto whitespace-nowrap"
    v-bind="$attrs"
  >
    <div :class="cn('flex w-max flex-nowrap items-center gap-2', props.class)">
      <slot />
    </div>
    <ScrollBar class="hidden" orientation="horizontal" />
  </ScrollArea>

  <div
    v-else
    :class="cn('flex w-full flex-col items-stretch gap-3', props.class)"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
