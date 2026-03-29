<template>
  <aside class="flex h-full w-full flex-col bg-background">
    <ScrollArea class="h-0 flex-1" viewport-class="h-full">
      <ul class="space-y-1 p-2">
        <li
          v-for="conversation in conversations"
          :key="conversation.id"
          class="group relative"
        >
          <button
            type="button"
            class="flex min-h-[2.75rem] w-full flex-col justify-center gap-1 rounded-md px-3 py-2 pr-10 text-left text-sm transition-colors"
            :class="
              activeId === conversation.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            "
            @click="handleSelect(conversation.id)"
          >
            <!-- 第一行：标题和时间 -->
            <div class="flex items-center justify-between gap-2">
              <span class="truncate font-medium">{{ displayTitle(conversation.title) }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ formatTime(conversation.updatedAt) }}</span>
            </div>

            <!-- 第二行：面试信息 -->
            <div v-if="conversation.candidateId" class="flex items-center gap-2 text-xs">
              <Badge
                v-if="conversation.interviewRound"
                variant="outline"
                class="h-5 px-1.5 text-[10px]"
              >
                第{{ conversation.interviewRound }}轮
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

          <!-- 删除按钮：悬浮显示 -->
          <div
            class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <button
              type="button"
              class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
              @click.stop="handleDelete(conversation.id)"
              title="删除会话"
            >
              <Trash2 class="h-4 w-4" />
              <span class="sr-only">删除</span>
            </button>
          </div>
        </li>
      </ul>
    </ScrollArea>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Trash2 } from "lucide-vue-next";
import Badge from "@/components/ui/badge.vue";
import ScrollArea from "@/components/ui/scroll-area.vue";
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
}>();

const conversations = computed(() => props.conversations);
const activeId = computed(() => props.selectedId ?? null);

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

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
</script>
