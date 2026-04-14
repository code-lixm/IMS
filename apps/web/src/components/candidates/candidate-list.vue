<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <!-- 批量操作工具栏 -->
    <div
      v-if="hasSelection"
      class="mb-3 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2"
    >
      <div class="flex items-center gap-2 text-sm">
        <Checkbox :checked="isAllSelectedOnPage" @update:checked="toggleAllOnPage" />
        <span class="font-medium">已选择 {{ selectedCount }} 位候选人</span>
      </div>
      <div class="flex items-center gap-2">
        <Button size="sm" variant="ghost" @click="clearSelection">取消选择</Button>
        <Button size="sm" :disabled="shareLoading" @click="emit('batch-share')">
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
              class="grid grid-cols-[1fr_1.3fr_1.2fr_1.3fr_0.8fr_0.8fr_0.9fr_0.9fr_0.8fr_0.9fr] gap-3"
            >
              <Skeleton v-for="j in 10" :key="j" class="h-4 w-full" />
            </div>
          </div>
        </div>
      </Card>
    </div>

    <EmptyState
      v-else-if="!items.length"
      :scenario="emptyScenario"
      class="flex-1 min-h-0 w-full"
      :action-text="'新建候选人'"
      :action-icon="Plus"
      :action-handler="() => emit('create')"
      :secondary-action-text="'导入文件'"
      :secondary-action-handler="() => emit('import')"
    />

      <Card
        v-else
        class="flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border-border/70"
      >
        <!-- 表头：随表体水平滚动而滚动 -->
        <div ref="headerRef" class="shrink-0 overflow-x-auto">
          <Table class="min-w-[1380px] table-fixed text-[13px]">
            <colgroup>
              <col class="w-[48px] min-w-[48px]" />
              <col class="w-[10%] min-w-[140px]" />
              <col class="w-[20%] min-w-[260px]" />
              <col class="w-[13%] min-w-[180px]" />
              <col class="w-[19%] min-w-[250px]" />
              <col class="w-[7%] min-w-[96px]" />
              <col class="w-[7%] min-w-[88px]" />
              <col class="w-[8%] min-w-[104px]" />
              <col class="w-[8%] min-w-[112px]" />
              <col class="w-[8%] min-w-[108px]" />
              <col class="w-[9%] min-w-[118px]" />
            </colgroup>
            <TableHeader>
              <TableRow class="border-b border-border/70 [&>*]:whitespace-nowrap">
                <TableHead class="w-[48px] px-2 text-center">
                  <Checkbox
                    :checked="isAllSelectedOnPage"
                    :indeterminate="isIndeterminateOnPage"
                    @update:checked="toggleAllOnPage"
                  />
                </TableHead>
                <TableHead
                  class="px-4 text-[12px] font-semibold tracking-[0.01em]"
                  >姓名</TableHead
                >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >应聘部门</TableHead
              >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >应聘岗位</TableHead
              >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >面试信息</TableHead
              >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >形式</TableHead
              >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >结果</TableHead
              >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >来源</TableHead
              >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >负责人</TableHead
              >
              <TableHead class="text-[12px] font-semibold tracking-[0.01em]"
                >状态</TableHead
              >
              <TableHead
                class="sticky right-0 border-l border-border/60 bg-background/95 px-4 text-center text-[12px] font-semibold tracking-[0.01em] backdrop-blur"
                >操作</TableHead
              >
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      <!-- 表体：flex-1 填满剩余空间，内部滚动 -->
      <div
        ref="bodyRef"
        class="flex-1 min-h-0 overflow-auto"
        @scroll="syncHeaderScroll"
      >
        <Table class="min-w-[1380px] table-fixed text-[13px]">
          <colgroup>
            <col class="w-[48px] min-w-[48px]" />
            <col class="w-[10%] min-w-[140px]" />
            <col class="w-[20%] min-w-[260px]" />
            <col class="w-[13%] min-w-[180px]" />
            <col class="w-[19%] min-w-[250px]" />
            <col class="w-[7%] min-w-[96px]" />
            <col class="w-[7%] min-w-[88px]" />
            <col class="w-[8%] min-w-[104px]" />
            <col class="w-[8%] min-w-[112px]" />
            <col class="w-[8%] min-w-[108px]" />
            <col class="w-[9%] min-w-[118px]" />
          </colgroup>
          <TableBody>
            <TableRow
              v-for="candidate in items"
              :key="candidate.id"
              class="group cursor-pointer border-b border-border/60 transition-colors odd:bg-muted/30 hover:bg-accent/55"
              @click="openInLui(candidate)"
            >
              <TableCell class="w-[48px] px-2 py-2.5 text-center align-middle" @click.stop>
                <Checkbox
                  :checked="checkIsSelected(candidate.id)"
                  @update:checked="toggleCandidateSelection(candidate.id)"
                />
              </TableCell>
              <TableCell class="px-4 py-2.5 align-middle">
                <div class="min-w-0 space-y-1">
                  <button
                    class="block truncate text-left text-[14px] font-semibold leading-5 text-foreground hover:text-primary"
                    @click.stop="openInLui(candidate)"
                  >
                    {{ candidate.name }}
                  </button>
                  <p
                    class="truncate text-[12px] leading-4 text-muted-foreground/90 dark:text-neutral-500"
                  >
                    {{ candidate.phone || candidate.email || "暂无联系方式" }}
                  </p>
                </div>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <div class="min-w-0 space-y-1">
                  <p
                    class="truncate text-[13px] font-medium leading-5 text-foreground dark:text-neutral-200"
                  >
                    {{ candidate.organizationName || "未同步部门" }}
                  </p>
                  <p
                    v-if="candidate.orgAllParentName"
                    class="truncate text-[11px] leading-4 text-muted-foreground/75 dark:text-neutral-500"
                  >
                    {{
                      compactDepartmentPath(
                        candidate.orgAllParentName,
                        candidate.organizationName,
                      )
                    }}
                  </p>
                </div>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <div class="min-w-0 space-y-1">
                  <p
                    class="truncate text-[13px] font-medium leading-5 text-foreground dark:text-neutral-200"
                  >
                    {{
                      candidate.applyPositionName ||
                      candidate.position ||
                      "岗位待补充"
                    }}
                  </p>
                  <p
                    class="text-[11px] leading-4 text-muted-foreground/75 dark:text-neutral-500"
                  >
                    {{ yearsOfExperienceLabel(candidate.yearsOfExperience) }}
                  </p>
                </div>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <div class="min-w-0 space-y-1">
                  <a
                    v-if="meetingJoinHref(candidate)"
                    :href="meetingJoinHref(candidate) ?? undefined"
                    class="inline-flex max-w-full items-center gap-1 truncate text-[13px] font-medium leading-5 text-primary dark:text-sky-400 hover:underline"
                    :title="meetingLinkTitle(candidate)"
                    @click.stop
                  >
                    {{ formatInterviewTime(candidate.interviewTime) }}
                  </a>
                  <p
                    v-else
                    class="truncate text-[13px] font-medium leading-5 text-foreground dark:text-neutral-200"
                  >
                    {{ formatInterviewTime(candidate.interviewTime) }}
                  </p>
                  <a
                    v-if="meetingJoinHref(candidate)"
                    :href="meetingJoinHref(candidate) ?? undefined"
                    class="block truncate text-[11px] leading-4 text-primary/80 dark:text-sky-400/80 hover:text-primary dark:hover:text-sky-300 hover:underline"
                    :title="meetingLinkTitle(candidate)"
                    @click.stop
                  >
                    {{ compactInterviewLocationText(candidate) }}
                  </a>
                  <p
                    v-else
                    class="truncate text-[11px] leading-4 text-muted-foreground dark:text-neutral-400"
                  >
                    {{ compactInterviewLocationText(candidate) }}
                  </p>
                </div>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <span
                  class="inline-flex truncate text-[13px] leading-5 text-foreground/90 dark:text-neutral-300"
                >
                  {{ candidate.interviewTypeLabel || "未标记" }}
                </span>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <span
                  class="inline-flex truncate text-[13px] font-medium leading-5 text-foreground/90 dark:text-neutral-300"
                >
                  {{ candidate.interviewResultString || "待反馈" }}
                </span>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <span
                  class="inline-flex truncate text-[13px] leading-5 text-foreground/85 dark:text-neutral-400"
                >
                  {{
                    candidate.recruitmentSourceName ||
                    sourceLabel(candidate.source)
                  }}
                </span>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <div class="min-w-0 space-y-1">
                  <p
                    class="truncate text-[13px] font-medium leading-5 text-foreground dark:text-neutral-200"
                  >
                    {{ candidate.interviewOwnerName || "待分配" }}
                  </p>
                  <p
                    v-if="
                      candidate.dockingHrbpName &&
                      candidate.dockingHrbpName !== candidate.interviewOwnerName
                    "
                    class="truncate text-[11px] leading-4 text-muted-foreground/75 dark:text-neutral-500"
                  >
                    HRBP：{{ candidate.dockingHrbpName }}
                  </p>
                </div>
              </TableCell>

              <TableCell class="py-2.5 align-middle">
                <Badge
                  :class="
                    applicationStatusClasses(candidate.applicationStatus ?? 0)
                  "
                  variant="outline"
                  class="max-w-full whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium"
                >
                  {{ candidate.applicationStatusText || "未同步" }}
                </Badge>
              </TableCell>

              <TableCell
                class="sticky right-0 border-l border-border/60 bg-background/95 px-4 py-2.5 align-middle backdrop-blur group-hover:bg-accent/55"
              >
                <div
                  class="flex min-h-[32px] items-center justify-center gap-3 text-[12px] leading-5"
                >
                  <button
                    class="whitespace-nowrap text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline"
                    @click.stop="emit('open-workspace', candidate.id)"
                  >
                    详情
                  </button>
                  <button
                    class="whitespace-nowrap text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline"
                    :disabled="exportLoadingId === candidate.id"
                    @click.stop="emit('export', candidate.id)"
                  >
                    {{ exportLoadingId === candidate.id ? "导出中…" : "导出" }}
                  </button>
                  <button
                    class="whitespace-nowrap text-red-600 hover:underline disabled:opacity-50 disabled:no-underline"
                    :disabled="deleteLoadingId === candidate.id"
                    @click.stop="emit('delete', candidate.id)"
                  >
                    {{ deleteLoadingId === candidate.id ? "删除中…" : "删除" }}
                  </button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 分页器：固定在底部 -->
      <div class="shrink-0 border-t bg-background px-4 py-3">
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div class="text-sm text-muted-foreground">
            共 {{ total }} 位候选人，第 {{ page }} / {{ totalPages }} 页
          </div>

          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end"
          >
            <label
              class="flex items-center gap-2 text-sm text-muted-foreground"
            >
              每页
              <select
                class="h-8 rounded-md border border-input bg-background px-2 text-foreground"
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
import { Plus, Share2 } from "lucide-vue-next";
import {
  applicationStatusClasses,
  type CandidateListData,
  type CandidateSource,
} from "@ims/shared";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Checkbox from "@/components/ui/checkbox.vue";
import EmptyState from "@/components/ui/empty-state.vue";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import Skeleton from "@/components/ui/skeleton.vue";
import Table from "@/components/ui/table.vue";
import TableBody from "@/components/ui/table-body.vue";
import TableCell from "@/components/ui/table-cell.vue";
import TableHead from "@/components/ui/table-head.vue";
import TableHeader from "@/components/ui/table-header.vue";
import TableRow from "@/components/ui/table-row.vue";

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
const headerRef = ref<HTMLDivElement | null>(null);
const bodyRef = ref<HTMLDivElement | null>(null);

function syncHeaderScroll() {
  if (headerRef.value && bodyRef.value) {
    headerRef.value.scrollLeft = bodyRef.value.scrollLeft;
  }
}

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
  (e: "create"): void;
  (e: "import"): void;
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

function compactInterviewLocationText(
  candidate: CandidateListData["items"][number],
) {
  if (candidate.interviewPlace) return candidate.interviewPlace;

  if (candidate.interviewUrl) {
    return candidate.interviewUrl
      .replaceAll('"', "")
      .replace("#腾讯会议：", "腾讯会议 · ")
      .replace("腾讯会议：", "腾讯会议 · ")
      .replace(/会议密码[:：]\s*[^\s]+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return candidate.checkInTime
    ? `签到：${formatInterviewTime(candidate.checkInTime)}`
    : "暂无面试地点信息";
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
