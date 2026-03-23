<template>
  <TabsContent
    :value="value"
    :class="cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', props.class)"
  >
    <slot />
  </TabsContent>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { TabsContent } from "radix-vue";
import { cn } from "@/lib/utils";

interface TabsContentProps {
  value: string;
  class?: HTMLAttributes["class"];
}

const props = defineProps<TabsContentProps>();
</script>
