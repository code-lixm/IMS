<template>
  <Card class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border-[#DCE6F2] bg-white shadow-none">
    <div class="border-b border-[#EDF2F7] px-4 py-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">LIST WORKSPACE</p>
          <h2 class="mt-1 text-[16px] font-semibold text-[#1A1A1A]">面试记录主列表</h2>
          <p class="mt-1 text-[12px] text-[#4B5563]">按今天与本周分组，优先暴露待确认、草稿和异常记录。</p>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-[12px]">
          <span class="rounded-[6px] bg-[#F3F6FA] px-2.5 py-1 font-semibold text-[#4B5563]">{{ records.length }} 条记录</span>
          <span class="rounded-[6px] bg-[#EEF4FF] px-2.5 py-1 font-semibold text-[#0062FF]">{{ todayCount }} 条今日节奏</span>
          <span class="rounded-[6px] bg-[#FFFBEB] px-2.5 py-1 font-semibold text-[#B45309]">{{ actionCount }} 条待处理</span>
        </div>
      </div>
    </div>

    <div class="grid h-11 shrink-0 grid-cols-[minmax(360px,1fr)_118px_150px_170px] items-center gap-3 border-b border-[#EDF2F7] bg-[#F8FAFD] px-4 text-[12px] font-semibold text-[#4B5563]">
      <span>候选人 / 轮次</span>
      <span>状态</span>
      <span>面试官</span>
      <span>排期 / 更新</span>
    </div>

    <div v-if="visibleGroups.length > 0" class="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
      <section v-for="group in visibleGroups" :key="group.key" class="overflow-hidden rounded-[8px] border border-[#E6EDF5] bg-[#FBFCFE]">
        <div
          :class="[
            'flex h-10 items-center justify-between px-4 text-[12px] font-semibold',
            group.key === 'today' ? 'bg-[#EEF4FF] text-[#0062FF]' : 'bg-[#F3F6FA] text-[#1A1A1A]',
          ]"
        >
          <span>{{ group.label }} · {{ group.records.length }} 条</span>
          <span class="text-[11px] font-medium" :class="group.key === 'today' ? 'text-[#3B82F6]' : 'text-[#6B7280]'">
            {{ group.key === 'today' ? '优先处理今日安排' : '保持本周节奏稳定' }}
          </span>
        </div>

        <div class="divide-y divide-[#EDF2F7] bg-white">
          <InterviewListRow
            v-for="record in group.records"
            :key="record.id"
            :record="record"
          />
        </div>
      </section>

      <div v-if="duplicateCount > 0" class="flex items-center justify-between gap-3 rounded-[8px] border border-[#F5D9D9] bg-[#FEF2F2] px-4 py-3 text-[12px] text-[#7F1D1D]">
        <span class="font-semibold leading-[1.35]">发现 {{ duplicateCount }} 条重复候选人记录，建议先合并后再批量发送通知。</span>
        <span class="rounded-[999px] bg-white px-2 py-1 text-[11px] font-semibold text-[#DC2626]">需要人工确认</span>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
      <p class="text-[16px] font-semibold text-[#1A1A1A]">没有匹配记录</p>
      <p class="mt-1 text-[12px] leading-[1.35] text-[#4B5563]">清除筛选或切换状态分组。</p>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Card } from "@/components/ui/card";
import InterviewListRow from "./interview-list-row.vue";
import type { InterviewRecord } from "./types";

const props = defineProps<{
  records: InterviewRecord[];
}>();

const visibleGroups = computed(() => {
  const groups = [
    { key: "today" as const, label: "今天" },
    { key: "week" as const, label: "本周" },
  ];

  return groups
    .map((group) => ({
      ...group,
      records: props.records.filter((record) => record.group === group.key),
    }))
    .filter((group) => group.records.length > 0);
});

const duplicateCount = computed(() => props.records.filter((record) => record.status === "duplicate").length);
const todayCount = computed(() => props.records.filter((record) => record.group === "today").length);
const actionCount = computed(() => props.records.filter((record) => ["pending", "draft", "duplicate"].includes(record.status)).length);
</script>
