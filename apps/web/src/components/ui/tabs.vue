<template>
  <TabsRoot
    :default-value="defaultValue"
    :model-value="modelValue"
    :class="cn('w-full', props.class)"
    @update:model-value="(v) => emit('update:modelValue', v as string)"
  >
    <slot />
  </TabsRoot>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { TabsRoot } from "radix-vue";
import { cn } from "@/lib/utils";

interface TabsProps {
  modelValue?: string;
  defaultValue?: string;
  class?: HTMLAttributes["class"];
}

const props = defineProps<TabsProps>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();
</script>
