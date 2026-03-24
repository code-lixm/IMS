<template>
  <RouterLink :to="to" class="flex items-center gap-2 shrink-0">
    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
      <Briefcase class="h-4 w-4 text-primary" />
    </div>
    <span v-if="label" class="hidden text-lg font-semibold tracking-tight sm:block">{{ label }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Briefcase } from "lucide-vue-next";

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
