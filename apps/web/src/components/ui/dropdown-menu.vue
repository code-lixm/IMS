<template>
  <DropdownMenuRoot
    :open="open"
    @update:open="(v) => emit('update:open', v)"
  >
    <slot />
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { DropdownMenuRoot } from "radix-vue";

interface DropdownMenuProps {
  open?: boolean;
}

defineProps<DropdownMenuProps>();
const emit = defineEmits<{ (e: "update:open", v: boolean): void }>();
</script>
