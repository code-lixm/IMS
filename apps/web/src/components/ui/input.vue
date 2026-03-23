<template>
  <input
    :value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :name="name"
    :list="list"
    :autocomplete="autocomplete"
    :class="cn('flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', props.class)"
    @input="onInput"
  >
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

interface InputProps {
  modelValue?: string | number
  modelModifiers?: Record<string, boolean>
  type?: string
  placeholder?: string
  disabled?: boolean
  name?: string
  list?: string
  autocomplete?: string
  class?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<InputProps>(), {
  modelValue: "",
  modelModifiers: () => ({}),
  type: "text",
  placeholder: "",
  disabled: false,
  name: undefined,
  list: undefined,
  autocomplete: undefined,
})

const emit = defineEmits<{
  (e: "update:modelValue", value: string | number): void
}>()

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (props.modelModifiers.number) {
    emit("update:modelValue", Number(value))
    return
  }
  emit("update:modelValue", value)
}
</script>
