<template>
  <DropdownMenuSeparator :class="cn('-mx-1 my-1 h-px bg-muted', props.class)" />
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DropdownMenuSeparator } from "radix-vue";
import { cn } from "@/lib/utils";

interface DropdownMenuSeparatorProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<DropdownMenuSeparatorProps>();
</script>
