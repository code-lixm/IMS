<template>
  <p :class="cn('text-sm text-muted-foreground', props.class)">
    <slot />
  </p>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface DialogDescriptionProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<DialogDescriptionProps>();
</script>
