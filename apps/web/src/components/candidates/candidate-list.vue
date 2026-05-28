<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <!-- 批量操作工具栏 -->
    <div
      v-if="hasSelection"
      class="mb-3 flex h-[52px] items-center justify-between rounded-md bg-[#F8FAFD] px-3 py-2 dark:bg-white/5"
    >
      <div class="flex items-center gap-2 text-sm">
        <Checkbox :checked="isAllSelectedOnPage" @update:checked="toggleAllOnPage" />
        <span class="font-semibold text-[#1A1A1A] dark:text-slate-100">已选择 {{ selectedCount }} 位候选人</span>
        <span class="text-[13px] text-[#4B5563] dark:text-slate-300">可批量分享、导出或删除候选人。</span>
      </div>
      <div class="flex items-center gap-2">
        <Button size="sm" variant="outline" class="h-8 rounded-md bg-white px-3 text-[12px] font-semibold text-[#1A1A1A] dark:bg-white/8 dark:text-slate-100" @click="clearSelection">取消选择</Button>
        <Button size="sm" class="h-8 rounded-md px-3 text-[12px] font-semibold" :disabled="shareLoading" @click="emit('batch-share')">
          <Share2 v-if="!shareLoading" class="mr-1.5 h-3.5 w-3.5" />
          {{ shareLoading ? '分享中...' : '分享' }}
        </Button>
      </div>
    </div>

    <div v-if="loading" class="space-y-3">
      <Card class="overflow-hidden">
        <div class="p-4">
          <div class="space-y-3">
            <div
              v-for="i in 8"
              :key="i"
              class="grid grid-cols-[48px_1.8fr_1.7fr_1.9fr_220px] gap-3"
            >
              <Skeleton v-for="j in 6" :key="j" class="h-4 w-full" />
            </div>
          </div>
        </div>
      </Card>
    </div>

    <EmptyState
      v-else-if="!items.length"
      :scenario="emptyScenario"
      class="flex-1 min-h-0 w-full"
      :title="'暂无候选人'"
      :description="'还没有候选人数据，可以先导入已有的面试人信息。'"
      :secondary-action-text="'导入面试信息'"
      :secondary-action-handler="() => emit('import-imr')"
    />

      <Card
        v-else
        class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border-[#DCE6F2] bg-[#F7FAFC] p-0 dark:border-white/10 dark:bg-[#0F1A28]"
      >
        <div class="grid h-11 shrink-0 grid-cols-[32px_minmax(220px,1.45fr)_minmax(180px,1fr)_minmax(128px,.75fr)_220px] items-center gap-3 border-b border-[#E6EDF5] bg-transparent px-4 text-[12px] font-semibold text-[#526071] dark:border-white/8 dark:text-slate-300">
          <div class="flex justify-center" @click.stop>
            <Checkbox
              :checked="isAllSelectedOnPage"
              :indeterminate="isIndeterminateOnPage"
              @update:checked="toggleAllOnPage"
            />
          </div>
          <span>候选人</span>
          <span>应聘 / 面试</span>
          <span>进展</span>
          <span class="text-center">操作</span>
        </div>

        <div ref="bodyRef" class="min-h-0 flex-1 space-y-2 overflow-y-auto bg-transparent px-3 pb-3 pt-2">
          <div
            v-for="candidate in items"
            :key="candidate.id"
            :class="[
              'group grid min-h-[68px] cursor-pointer grid-cols-[32px_minmax(220px,1.45fr)_minmax(180px,1fr)_minmax(128px,.75fr)_220px] items-center gap-3 rounded-md px-0 text-[13px] transition-colors',
              checkIsSelected(candidate.id)
                ? 'bg-white ring-1 ring-[#BFD5FF] dark:bg-primary/18 dark:ring-primary/20'
                : 'border border-transparent bg-white/88 hover:border-[#E6EDF5] hover:bg-white dark:bg-white/4 dark:hover:bg-white/6',
            ]"
            @click="openInLui(candidate)"
          >
            <div class="flex justify-center px-2" @click.stop>
              <Checkbox
                :checked="checkIsSelected(candidate.id)"
                @update:checked="toggleCandidateSelection(candidate.id)"
              />
            </div>

            <div class="min-w-0 space-y-1 py-3">
              <button
                class="block max-w-full truncate text-left text-[14px] font-semibold leading-5 text-[#1A1A1A] hover:text-[#0062FF] dark:text-slate-100 dark:hover:text-primary"
                @click.stop="openInLui(candidate)"
              >
                {{ candidate.name }} · {{ candidate.phone || candidate.email || "暂无联系方式" }}
              </button>
              <p class="truncate text-[12px] leading-4 text-[#4B5563] dark:text-slate-300">
                {{ secondaryApplicationText(candidate) || "候选人信息待补充" }}
              </p>
            </div>

            <div class="min-w-0 space-y-1 py-3">
              <p class="truncate text-[13px] font-semibold leading-5 text-[#1A1A1A] dark:text-slate-100">
                {{ primaryApplicationText(candidate) }}
              </p>
              <div class="flex min-w-0 items-center gap-2 text-[12px] leading-4 text-[#4B5563] dark:text-slate-300">
                <span class="truncate">{{ formatInterviewTime(candidate.interviewTime) }}</span>
                <a
                  v-if="meetingJoinHref(candidate)"
                  :href="meetingJoinHref(candidate) ?? undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex shrink-0 items-center gap-1 font-semibold text-[#0062FF] hover:underline"
                  :title="meetingLinkTitle(candidate)"
                  @click.stop
                >
                  <ExternalLink class="h-3 w-3" />
                  会议
                </a>
              </div>
            </div>

            <div class="flex min-w-0 flex-col items-start gap-1 py-3">
              <Badge
                :class="applicationStatusClasses(candidate.applicationStatus ?? 0)"
                variant="outline"
                class="max-w-full rounded-md px-2.5 py-0.5 text-[12px] font-semibold"
              >
                {{ candidate.applicationStatusText || "未同步" }}
              </Badge>
              <span
                :class="interviewResultClasses(candidate.interviewResultString)"
                class="inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-[12px] font-medium leading-4"
                :title="candidate.interviewResultString || '待反馈'"
              >
                {{ interviewResultText(candidate.interviewResultString) }}
              </span>
            </div>

            <div class="flex min-w-0 items-center justify-end gap-2 px-3 py-3" @click.stop>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 min-w-[52px] rounded-md border-0 bg-transparent px-3 text-[12px] font-semibold text-[#0062FF] hover:bg-[#EEF4FF] hover:text-[#0053D6] dark:bg-transparent dark:text-primary dark:hover:bg-primary/12"
                @click="emit('open-workspace', candidate.id)"
              >
                详情
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 min-w-[64px] rounded-md border-0 bg-transparent px-3 text-[12px] font-semibold text-[#526071] hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-primary"
                :disabled="exportLoadingId === candidate.id"
                @click="emit('export', candidate.id)"
              >
                {{ exportLoadingId === candidate.id ? "导出中…" : "导出" }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 min-w-[64px] rounded-md border-0 bg-transparent px-3 text-[12px] font-semibold text-[#DC2626] hover:bg-[#FEF2F2] hover:text-[#B91C1C] dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/16 dark:hover:text-red-200"
                :disabled="deleteLoadingId === candidate.id"
                @click="emit('delete', candidate.id)"
              >
                {{ deleteLoadingId === candidate.id ? "删除中…" : "删除" }}
              </Button>
            </div>
          </div>
        </div>

      <!-- 分页器：固定在底部 -->
      <div class="shrink-0 border-t border-[#E6EDF5] bg-transparent px-4 py-3 dark:border-white/8 dark:bg-transparent">
        <div
          class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2"
        >
          <div class="text-sm text-muted-foreground sm:shrink-0">
            共 {{ total }} 位候选人，第 {{ page }} / {{ totalPages }} 页
          </div>

          <div
            class="flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-end sm:gap-2"
          >
            <label class="flex items-center gap-2 text-sm text-muted-foreground">
              每页
              <select
                class="h-8 rounded-md border border-[#E5E7EB] bg-white px-2 text-foreground shadow-sm dark:border-white/10 dark:bg-white/8 dark:text-slate-100"
                :value="String(pageSize)"
                @change="emitPageSizeChange"
              >
                <option
                  v-for="option in pageSizeOptions"
                  :key="option"
                  :value="String(option)"
                >
                  {{ option }}
                </option>
              </select>
              条
            </label>

            <Pagination
              v-slot="{ page: currentPage }"
              :items-per-page="pageSize"
              :total="total"
              :page="page"
              @update:page="emit('page-change', $event)"
            >
              <PaginationContent v-slot="{ items: paginationItems }">
                <PaginationPrevious />

                <template
                  v-for="(item, index) in paginationItems"
                  :key="item.type === 'page' ? item.value : item.key"
                >
                  <PaginationItem
                    v-if="item.type === 'page'"
                    :value="item.value"
                    :is-active="item.value === currentPage"
                  >
                    {{ item.value }}
                  </PaginationItem>
                  <PaginationEllipsis v-else :index="Number(index)" />
                </template>

                <PaginationNext />
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ExternalLink, Share2 } from "lucide-vue-next";
import {
  applicationStatusClasses,
  type CandidateListData,
  type CandidateSource,
} from "@ims/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";

interface CandidateListProps {
  items: CandidateListData["items"];
  searchKeyword?: string;
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  exportLoadingId?: string | null;
  deleteLoadingId?: string | null;
  // 批量选择相关
  hasSelection?: boolean;
  selectedCount?: number;
  isAllSelectedOnPage?: boolean;
  isIndeterminateOnPage?: boolean;
  shareLoading?: boolean;
  isSelected?: (candidateId: string) => boolean;
}

const props = withDefaults(defineProps<CandidateListProps>(), {
  hasSelection: false,
  selectedCount: 0,
  isAllSelectedOnPage: false,
  isIndeterminateOnPage: false,
  shareLoading: false,
});

const router = useRouter();
const bodyRef = ref<HTMLDivElement | null>(null);

function openInLui(candidate: CandidateListData["items"][number]) {
  const phone = candidate.phone;
  if (phone) {
    router.push(`/lui?phone=${encodeURIComponent(phone)}`);
  } else {
    // Fallback to candidate id if no phone
    router.push(`/lui?candidateId=${encodeURIComponent(candidate.id)}`);
  }
}

const emit = defineEmits<{
  (e: "import-imr"): void;
  (e: "select", candidateId: string): void;
  (e: "open-workspace", candidateId: string): void;
  (e: "export", candidateId: string): void;
  (e: "delete", candidateId: string): void;
  (e: "page-change", page: number): void;
  (e: "page-size-change", pageSize: number): void;
  // 批量选择相关
  (e: "toggle-selection", candidateId: string): void;
  (e: "toggle-all"): void;
  (e: "clear-selection"): void;
  (e: "batch-share"): void;
}>();

function checkIsSelected(candidateId: string): boolean {
  return props.isSelected?.(candidateId) ?? false;
}

function toggleCandidateSelection(candidateId: string) {
  emit("toggle-selection", candidateId);
}

function toggleAllOnPage() {
  emit("toggle-all");
}

function clearSelection() {
  emit("clear-selection");
}

const pageSizeOptions = [20, 50, 100];
const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize)),
);

