<template>
  <Card class="rounded-[8px] border-[#DCE6F2] bg-white p-4 shadow-none">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div class="inline-flex h-6 items-center rounded-[999px] bg-[#F3F6FA] px-2.5 text-[11px] font-semibold tracking-[0.08em] text-[#4B5563]">
            FILTER DESK
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 class="text-[15px] font-semibold text-[#1A1A1A]">筛选与状态视图</h3>
            <p class="text-[12px] text-[#4B5563]">当前显示 {{ activeCount }} / {{ totalCount }} 条记录</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-[12px]">
          <span class="rounded-[6px] bg-[#EEF4FF] px-2.5 py-1 font-semibold text-[#0062FF]">{{ filters.length - 1 }} 个状态视图</span>
          <button
            type="button"
            class="h-8 rounded-[6px] border border-[#E0E9F3] bg-white px-3 font-semibold text-[#4B5563] transition-colors hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!hasActiveFilters"
            @click="emit('clear')"
          >
            清空筛选
          </button>
        </div>
      </div>

      <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_150px_150px]">
        <div class="flex h-[38px] min-w-0 items-center rounded-[8px] border border-[#DCE6F2] bg-[#F8FAFD] px-3 text-[#4B5563]">
        <Search class="mr-2 h-4 w-4 shrink-0" />
        <Input
          :model-value="search"
          class="h-full border-0 bg-transparent px-0 text-[13px] shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="搜索岗位、候选人或面试官"
          @update:model-value="emit('update:search', String($event))"
        />
      </div>

      <button
        class="flex h-[38px] items-center justify-between rounded-[8px] border border-[#DCE6F2] bg-white px-3 text-[13px] text-[#1A1A1A] transition-colors hover:bg-[#F8FAFD]"
        type="button"
      >
        全部状态
        <ChevronDown class="h-4 w-4 text-[#4B5563]" />
      </button>

      <button
        class="flex h-[38px] items-center justify-between rounded-[8px] border border-[#DCE6F2] bg-white px-3 text-[13px] text-[#1A1A1A] transition-colors hover:bg-[#F8FAFD]"
        type="button"
      >
        本周
        <CalendarDays class="h-4 w-4 text-[#4B5563]" />
      </button>
      </div>

      <div class="rounded-[8px] border border-[#E6EDF5] bg-[#F8FAFD] p-1.5">
        <div class="mb-2 flex items-center justify-between gap-3 px-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">状态视图</span>
          <span class="text-[11px] text-[#6B7280]">按当前工作流切换</span>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="item in filters"
            :key="item.value"
            type="button"
            :class="[
              'inline-flex h-8 items-center rounded-[6px] px-3 text-[12px] font-semibold transition-colors',
              item.value === activeFilter
                ? 'bg-[#EEF4FF] text-[#0062FF]'
                : 'bg-white text-[#4B5563] hover:bg-[#F3F6FA] hover:text-[#1A1A1A]',
            ]"
            @click="emit('update:activeFilter', item.value)"
          >
            <span>{{ item.label }}</span>
            <span class="ml-1.5 rounded-[999px] bg-black/5 px-1.5 py-[1px] text-[11px] font-semibold" :class="item.value === activeFilter ? 'bg-[#0062FF14] text-[#0062FF]' : 'text-[#6B7280]'">
              {{ item.count }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { CalendarDays, ChevronDown, Search } from "lucide-vue-next";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { InterviewStatusFilter } from "./types";

defineProps<{
  search: string;
  activeFilter: InterviewStatusFilter["value"];
  activeCount: number;
  filters: InterviewStatusFilter[];
  hasActiveFilters: boolean;
  totalCount: number;
}>();

const emit = defineEmits<{
  (event: "update:search", value: string): void;
  (event: "update:activeFilter", value: InterviewStatusFilter["value"]): void;
  (event: "clear"): void;
}>();
</script>
