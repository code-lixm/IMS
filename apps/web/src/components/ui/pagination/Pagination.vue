<template>
  <nav aria-label="分页导航">
    <slot :page="currentPage" :page-count="pageCount" :set-page="setPage" />
  </nav>
</template>

<script setup lang="ts">
import { computed, provide, ref, watch } from "vue";

export type PaginationRenderItem =
  | { type: "page"; value: number }
  | { type: "ellipsis"; key: string };

const props = withDefaults(defineProps<{
  total: number;
  itemsPerPage: number;
  page?: number;
  defaultPage?: number;
}>(), {
  page: undefined,
  defaultPage: 1,
});

const emit = defineEmits<{
  (e: "update:page", value: number): void;
}>();

const internalPage = ref(props.page ?? props.defaultPage);

watch(() => props.page, (value) => {
  if (typeof value === "number") {
    internalPage.value = value;
  }
});

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / Math.max(props.itemsPerPage, 1))));

const currentPage = computed(() => {
  const raw = props.page ?? internalPage.value;
  return Math.min(Math.max(raw, 1), pageCount.value);
});

function buildItems(page: number, totalPages: number): PaginationRenderItem[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => ({ type: "page" as const, value: index + 1 }));
  }

  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages));
  const sortedPages = Array.from(pages).sort((left, right) => left - right);
  const items: PaginationRenderItem[] = [];

  for (const [index, value] of sortedPages.entries()) {
    items.push({ type: "page", value });
    const nextValue = sortedPages[index + 1];
    if (nextValue && nextValue - value > 1) {
      items.push({ type: "ellipsis", key: `ellipsis-${value}-${nextValue}` });
    }
  }

  return items;
}

const items = computed(() => buildItems(currentPage.value, pageCount.value));

function setPage(nextPage: number) {
  const normalizedPage = Math.min(Math.max(nextPage, 1), pageCount.value);
  if (normalizedPage === currentPage.value) return;

  if (props.page === undefined) {
    internalPage.value = normalizedPage;
  }

  emit("update:page", normalizedPage);
}

function previousPage() {
  setPage(currentPage.value - 1);
}

function nextPage() {
  setPage(currentPage.value + 1);
}

provide("pagination-context", {
  page: currentPage,
  pageCount,
  items,
  setPage,
  previousPage,
  nextPage,
});
</script>
