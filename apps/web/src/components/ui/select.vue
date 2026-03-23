<template>
  <SelectRoot
    :model-value="modelValue"
    :default-value="defaultValue"
    :disabled="disabled"
    @update:model-value="(v) => emit('update:modelValue', v as string)"
  >
    <slot />
  </SelectRoot>
</template>

<script setup lang="ts">
import { SelectRoot } from "radix-vue";

interface SelectProps {
  modelValue?: string;
  defaultValue?: string;
  disabled?: boolean;
}

defineProps<SelectProps>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();
</script>
