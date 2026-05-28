<template>
  <Badge
    variant="outline"
    :class="[
      'h-6 min-w-[86px] justify-center rounded-[6px] border-transparent px-2.5 text-[12px] font-semibold',
      statusClass,
    ]"
  >
    {{ label }}
  </Badge>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { imsStatusStyles } from "@/components/layout/ims-design";
import type { InterviewStatus } from "./types";

const props = defineProps<{
  status: InterviewStatus;
}>();

const label = computed(() => imsStatusStyles[props.status].label);

const statusClass = computed(() => imsStatusStyles[props.status].badge);
</script>
