<template>
  <main :class="cn('p-4 sm:p-6', props.class)">
    <slot />
  </main>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";

interface AppPageContentProps {
  class?: string;
}

const props = defineProps<AppPageContentProps>();
</script>
