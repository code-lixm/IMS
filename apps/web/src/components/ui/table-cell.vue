<template>
  <td
    :class="cn('p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', props.class)"
  >
    <slot />
  </td>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface TableCellProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<TableCellProps>();
</script>
