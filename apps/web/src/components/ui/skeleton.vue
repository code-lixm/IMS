<template>
  <div :class="cn('animate-pulse rounded-full bg-muted', props.class)" />
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

interface SkeletonProps {
  class?: HTMLAttributes["class"]
}

const props = defineProps<SkeletonProps>()
</script>
