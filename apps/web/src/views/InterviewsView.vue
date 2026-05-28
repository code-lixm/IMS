<template>
  <AppPageShell :class="`flex h-screen flex-col ${imsDesign.shell}`">
    <AppPageContent :class="imsDesign.pageContent">
      <ImsPageBackground />

      <ImsPageTitleBar class="relative z-[1]" title="面试记录">
        <template #actions>
          <Button variant="secondary" :class="[imsDesign.secondaryButton, 'border border-[#E0E9F3] bg-white shadow-none hover:bg-[#F8FAFD]']">
            <Download class="h-4 w-4 text-[#4B5563]" />
            导出
          </Button>
          <Button :class="[imsDesign.primaryButton, 'shadow-none']">
            <Plus class="h-4 w-4" />
            新建面试
          </Button>
        </template>
      </ImsPageTitleBar>

      <section class="relative z-[1] grid gap-4 rounded-[8px] border border-[#DCE6F2] bg-[#F8FAFD] p-4 xl:grid-cols-[minmax(0,1.3fr)_320px]">
        <div class="space-y-4">
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1.5">
              <div class="inline-flex h-7 items-center rounded-[999px] bg-white px-3 text-[11px] font-semibold tracking-[0.08em] text-[#0062FF]">
                INTERVIEW DESK
              </div>
              <div>
                <h2 class="text-[18px] font-semibold leading-[1.2] text-[#1A1A1A]">本周面试节奏与待处理记录集中管理</h2>
                <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">
                  把排期、确认、重复记录放在同一工作区内，减少在列表与摘要之间来回切换。
                </p>
              </div>
            </div>

            <div class="hidden items-center gap-2 xl:flex">
              <span class="rounded-[6px] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4B5563]">{{ filteredRecords.length }} 条当前结果</span>
              <span class="rounded-[6px] bg-[#EEF4FF] px-2.5 py-1 text-[11px] font-semibold text-[#0062FF]">{{ todayCount }} 条今日安排</span>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article
              v-for="item in overviewCards"
              :key="item.label"
              class="rounded-[8px] border border-[#E3EAF4] bg-white px-4 py-3"
            >
              <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">{{ item.label }}</p>
              <div class="mt-2 flex items-end justify-between gap-3">
                <span class="text-[22px] font-semibold leading-none text-[#1A1A1A]">{{ item.value }}</span>
                <span :class="item.tone">{{ item.caption }}</span>
              </div>
            </article>
          </div>
        </div>

        <aside class="rounded-[8px] border border-[#E3EAF4] bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">当前关注</p>
              <h3 class="mt-1 text-[15px] font-semibold text-[#1A1A1A]">{{ focusRecord?.title ?? '暂无需跟进记录' }}</h3>
            </div>
            <span class="rounded-[6px] bg-[#EEF4FF] px-2 py-1 text-[11px] font-semibold text-[#0062FF]">
              {{ focusRecord?.scheduledAt ?? '已清空' }}
            </span>
          </div>
          <p class="mt-3 text-[12px] leading-5 text-[#4B5563]">
            {{ focusRecord?.meta ?? '当前筛选下没有待确认或待处理事项。' }}
          </p>
          <div class="mt-4 space-y-2 border-t border-[#EDF2F7] pt-3 text-[12px] text-[#4B5563]">
            <div class="flex items-center justify-between gap-3">
              <span>待确认 / 异常</span>
              <span class="font-semibold text-[#1A1A1A]">{{ pendingCount + duplicateCount }} 条</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>已发布排期</span>
              <span class="font-semibold text-[#1A1A1A]">{{ publishedCount }} 条</span>
            </div>
          </div>
        </aside>
      </section>

      <InterviewFilterBar
        v-model:search="search"
        v-model:active-filter="activeFilter"
        class="relative z-[1]"
        :active-count="filteredRecords.length"
        :filters="filters"
        :has-active-filters="hasActiveFilters"
        :total-count="records.length"
        @clear="clearFilters"
      />

      <section class="relative z-[1] grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <InterviewRecordList :records="filteredRecords" />
        <InterviewStatusPanel :records="filteredRecords" />
      </section>
    </AppPageContent>
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Download, Plus } from "lucide-vue-next";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import ImsPageBackground from "@/components/layout/ims-page-background.vue";
import ImsPageTitleBar from "@/components/layout/ims-page-title-bar.vue";
import { imsDesign } from "@/components/layout/ims-design";
import InterviewFilterBar from "@/components/interviews/interview-filter-bar.vue";
import InterviewRecordList from "@/components/interviews/interview-record-list.vue";
import InterviewStatusPanel from "@/components/interviews/interview-status-panel.vue";
import { Button } from "@/components/ui/button";
import type { InterviewRecord, InterviewStatusFilter } from "@/components/interviews/types";

