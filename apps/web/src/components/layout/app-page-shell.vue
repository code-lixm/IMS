<template>
  <div :class="cn('min-h-screen bg-background', props.class)">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";

interface AppPageShellProps {
  class?: string;
}

const props = defineProps<AppPageShellProps>();
</script>
