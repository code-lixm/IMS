<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { Check, Minus } from "lucide-vue-next"
import { cn } from "@/lib/utils"

const props = defineProps<{
  id?: string
  name?: string
  required?: boolean
  disabled?: boolean
  modelValue?: boolean | "indeterminate"
  checked?: boolean
  indeterminate?: boolean
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
  (e: "update:modelValue", value: boolean | "indeterminate"): void
  (e: "update:checked", value: boolean): void
}>()

const checkboxValue = computed<boolean | "indeterminate">(() => {
  if (props.indeterminate) return "indeterminate"
  return props.checked
})

const isChecked = computed(() => checkboxValue.value === true)
const isIndeterminate = computed(() => checkboxValue.value === "indeterminate")

function handleUpdate(value: boolean | "indeterminate") {
  emits("update:modelValue", value)
  emits("update:checked", value === true)
}

function toggleChecked() {
  if (props.disabled) return
  handleUpdate(isChecked.value ? false : true)
}
</script>

<template>
  <button
    :id="id"
    type="button"
    role="checkbox"
    :name="name"
    :disabled="disabled"
    :aria-required="required ? 'true' : 'false'"
    :aria-checked="isIndeterminate ? 'mixed' : isChecked ? 'true' : 'false'"
    :data-state="isIndeterminate ? 'indeterminate' : isChecked ? 'checked' : 'unchecked'"
    :class="cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      (isChecked || isIndeterminate) && 'bg-primary text-primary-foreground',
      props.class,
    )"
    @click.stop.prevent="toggleChecked"
  >
    <span v-if="isChecked || isIndeterminate" class="flex items-center justify-center text-current">
      <Minus v-if="isIndeterminate" class="h-3.5 w-3.5 text-primary-foreground" />
      <Check v-else class="h-3.5 w-3.5 text-primary-foreground" />
    </span>
  </button>
</template>
