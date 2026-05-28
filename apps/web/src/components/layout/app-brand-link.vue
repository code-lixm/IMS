<template>
  <RouterLink :to="to" class="flex items-center gap-2 shrink-0">
    <AppBrandIcon
      container-class="h-8 w-8 rounded-lg bg-primary/10 p-1 dark:bg-primary/20"
    />
    <span v-if="label" class="hidden text-lg font-semibold tracking-tight text-foreground sm:block">{{ label }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import AppBrandIcon from "@/components/layout/app-brand-icon.vue";

withDefaults(
  defineProps<{
    to?: string;
    label?: string;
  }>(),
  {
    to: "/candidates",
    label: "IMS",
  },
);
</script>
