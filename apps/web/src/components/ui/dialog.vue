<template>
  <DialogRoot :open="open" @update:open="(v) => emit('update:open', v)">
    <slot />
    <Teleport to="body">
      <DialogPortal :disabled="!open">
        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition duration-150"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <DialogOverlay v-if="open" class="fixed inset-0 z-50 bg-black/50" />
        </Transition>
        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-150"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <DialogContent
            v-if="open"
            :class="cn('fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg', contentClass)"
          >
            <slot name="content" />
          </DialogContent>
        </Transition>
      </DialogPortal>
    </Teleport>
  </DialogRoot>
</template>

<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from "radix-vue";
import { cn } from "@/lib/utils";

interface DialogProps {
  open?: boolean;
  contentClass?: string;
}

defineProps<DialogProps>();
const emit = defineEmits<{ (e: "update:open", v: boolean): void }>();
</script>
