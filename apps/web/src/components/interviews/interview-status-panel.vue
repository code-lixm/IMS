<template>
  <aside class="hidden min-h-0 w-[320px] shrink-0 overflow-hidden rounded-[8px] border border-[#DCE6F2] bg-white xl:flex xl:flex-col">
    <section class="border-b border-[#EDF2F7] px-4 py-4">
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">SUMMARY RAIL</p>
      <h2 class="mt-1 text-[16px] font-semibold text-[#1A1A1A]">运营摘要</h2>
      <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">把状态、今日安排和异常提示收成一条稳定侧栏。</p>
    </section>

    <section class="space-y-2 border-b border-[#EDF2F7] px-4 py-4">
      <div v-for="item in summaryItems" :key="item.label" class="flex items-center justify-between rounded-[8px] bg-[#F8FAFD] px-3 py-2.5">
        <div>
          <p class="text-[12px] font-medium text-[#4B5563]">{{ item.label }}</p>
          <p class="mt-1 text-[11px] text-[#6B7280]">{{ item.helper }}</p>
        </div>
        <span :class="item.tone">{{ item.value }}</span>
      </div>
    </section>

    <section v-if="records.length === 0" class="flex flex-col items-center justify-center gap-2 border-b border-[#EDF2F7] px-4 py-8 text-center">
      <Inbox class="h-7 w-7 text-[#4B5563]" />
      <h3 class="text-[15px] font-semibold text-[#1A1A1A]">没有匹配记录</h3>
      <p class="text-[12px] leading-[1.5] text-[#4B5563]">清除筛选或切换状态分组。</p>
    </section>

    <section class="min-h-0 flex-1 border-b border-[#EDF2F7] px-4 py-4">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-[14px] font-semibold text-[#1A1A1A]">今日节奏</h3>
        <span class="rounded-[6px] bg-[#EEF4FF] px-2 py-1 text-[11px] font-semibold text-[#0062FF]">{{ todayCount }} 条</span>
      </div>

      <div class="mt-3 space-y-2 overflow-auto">
        <div
          v-for="record in recentRecords"
          :key="record.id"
          class="rounded-[8px] border border-[#E6EDF5] bg-[#FBFCFE] px-3 py-3"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="line-clamp-2 text-[13px] font-semibold leading-5 text-[#1A1A1A]">{{ record.title }}</p>
            <span class="rounded-[6px] bg-white px-2 py-1 text-[11px] font-semibold text-[#4B5563]">{{ record.scheduledAt }}</span>
          </div>
          <p class="mt-2 text-[12px] leading-4 text-[#4B5563]">{{ record.interviewer }} · {{ record.stage }}</p>
        </div>

        <div v-if="recentRecords.length === 0" class="rounded-[8px] bg-[#F8FAFD] px-3 py-4 text-center text-[12px] text-[#4B5563]">
          暂无可展示的排期
        </div>
      </div>
    </section>

    <section class="space-y-3 px-4 py-4">
      <div class="rounded-[8px] border border-[#F5D9D9] bg-[#FEF2F2] p-3">
        <div class="flex items-start gap-2.5">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-white">
            <TriangleAlert class="h-4 w-4 text-[#DC2626]" />
          </div>
          <div>
            <h3 class="text-[13px] font-semibold text-[#7F1D1D]">异常与冲突</h3>
            <p class="mt-1 text-[12px] leading-[1.5] text-[#7F1D1D]">{{ duplicateCount > 0 ? `当前有 ${duplicateCount} 条重复候选人记录，建议先人工确认。` : '当前没有重复候选人冲突。' }}</p>
          </div>
        </div>
      </div>

      <div class="rounded-[8px] bg-[#EEF4FF] p-3">
        <h3 class="text-[13px] font-semibold text-[#1A1A1A]">处理建议</h3>
        <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">优先确认待处理面试，再发布草稿；重复记录处理完成后再批量通知。</p>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Inbox, TriangleAlert } from "lucide-vue-next";
import type { InterviewRecord } from "./types";

const props = defineProps<{
  records: InterviewRecord[];
}>();

const pendingCount = computed(() => props.records.filter((record) => record.status === "pending").length);
const todayCount = computed(() => props.records.filter((record) => record.group === "today").length);
const duplicateCount = computed(() => props.records.filter((record) => record.status === "duplicate").length);
const recentRecords = computed(() => props.records.slice(0, 4));
const summaryItems = computed(() => [
  {
    label: "待确认",
    helper: "等待候选人或面试官反馈",
    value: pendingCount.value,
    tone: "text-[15px] font-semibold text-[#B45309]",
  },
  {
    label: "今天已排期",
    helper: "当日需要持续跟踪",
    value: todayCount.value,
    tone: "text-[15px] font-semibold text-[#0062FF]",
  },
  {
    label: "异常记录",
    helper: "重复或需人工处理",
    value: duplicateCount.value,
    tone: "text-[15px] font-semibold text-[#DC2626]",
  },
]);
</script>