const emptyScenario = computed(() => {
  const keyword = props.searchKeyword?.trim() ?? "";
  return keyword.length > 0 ? "search" : "candidates";
});

function sourceLabel(source: CandidateSource) {
  const map: Record<string, string> = {
    local: "本地",
    remote: "远程",
    hybrid: "混合",
  };
  return map[source] ?? source;
}

function yearsOfExperienceLabel(years: number | null) {
  if (years === null) return "经验未填写";
  return `${years} 年经验`;
}

function primaryApplicationText(candidate: CandidateListData["items"][number]) {
  const position = candidate.applyPositionName || candidate.position || "岗位待补充";
  const department = candidate.organizationName || "未同步部门";
  return `${position} · ${department}`;
}

function secondaryApplicationText(candidate: CandidateListData["items"][number]) {
  const departmentPath = candidate.orgAllParentName
    ? compactDepartmentPath(candidate.orgAllParentName, candidate.organizationName)
    : null;
  const source = candidate.recruitmentSourceName || sourceLabel(candidate.source);
  return [departmentPath, yearsOfExperienceLabel(candidate.yearsOfExperience), source]
    .filter(Boolean)
    .join(" · ");
}

function interviewResultText(value?: string | null) {
  const result = value?.trim();
  if (!result) return "待反馈";
  return result.length === 1 ? `评价 ${result}` : result;
}

