<template>
  <div
    :class="cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      props.class,
    )"
    role="checkbox"
    :aria-checked="checked"
    :data-state="checked ? 'checked' : 'unchecked'"
    @click="toggle"
  >
    <svg
      v-if="checked"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-3.5 w-3.5 text-primary-foreground"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked?: boolean;
  class?: HTMLAttributes["class"];
}

const props = defineProps<CheckboxProps>();

const emit = defineEmits<{
  (e: "update:checked", value: boolean): void;
}>();

function toggle() {
  emit("update:checked", !props.checked);
}
</script>