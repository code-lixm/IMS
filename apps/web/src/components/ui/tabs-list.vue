<template>
  <TabsList
    :class="cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', props.class)"
  >
    <slot />
  </TabsList>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { TabsList } from "radix-vue";
import { cn } from "@/lib/utils";

interface TabsListProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<TabsListProps>();
</script>
