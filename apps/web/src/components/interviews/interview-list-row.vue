<template>
  <div
    :class="[
      'group relative grid min-h-[78px] grid-cols-[minmax(360px,1fr)_118px_150px_170px] items-center gap-3 px-4 py-3 transition-colors',
      record.status === 'closed' ? 'bg-[#F9FAFB]' : record.status === 'duplicate' ? 'bg-[#FCFCFD]' : 'bg-white hover:bg-[#FBFCFE]',
    ]"
  >
    <span :class="statusBarClass" />

    <div class="min-w-0 space-y-2 pl-3">
      <div class="flex items-start justify-between gap-3">
        <p class="truncate text-[15px] font-semibold leading-5 text-[#1A1A1A]">
          {{ record.title }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-[11px]">
        <span class="rounded-[999px] bg-[#F3F6FA] px-2 py-1 font-semibold text-[#4B5563]">{{ record.stage }}</span>
        <span class="rounded-[999px] bg-[#F8FAFD] px-2 py-1 text-[#6B7280]">{{ record.candidateCount }} 位候选人</span>
        <span class="rounded-[999px] bg-[#F8FAFD] px-2 py-1 text-[#6B7280]">{{ record.channel }}</span>
      </div>

      <p class="truncate text-[12px] leading-4 text-[#4B5563]">
        {{ record.meta }}
      </p>
    </div>

    <InterviewStatusBadge :status="record.status" />

    <div class="min-w-0">
      <p class="truncate text-[13px] font-medium text-[#1A1A1A]">{{ record.interviewer }}</p>
      <p class="mt-1 text-[11px] text-[#6B7280]">负责人</p>
    </div>

    <div class="flex items-center justify-between gap-2">
      <div v-if="record.status !== 'duplicate'" class="min-w-0">
        <p class="truncate text-[13px] font-medium text-[#1A1A1A]">{{ record.scheduledAt }}</p>
        <p class="mt-1 text-[11px] text-[#6B7280]">更新于 {{ record.updatedAt }}</p>
      </div>
      <Button
        v-if="record.status === 'duplicate'"
        variant="outline"
        size="sm"
        class="h-[30px] rounded-[6px] border-[#E5BDBD] bg-white px-3 text-[12px] font-semibold text-[#7F1D1D] shadow-none hover:bg-[#FFF8F8]"
      >
        查看重复
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import InterviewStatusBadge from "./interview-status-badge.vue";
import type { InterviewRecord } from "./types";

const props = defineProps<{
  record: InterviewRecord;
}>();

const statusBarClass = computed(() => {
  if (props.record.status === "published") {
    return "absolute left-0 top-3 h-[52px] w-[3px] rounded-r-[999px] bg-[#0062FF]";
  }

  if (props.record.status === "pending") {
    return "absolute left-0 top-3 h-[52px] w-[3px] rounded-r-[999px] bg-[#F59E0B]";
  }

  if (props.record.status === "duplicate") {
    return "absolute left-0 top-3 h-[52px] w-[3px] rounded-r-[999px] bg-[#EF4444]";
  }

  if (props.record.status === "draft") {
    return "absolute left-0 top-3 h-[52px] w-[3px] rounded-r-[999px] bg-[#F97316]";
  }

  return "absolute left-0 top-3 h-[52px] w-[3px] rounded-r-[999px] bg-[#CBD5E1]";
});
</script>
