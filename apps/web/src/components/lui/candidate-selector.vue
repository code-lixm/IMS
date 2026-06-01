<template>
  <div class="relative">
    <Button
      v-if="!currentCandidate"
      variant="ghost"
      size="sm"
      class="h-8 gap-1.5 rounded-[6px] bg-[#F8FAFD] px-2.5 text-xs font-semibold text-[#4B5563] shadow-none hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/14 dark:hover:text-white"
      @click="open = !open"
    >
      <User class="h-4 w-4" />
      关联候选人
    </Button>

    <div v-else class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="h-8 max-w-[16rem] gap-1.5 rounded-[6px] border-transparent bg-[#F8FAFD] px-2.5 text-xs font-semibold leading-none text-[#4B5563] shadow-none hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/14 dark:hover:text-white"
        @click="open = true"
      >
        <User class="h-4 w-4" />
        <span
          class="hidden max-w-[11rem] truncate sm:inline"
          :title="currentCandidate?.name"
        >
          {{ currentCandidate?.name ?? "候选人" }}
        </span>
        <ChevronsUpDown class="ml-auto h-3.5 w-3.5 opacity-60" />
      </Button>
    </div>

    <Dialog
      v-model:open="open"
      content-class="candidate-selector-dialog w-[min(92vw,980px)] max-w-[980px] max-h-[88vh] overflow-hidden rounded-[16px] border border-[#E0E9F3] bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
    >
      <template #content>
        <AppDialogLayout body-class="space-y-4 pt-8 sm:pt-9">
          <div class="relative pr-10">
            <Search
              class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="searchQuery"
              placeholder="搜索候选人..."
              class="pl-9"
              @input="debouncedSearch"
            />
          </div>

          <ScrollArea class="h-[420px] rounded-[8px] bg-white dark:bg-white/6">
            <div v-if="isLoading" class="flex items-center justify-center py-8">
              <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
            </div>

            <div
              v-else-if="candidates.length === 0"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              <User class="mx-auto mb-2 h-8 w-8 opacity-20" />
              <p>{{ searchQuery ? "未找到匹配的候选人" : "暂无候选人" }}</p>
            </div>

            <ul v-else class="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
              <li
                v-for="candidate in candidates"
                :key="candidate.id"
                :data-candidate-id="candidate.id"
              >
                <div
                  class="h-full rounded-[8px] border border-transparent bg-[#F8FAFD] px-3 py-3 transition-all duration-150"
                  :class="selectedId === candidate.id ? 'border-[#1E40AF] bg-[#F2F7FF] ring-1 ring-[#1E40AF]/16 dark:border-[#93B4FF] dark:bg-[#142B4A] dark:ring-[#93B4FF]/20' : 'hover:border-[#E0E9F3] hover:bg-[#F9FAFB] dark:hover:bg-white/8'"
                >
                  <button
                    type="button"
                    class="flex w-full items-start text-left text-sm"
                    :aria-pressed="selectedId === candidate.id"
                    @click="handleSelect(candidate, true)"
                  >
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                      <div class="flex items-start justify-between gap-3">
                        <span class="truncate text-[15px] font-semibold text-[#1A1A1A] dark:text-slate-100">{{ candidate.name }}</span>
                        <Badge
                          v-if="candidate.tags?.length"
                          variant="secondary"
                          class="shrink-0 text-xs"
                        >
                          {{ candidate.tags[0] }}
                        </Badge>
                      </div>
                      <span
                        v-if="candidate.applyPositionName ?? candidate.position"
                        class="text-xs text-[#4B5563] dark:text-slate-300"
                      >
                        {{ candidate.applyPositionName ?? candidate.position }}
                      </span>
                      <div class="mt-1 space-y-1 text-[12px] leading-5">
                        <p
                          v-if="candidate.interviewTime"
                          class="text-[#6B7280] dark:text-slate-400"
                        >
                          {{ formatInterviewTime(candidate.interviewTime) }} 开始
                        </p>
                        <p
                          v-if="compactInterviewLocationText(candidate)"
                          class="truncate text-[#6B7280] dark:text-slate-400"
                          :title="compactInterviewLocationText(candidate)"
                        >
                          {{ compactInterviewLocationText(candidate) }}
                        </p>
                        <a
                          v-if="meetingJoinHref(candidate)"
                          :href="meetingJoinHref(candidate) ?? undefined"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex w-fit items-center gap-1 text-[10px] font-medium text-sky-600 underline-offset-2 transition-colors hover:text-sky-500 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                          :title="meetingLinkTitle(candidate)"
                          @click.stop
                        >
                          <ExternalLink class="h-3 w-3" />
                          打开会议
                        </a>
                      </div>
                    </div>
                  </button>
                </div>
              </li>
            </ul>
          </ScrollArea>

          <template #footer>
            <Button variant="outline" @click="open = false">取消</Button>
            <Button :disabled="!selectedId" @click="handleConfirm">确认</Button>
          </template>
        </AppDialogLayout>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { ChevronsUpDown, ExternalLink, Loader2, Search, User } from "lucide-vue-next";
import { candidatesApi } from "@/api/candidates";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog } from "@/components/ui/dialog";
import { AppDialogLayout } from "@/components/ui/dialog";

