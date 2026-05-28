<template>
  <aside class="flex h-full w-full flex-col bg-[#F8FAFD] dark:bg-transparent">
    <ScrollArea class="h-0 flex-1" viewport-class="h-full">
      <ul class="space-y-1 p-2">
        <li
          v-for="conversation in conversations"
          :key="conversation.id"
          class="group relative"
        >
          <button
            type="button"
            class="conversation-row-button flex min-h-10 w-full flex-col justify-center gap-1 rounded-[6px] border px-3 py-2 text-left text-[13px] transition-colors"
            :class="
              activeId === conversation.id
                ? 'border-[#0063ff1a] bg-[#EEF4FF] text-[#1A1A1A] dark:border-primary/20 dark:bg-white/12 dark:text-slate-100'
                : 'border-transparent bg-transparent text-[#4B5563] hover:bg-[#F8FAFD] hover:text-[#1A1A1A] dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-200'
            "
            @click="handleSelect(conversation.id)"
          >
            <!-- 第一行：标题和时间 -->
            <div class="relative min-w-0 pr-[6.5rem]">
              <span class="block truncate font-medium leading-5">{{ displayTitle(conversation.title) }}</span>
              <span class="absolute right-0 top-0 text-[11px] leading-5 text-muted-foreground transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
                {{ formatTime(conversation.updatedAt) }}
              </span>
            </div>

            <!-- 第二行：面试信息 -->
            <div v-if="conversation.candidateId" class="flex items-center gap-2 text-xs">
              <Badge
                v-if="conversation.interviewRound"
                variant="outline"
                class="h-5 px-1.5 text-[10px]"
              >
                {{ formatInterviewRoundLabel(conversation.interviewRound) }}
              </Badge>
              <Badge
                v-if="conversation.interviewStatus"
                :variant="getInterviewStatusVariant(conversation.interviewStatus)"
                class="h-5 px-1.5 text-[10px]"
              >
                {{ conversation.interviewStatusLabel }}
              </Badge>
            </div>
          </button>

          <!-- 操作按钮：悬浮显示 -->
          <div
            class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <button
              type="button"
              class="conversation-action-button flex h-7 w-7 items-center justify-center rounded-[6px] border border-transparent text-[#9CA3AF] transition-colors hover:border-[#CFE0FF] hover:bg-white hover:text-[#0062FF] dark:text-slate-400 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-slate-200"
              @click.stop="openRename(conversation)"
              title="重命名会话"
            >
              <Pencil class="h-3.5 w-3.5" />
              <span class="sr-only">重命名</span>
            </button>
            <button
              type="button"
              class="conversation-action-button flex h-7 w-7 items-center justify-center rounded-[6px] border border-transparent text-[#9CA3AF] transition-colors hover:border-red-100 hover:bg-white hover:text-[#E7000B] dark:text-slate-400 dark:hover:border-red-500/20 dark:hover:bg-red-500/15 dark:hover:text-red-200"
              @click.stop="handleDelete(conversation.id)"
              title="删除会话"
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span class="sr-only">删除</span>
            </button>
          </div>
        </li>
      </ul>
    </ScrollArea>

    <Dialog
      :open="renameOpen"
      content-class="sm:max-w-md max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
      @update:open="handleRenameOpenChange"
    >
      <template #content>
        <AppDialogLayout body-class="space-y-4">
          <template #header>
            <DialogHeader>
              <DialogTitle>重命名会话</DialogTitle>
              <DialogDescription>给当前会话一个更好识别的名字。</DialogDescription>
            </DialogHeader>
          </template>

          <Input
            v-model="renameValue"
            data-conversation-rename-input
            placeholder="输入会话名称"
            @keydown.enter.prevent="submitRename"
          />

          <template #footer>
            <Button type="button" variant="outline" @click="closeRename">取消</Button>
            <Button type="button" @click="submitRename">保存</Button>
          </template>
        </AppDialogLayout>
      </template>
    </Dialog>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Pencil, Trash2 } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AppDialogLayout } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatInterviewRoundLabel } from "@ims/shared";
import type { Conversation } from "@/stores/lui";

interface ExtendedConversation extends Conversation {
  interviewRound?: number | null;
  interviewStatus?: string | null;
  interviewStatusLabel?: string | null;
}

interface ConversationListProps {
  conversations: ExtendedConversation[];
  selectedId?: string | null;
}

const props = withDefaults(defineProps<ConversationListProps>(), {
  selectedId: null,
});

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "delete", id: string): void;
  (e: "rename", id: string, title: string): void;
}>();

const conversations = computed(() => props.conversations);
const activeId = computed(() => props.selectedId ?? null);

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const renameOpen = ref(false);
const renameValue = ref("");
const renameTarget = ref<ExtendedConversation | null>(null);

function formatTime(value: Date) {
  return dateFormatter.format(value);
}

function displayTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "新会话";
  }

  const firstLine = normalized.split(/\n+/)[0]?.trim() ?? normalized;
  const punctuationIndex = firstLine.search(/[。！？!?]/);
  const firstSentence = punctuationIndex >= 0
    ? firstLine.slice(0, punctuationIndex + 1)
    : firstLine;
  const compact = firstSentence.trim();

  return compact.length <= 26
    ? compact
    : `${compact.slice(0, 26).trimEnd()}…`;
}

function getInterviewStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "scheduled":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

function handleSelect(id: string) {
  emit("select", id);
}

function handleDelete(id: string) {
  emit("delete", id);
}

function openRename(conversation: ExtendedConversation) {
  renameTarget.value = conversation;
  renameValue.value = conversation.title || "";
  renameOpen.value = true;
  nextTick(() => {
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>("[data-conversation-rename-input]");
      input?.focus();
      input?.select();
    });
  });
}

function closeRename() {
  renameOpen.value = false;
  renameTarget.value = null;
  renameValue.value = "";
}

function handleRenameOpenChange(value: boolean) {
  if (!value) {
    closeRename();
    return;
  }
  renameOpen.value = value;
}

function submitRename() {
  if (!renameTarget.value) {
    return;
  }
  const nextTitle = renameValue.value.trim();
  if (!nextTitle || nextTitle === renameTarget.value.title.trim()) {
    closeRename();
    return;
  }
  emit("rename", renameTarget.value.id, nextTitle);
  closeRename();
}
</script>
