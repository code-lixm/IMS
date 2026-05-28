<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  autocomplete?: string
  defaultValue?: string | number
  disabled?: boolean
  list?: string
  modelValue?: string | number
  modelModifiers?: { number?: boolean }
  name?: string
  placeholder?: string
  type?: string
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  emits(
    "update:modelValue",
    props.modelModifiers?.number ? target.valueAsNumber : target.value,
  )
}
</script>

<template>
  <input
    :value="modelValue ?? defaultValue ?? ''"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :name="name"
    :list="list"
    :autocomplete="autocomplete"
    :class="cn('flex h-9 w-full rounded-md border-0 bg-background px-3 py-1 text-sm text-foreground shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/8 dark:text-slate-100 dark:placeholder:text-slate-400', props.class)"
    @input="handleInput"
  >
</template>
