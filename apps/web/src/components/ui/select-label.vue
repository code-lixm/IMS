<template>
  <SelectLabel :class="cn('px-2 py-1.5 text-sm font-semibold', props.class)">
    <slot />
  </SelectLabel>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SelectLabel } from "radix-vue";
import { cn } from "@/lib/utils";

interface SelectLabelProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<SelectLabelProps>();
</script>
