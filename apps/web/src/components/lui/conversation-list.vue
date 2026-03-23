<template>
  <aside class="flex h-full w-full flex-col border-r bg-background">
    <div class="flex items-center justify-between gap-2 border-b px-3 py-3">
      <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquare class="h-4 w-4 text-muted-foreground" />
        会话
      </div>

      <Button size="sm" class="h-8 px-2" @click="handleCreate">
        <Plus class="h-4 w-4" />
        新建
      </Button>
    </div>

    <ScrollArea class="h-0 flex-1" viewport-class="h-full">
      <ul class="space-y-1 p-2">
        <li
          v-for="conversation in conversations"
          :key="conversation.id"
          class="group flex items-center gap-1"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors"
            :class="
              activeId === conversation.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            "
            @click="handleSelect(conversation.id)"
          >
            <ChevronRight
              class="h-4 w-4 shrink-0 transition-transform"
              :class="activeId === conversation.id ? 'rotate-90 text-primary' : 'text-muted-foreground/70'"
            />

            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ conversation.title }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">{{ formatTime(conversation.updatedAt) }}</p>
            </div>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                @click.stop
              >
                <MoreHorizontal class="h-4 w-4" />
                <span class="sr-only">会话操作</span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" class="w-36">
              <DropdownMenuItem
                class="text-destructive focus:text-destructive data-[highlighted]:text-destructive"
                @click="handleDelete(conversation.id)"
              >
                <Trash2 class="h-4 w-4" />
                删除会话
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </ScrollArea>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight, MessageSquare, MoreHorizontal, Plus, Trash2 } from "lucide-vue-next";
import Button from "@/components/ui/button.vue";
import DropdownMenu from "@/components/ui/dropdown-menu.vue";
import DropdownMenuContent from "@/components/ui/dropdown-menu-content.vue";
import DropdownMenuItem from "@/components/ui/dropdown-menu-item.vue";
import DropdownMenuTrigger from "@/components/ui/dropdown-menu-trigger.vue";
import ScrollArea from "@/components/ui/scroll-area.vue";
import { useLuiStore, type Conversation } from "@/stores/lui";

interface ConversationListProps {
  selectedId?: string | null;
}

const props = withDefaults(defineProps<ConversationListProps>(), {
  selectedId: null,
});

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "delete", id: string): void;
  (e: "create", conversation: Conversation): void;
}>();

const luiStore = useLuiStore();

const conversations = computed(() => luiStore.conversations);
const activeId = computed(() => props.selectedId ?? luiStore.selectedId);

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(value: Date) {
  return dateFormatter.format(value);
}

function handleSelect(id: string) {
  luiStore.selectConversation(id);
  emit("select", id);
}

async function handleCreate() {
  const conversation = await luiStore.createConversation();
  emit("create", conversation);
}

function handleDelete(id: string) {
  luiStore.deleteConversation(id);
  emit("delete", id);
}
</script>
