<template>
  <thead :class="cn('[&_tr]:border-b', props.class)">
    <slot />
  </thead>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface TableHeaderProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<TableHeaderProps>();
</script>
