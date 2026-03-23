<template>
  <div :class="cn('flex flex-col space-y-1.5 text-center sm:text-left', props.class)">
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface DialogHeaderProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<DialogHeaderProps>();
</script>
