<template>
  <h2
    :class="cn('text-lg font-semibold leading-none tracking-tight', props.class)"
  >
    <slot />
  </h2>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface DialogTitleProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<DialogTitleProps>();
</script>