interface CandidateSelectorProps {
  modelValue?: string | null;
}

interface CandidateInfo {
  id: string;
  name: string;
  position?: string | null;
  applyPositionName?: string | null;
  tags?: string[];
  interviewTime?: number | null;
  interviewUrl?: string | null;
  interviewPlace?: string | null;
}

const props = defineProps<CandidateSelectorProps>();
const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void;
  (e: "select", candidate: CandidateInfo | null): void;
}>();

const open = ref(false);
const searchQuery = ref("");
const candidates = ref<CandidateInfo[]>([]);
const selectedId = ref<string | null>(null);
const isLoading = ref(false);
const currentCandidate = ref<CandidateInfo | null>(null);
const { notifyError } = useAppNotifications();

// Watch for external changes
watch(
  () => props.modelValue,
  async (newVal) => {
    if (newVal && newVal !== currentCandidate.value?.id) {
      await loadCandidate(newVal);
    } else if (!newVal) {
      currentCandidate.value = null;
    }
  },
  { immediate: true },
);

// Load all candidates when dialog opens
watch(open, async (isOpen) => {
  if (isOpen && candidates.value.length === 0 && !searchQuery.value) {
    await loadAllCandidates();
    syncSelectionAndScroll();
  } else if (isOpen) {
    syncSelectionAndScroll();
  }
});

async function loadAllCandidates() {
  isLoading.value = true;
  try {
    const data = await candidatesApi.list({ pageSize: 50 });
    candidates.value = data.items.map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      applyPositionName: c.applyPositionName ?? null,
      tags: c.tags,
      interviewTime: c.interviewTime ?? null,
      interviewUrl: c.interviewUrl ?? null,
      interviewPlace: c.interviewPlace ?? null,
    }));
  } catch (err) {
    notifyError(
      reportAppError("candidate-selector/load-all", err, {
        title: "加载候选人失败",
        fallbackMessage: "暂时无法加载候选人列表",
      }),
    );
    candidates.value = [];
  } finally {
    isLoading.value = false;
    syncSelectionAndScroll();
  }
}

async function loadCandidate(id: string) {
  try {
    const data = await candidatesApi.get(id);
    currentCandidate.value = {
      id: data.candidate.id,
      name: data.candidate.name,
      position: data.candidate.position,
      applyPositionName: data.candidate.position,
      tags: data.candidate.tags,
      interviewTime: data.interviews[0]?.scheduledAt ?? null,
      interviewUrl: data.interviews[0]?.meetingLink ?? null,
      interviewPlace: null,
    };
  } catch (_error) {
    currentCandidate.value = null;
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchCandidates();
  }, 300);
}

async function searchCandidates() {
  if (!searchQuery.value.trim()) {
    candidates.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const data = await candidatesApi.list({
      search: searchQuery.value,
      pageSize: 20,
    });
    candidates.value = data.items.map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      applyPositionName: c.applyPositionName ?? null,
      tags: c.tags,
      interviewTime: c.interviewTime ?? null,
      interviewUrl: c.interviewUrl ?? null,
      interviewPlace: c.interviewPlace ?? null,
    }));
  } catch (err) {
    notifyError(
      reportAppError("candidate-selector/search", err, {
        title: "候选人搜索失败",
        fallbackMessage: "暂时无法搜索候选人",
      }),
    );
    candidates.value = [];
  } finally {
    isLoading.value = false;
    syncSelectionAndScroll();
  }
}

function handleSelect(candidate: CandidateInfo, shouldScroll = false) {
  selectedId.value = candidate.id;
  if (shouldScroll) {
    syncSelectionAndScroll();
  }
}

function handleConfirm() {
  if (selectedId.value) {
    const candidate = candidates.value.find(
      (c: CandidateInfo) => c.id === selectedId.value,
    );
    if (candidate) {
      currentCandidate.value = candidate;
      emit("update:modelValue", candidate.id);
      emit("select", candidate);
    }
  }
  open.value = false;
  selectedId.value = null;
  searchQuery.value = "";
  candidates.value = [];
}

function formatInterviewTime(timestamp?: number | null) {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function meetingJoinHref(candidate: CandidateInfo) {
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

function compactInterviewLocationText(candidate: CandidateInfo) {
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

  return "";
}

function meetingLinkTitle(candidate: CandidateInfo) {
  const meetingCode =
    extractMeetingCode(candidate.interviewUrl) ??
    extractMeetingCode(candidate.interviewPlace);
  if (meetingCode) {
    return `点击唤起腾讯会议（会议号 ${meetingCode}）`;
  }

  return "点击打开面试会议";
}

function syncSelectionAndScroll() {
  const targetId = selectedId.value ?? currentCandidate.value?.id ?? props.modelValue ?? null;
  if (!targetId) return;

  if (!candidates.value.some((candidate) => candidate.id === targetId)) return;

  selectedId.value = targetId;

  void nextTick(() => {
    const target = document.querySelector<HTMLElement>(`[data-candidate-id="${targetId}"]`);
    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  });
}
</script>

<style scoped>
:deep(.candidate-selector-dialog > button[aria-label="Close"]) {
  top: 18px;
  right: 18px;
}
</style>
