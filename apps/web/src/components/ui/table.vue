<template>
  <table :class="cn('w-full caption-bottom text-sm', props.class)">
    <slot />
  </table>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface TableProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<TableProps>();
</script>
