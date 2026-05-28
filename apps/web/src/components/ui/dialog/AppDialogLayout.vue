<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import DialogFooter from "./DialogFooter.vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  headerClass?: HTMLAttributes["class"];
  bodyClass?: HTMLAttributes["class"];
  footerClass?: HTMLAttributes["class"];
}>();
</script>

<template>
  <div :class="cn('flex min-h-0 flex-col bg-[#F8FAFD] dark:bg-transparent', props.class)">
    <div v-if="$slots.header" :class="cn('px-6 pb-4 pt-6 sm:px-8', props.headerClass)">
      <slot name="header" />
    </div>

    <div :class="cn('min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8', props.bodyClass)">
      <slot />
    </div>

    <DialogFooter
      v-if="$slots.footer"
      :class="cn('bg-[#F8FAFD] px-6 py-4 sm:px-8 dark:bg-white/6', props.footerClass)"
    >
      <slot name="footer" />
    </DialogFooter>
  </div>
</template>
