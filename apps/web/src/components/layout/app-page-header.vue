<template>
  <header class="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div :class="cn('flex h-16 items-center gap-4 px-4 sm:px-6', props.contentClass)">
      <slot />
    </div>
  </header>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";

interface AppPageHeaderProps {
  contentClass?: string;
}

const props = defineProps<AppPageHeaderProps>();
</script>