const records: InterviewRecord[] = [
  {
    id: "interview-1",
    title: "高级前端工程师 · 张林",
    stage: "二面",
    candidateCount: 4,
    channel: "远程视频",
    meta: "二面 · 4 位候选人 · 远程视频",
    status: "published",
    interviewer: "王敏 / Alex",
    scheduledAt: "05-14 14:30",
    updatedAt: "10 分钟前",
    group: "today",
  },
  {
    id: "interview-2",
    title: "产品经理 · 刘雨",
    stage: "初面",
    candidateCount: 2,
    channel: "候选人待确认",
    meta: "初面 · 2 位候选人 · 待候选人确认",
    status: "pending",
    interviewer: "陈洁",
    scheduledAt: "05-14 16:00",
    updatedAt: "25 分钟前",
    group: "today",
  },
  {
    id: "interview-3",
    title: "产品经理 · 刘雨",
    stage: "冲突处理",
    candidateCount: 1,
    channel: "重复候选人",
    meta: "同邮箱候选人已存在，需选择合并或保留",
    status: "duplicate",
    interviewer: "-",
    scheduledAt: "待处理",
    updatedAt: "刚刚",
    group: "today",
  },
  {
    id: "interview-4",
    title: "后端工程师 · 周晨",
    stage: "终面",
    candidateCount: 1,
    channel: "线下面试",
    meta: "终面 · 1 位候选人 · 未发布通知",
    status: "draft",
    interviewer: "徐岚",
    scheduledAt: "05-16 10:00",
    updatedAt: "1 小时前",
    group: "week",
  },
  {
    id: "interview-5",
    title: "数据分析师 · 赵一鸣",
    stage: "复盘完成",
    candidateCount: 3,
    channel: "归档",
    meta: "复盘完成 · 3 份评价 · 已归档",
    status: "closed",
    interviewer: "李宁",
    scheduledAt: "05-12 11:20",
    updatedAt: "昨天",
    group: "week",
  },
];

const search = ref("");
const activeFilter = ref<InterviewStatusFilter["value"]>("all");

const todayCount = computed(() => records.filter((record) => record.group === "today").length);
const pendingCount = computed(() => records.filter((record) => record.status === "pending").length);
const duplicateCount = computed(() => records.filter((record) => record.status === "duplicate").length);
const publishedCount = computed(() => records.filter((record) => record.status === "published").length);

const filters = computed<InterviewStatusFilter[]>(() => [
  { value: "all", label: "全部", count: records.length },
  { value: "published", label: "已发布", count: records.filter((record) => record.status === "published").length },
  { value: "pending", label: "待确认", count: records.filter((record) => record.status === "pending").length },
  { value: "draft", label: "草稿", count: records.filter((record) => record.status === "draft").length },
  { value: "duplicate", label: "异常", count: records.filter((record) => record.status === "duplicate").length },
  { value: "closed", label: "已结束", count: records.filter((record) => record.status === "closed").length },
]);

const filteredRecords = computed(() => {
  const keyword = search.value.trim().toLowerCase();

  return records.filter((record) => {
    const matchesStatus = activeFilter.value === "all" || record.status === activeFilter.value;
    const matchesKeyword =
      keyword.length === 0 ||
      [record.title, record.meta, record.interviewer, record.scheduledAt]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    return matchesStatus && matchesKeyword;
  });
});

const hasActiveFilters = computed(() => search.value.trim().length > 0 || activeFilter.value !== "all");

const overviewCards = computed(() => [
  {
    label: "本周记录",
    value: records.length,
    caption: "持续更新",
    tone: "text-[11px] font-semibold text-[#6B7280]",
  },
  {
    label: "今日安排",
    value: todayCount.value,
    caption: "优先跟进",
    tone: "text-[11px] font-semibold text-[#0062FF]",
  },
  {
    label: "待确认",
    value: pendingCount.value,
    caption: "需要反馈",
    tone: "text-[11px] font-semibold text-[#B45309]",
  },
  {
    label: "异常记录",
    value: duplicateCount.value,
    caption: "先处理冲突",
    tone: "text-[11px] font-semibold text-[#DC2626]",
  },
]);

const focusRecord = computed(() => filteredRecords.value.find((record) => ["pending", "duplicate"].includes(record.status)) ?? filteredRecords.value[0]);

function clearFilters() {
  search.value = "";
  activeFilter.value = "all";
}
</script>