function interviewResultClasses(value?: string | null) {
  const result = value?.trim();
  if (!result) return "bg-[#F3F4F6] text-[#6B7280] dark:bg-white/8 dark:text-slate-300";
  if (/通过|录用|pass|hire/i.test(result)) return "bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/12 dark:text-emerald-200";
  if (/淘汰|不通过|拒绝|reject|fail/i.test(result)) return "bg-[#FEF2F2] text-[#DC2626] dark:bg-red-500/12 dark:text-red-200";
  if (/待定|候补|hold|pending/i.test(result)) return "bg-[#FFFBEB] text-[#B45309] dark:bg-amber-500/12 dark:text-amber-200";
  return "bg-[#F3F6FA] text-[#4B5563] dark:bg-white/8 dark:text-slate-300";
}

function formatInterviewTime(timestamp?: number | null) {
  if (!timestamp) return "未安排";

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactDepartmentPath(
  path: string,
  currentDepartment?: string | null,
) {
  const segments = path
    .split("-")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const tail = segments.slice(-3);
  if (currentDepartment && tail[tail.length - 1] === currentDepartment) {
    tail.pop();
  }
  return tail.join(" / ") || path;
}

function normalizeMeetingSource(value?: string | null) {
  return value?.replaceAll('"', "").trim() ?? "";
}

function extractMeetingCode(value?: string | null) {
  const normalized = normalizeMeetingSource(value);
  if (!normalized) return null;

  const matched = normalized.match(/(\d{3})[-\s]?(\d{3,4})[-\s]?(\d{3,4})/);
  if (!matched) return null;

  return matched.slice(1).join("");
}

function meetingJoinHref(candidate: CandidateListData["items"][number]) {
  const normalizedUrl = normalizeMeetingSource(candidate.interviewUrl);
  if (/^(https?:\/\/|wemeet:\/\/)/i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  const meetingCode =
    extractMeetingCode(candidate.interviewUrl) ??
    extractMeetingCode(candidate.interviewPlace);
  if (meetingCode) {
    return `wemeet://page/inmeeting?meeting_code=${meetingCode}`;
  }

  return null;
}

function meetingLinkTitle(candidate: CandidateListData["items"][number]) {
  const meetingCode =
    extractMeetingCode(candidate.interviewUrl) ??
    extractMeetingCode(candidate.interviewPlace);
  if (meetingCode) {
    return `点击唤起腾讯会议（会议号 ${meetingCode}）`;
  }

  return "点击打开面试会议";
}

function emitPageSizeChange(event: Event) {
  const nextPageSize = Number((event.target as HTMLSelectElement).value);
  if (!Number.isFinite(nextPageSize) || nextPageSize === props.pageSize) return;
  emit("page-size-change", nextPageSize);
}
</script>
