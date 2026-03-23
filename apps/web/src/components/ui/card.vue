<template>
  <component :is="as" :class="cn('rounded-lg border bg-card text-card-foreground shadow-sm', props.class)">
    <slot />
  </component>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

interface CardProps {
  as?: string
  class?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<CardProps>(), {
  as: "div",
})
</script>
