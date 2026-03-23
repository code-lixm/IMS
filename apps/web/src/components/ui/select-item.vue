<template>
  <SelectItem :value="value">
    <slot />
  </SelectItem>
</template>

<script setup lang="ts">
import { SelectItem } from "radix-vue";

interface SelectItemProps {
  value: string;
}

defineProps<SelectItemProps>();
</script>
