<template>
  <SelectValue :placeholder="placeholder">
    <slot />
  </SelectValue>
</template>

<script setup lang="ts">
import { SelectValue } from "radix-vue";

interface SelectValueProps {
  placeholder?: string;
}

defineProps<SelectValueProps>();
</script>
