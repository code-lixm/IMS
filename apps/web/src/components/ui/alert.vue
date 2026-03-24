<template>
  <div
    :class="cn(
      'relative w-full rounded-lg border p-4',
      {
        'bg-background text-foreground': variant === 'default',
        'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive': variant === 'destructive',
      },
      props.class
    )"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
  variant?: 'default' | 'destructive'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})
</script>
