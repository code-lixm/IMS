<template>
  <div class="relative">
    <Button
      v-if="!currentCandidate"
      variant="ghost"
      size="sm"
      class="h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted/60"
      @click="open = !open"
    >
      <User class="h-3.5 w-3.5" />
      关联候选人
    </Button>

    <div v-else class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="h-8 max-w-[16rem] rounded-md gap-1 border-border/60 bg-background px-1.5 text-xs font-medium leading-none text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
        @click="open = true"
      >
        <User class="h-3.5 w-3.5" />
        <span
          class="hidden max-w-[11rem] truncate sm:inline"
          :title="currentCandidate?.name"
        >
          {{ currentCandidate?.name ?? "候选人" }}
        </span>
        <ChevronsUpDown class="ml-auto h-3.5 w-3.5 opacity-70" />
      </Button>
    </div>

    <Dialog v-model:open="open">
      <template #content>
        <div class="space-y-4">
          <div class="relative">
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

          <ScrollArea class="h-64">
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

            <ul v-else class="space-y-1 p-1">
              <li v-for="candidate in candidates" :key="candidate.id">
                <button
                  type="button"
                  class="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                  :class="selectedId === candidate.id ? 'bg-accent' : ''"
                  @click="handleSelect(candidate)"
                >
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate font-medium">{{
                      candidate.name
                    }}</span>
                    <span
                      v-if="candidate.applyPositionName ?? candidate.position"
                      class="text-xs text-muted-foreground"
                    >
                      {{ candidate.applyPositionName ?? candidate.position }}
                    </span>
                    <div class="mt-1 space-y-1 text-[11px] leading-4">
                      <p
                        v-if="candidate.interviewTime"
                        class="text-muted-foreground"
                      >
                        {{ formatInterviewTime(candidate.interviewTime) }} 开始
                      </p>
                      <a
                        v-if="meetingJoinHref(candidate)"
                        :href="meetingJoinHref(candidate) ?? undefined"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block truncate text-primary/80 hover:text-primary hover:underline"
                        :title="meetingLinkTitle(candidate)"
                        @click.stop
                      >
                        {{ compactInterviewLocationText(candidate) }}
                      </a>
                      <p
                        v-else-if="compactInterviewLocationText(candidate)"
                        class="truncate text-muted-foreground"
                      >
                        {{ compactInterviewLocationText(candidate) }}
                      </p>
                    </div>
                  </div>
                  <Badge
                    v-if="candidate.tags?.length"
                    variant="secondary"
                    class="text-xs"
                  >
                    {{ candidate.tags[0] }}
                  </Badge>
                </button>
              </li>
            </ul>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="open = false">取消</Button>
          <Button :disabled="!selectedId" @click="handleConfirm">确认</Button>
        </DialogFooter>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ChevronsUpDown, Loader2, Search, User } from "lucide-vue-next";
import { candidatesApi } from "@/api/candidates";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import Button from "@/components/ui/button.vue";
import Input from "@/components/ui/input.vue";
import ScrollArea from "@/components/ui/scroll-area.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogFooter from "@/components/ui/dialog-footer.vue";

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
  }
}

function handleSelect(candidate: CandidateInfo) {
  selectedId.value = candidate.id;
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
</script>
