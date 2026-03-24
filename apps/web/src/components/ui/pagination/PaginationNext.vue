<template>
  <button
    type="button"
    class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
    :disabled="pagination.page.value >= pagination.pageCount.value"
    @click="pagination.nextPage()"
  >
    下一页
  </button>
</template>

<script setup lang="ts">
import { inject } from "vue";

const pagination = inject<any>("pagination-context");

if (!pagination) {
  throw new Error("PaginationNext must be used within Pagination");
}
</script>
