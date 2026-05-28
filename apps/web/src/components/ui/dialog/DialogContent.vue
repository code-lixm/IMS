<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { X } from "lucide-vue-next"
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<DialogContentProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-[#0B1F4D]/24 backdrop-blur-[10px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[8px] border-0 bg-[#F7FAFFD9] p-5 shadow-none backdrop-blur-[18px] duration-200 dark:border-white/10 dark:bg-white/8 dark:shadow-[0_20px_45px_-28px_rgba(15,23,42,0.55)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          props.class,
        )
      "
    >
      <slot />

      <DialogClose
        class="absolute right-4 top-4 rounded-[6px] bg-white/70 p-1 text-[#4B5563] opacity-80 ring-offset-background transition-opacity hover:bg-[#EEF4FF] hover:text-[#0062FF] hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/16 dark:hover:text-white data-[state=open]:bg-[#EEF4FF] data-[state=open]:text-[#0062FF] dark:data-[state=open]:bg-white/16 dark:data-[state=open]:text-white"
      >
        <X class="w-4 h-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
