<template>
  <button
    type="button"
    :class="[
      'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-3 text-sm transition-colors',
      isActive
        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
        : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
    ]"
    @click="pagination.setPage(value)"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { inject } from "vue";

defineProps<{
  value: number;
  isActive?: boolean;
}>();

const pagination = inject<any>("pagination-context");

if (!pagination) {
  throw new Error("PaginationItem must be used within Pagination");
}
</script>
