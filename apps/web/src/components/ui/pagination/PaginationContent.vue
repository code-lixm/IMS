<template>
  <div class="flex items-center gap-1">
    <slot :items="pagination.items.value" />
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";

const pagination = inject<any>("pagination-context");

if (!pagination) {
  throw new Error("PaginationContent must be used within Pagination");
}
</script>
