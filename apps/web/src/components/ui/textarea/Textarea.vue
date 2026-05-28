<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { useVModel } from "@vueuse/core"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  defaultValue?: string | number
  disabled?: boolean
  modelValue?: string | number
  placeholder?: string
  rows?: string | number
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const textareaValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <textarea
    v-model="textareaValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="rows"
    :class="cn('flex min-h-[80px] w-full resize-y rounded-md border-0 bg-background px-3 py-2 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/8 dark:text-slate-100 dark:placeholder:text-slate-400', props.class)"
  />
</template>
