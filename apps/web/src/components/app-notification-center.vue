<template>
  <!-- Toast notifications (always visible, floating overlay) -->
  <div class="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col items-end gap-2.5">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      class="pointer-events-auto w-full rounded-[14px] border bg-white/96 px-3.5 py-3 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.22)] backdrop-blur transition-all dark:bg-background/95"
      :class="toneBorderMap[notification.tone]"
      role="status"
      aria-live="polite"
    >
      <div class="flex items-start gap-3">
        <div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-50 dark:bg-white/10">
          <div class="h-2.5 w-2.5 rounded-full" :class="dotClassMap[notification.tone]" />
        </div>
        <div class="min-w-0 flex-1">
          <p v-if="notification.title" class="text-[13px] font-semibold leading-5 text-[#1A1A1A] dark:text-foreground">
            {{ notification.title }}
          </p>
          <p class="text-[13px] leading-5 text-[#4B5563] dark:text-foreground/90">
            {{ notification.message }}
          </p>
        </div>
        <button
          v-if="notification.dismissible"
          type="button"
          class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="dismiss(notification.id)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>

  <!-- Notification center panel -->
  <Transition name="panel-slide">
    <div
      v-if="showCenter"
      class="fixed inset-y-0 right-0 z-[110] flex w-full max-w-sm flex-col border-l border-border bg-background shadow-2xl"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 class="text-base font-semibold">通知中心</h2>
        <div class="flex items-center gap-1">
          <Button
            v-if="unreadCount > 0"
            variant="ghost"
            size="sm"
            class="h-8 text-xs"
            @click="markAllRead"
          >
            <Check class="mr-1 h-3.5 w-3.5" />
            全部已读
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            @click="$emit('update:showCenter', false)"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Body -->
      <ScrollArea class="flex-1">
        <!-- Notification list -->
        <div v-if="sortedNotifications.length > 0" class="divide-y divide-border">
          <div
            v-for="notification in sortedNotifications"
            :key="notification.id"
            class="group relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
            :class="{ 'bg-muted/20': !notification.read }"
            @click="markRead(notification.id)"
          >
            <!-- Tone icon -->
            <div
              class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              :class="iconBgMap[notification.tone]"
            >
              <component :is="toneIconMap[notification.tone]" class="h-4 w-4 text-white" />
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <p
                  class="text-sm font-medium truncate"
                  :class="{ 'text-foreground': !notification.read, 'text-muted-foreground': notification.read }"
                >
                  {{ notification.title || notification.message }}
                </p>
                <!-- Read/unread dot -->
                <div
                  v-if="!notification.read"
                  class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  :class="dotClassMap[notification.tone]"
                />
              </div>
              <p
                v-if="notification.title"
                class="mt-0.5 text-xs leading-relaxed"
                :class="notification.read ? 'text-muted-foreground/70' : 'text-muted-foreground'"
              >
                {{ notification.message }}
              </p>
              <div class="mt-1 flex items-center gap-2">
                <span class="text-[11px] text-muted-foreground/60">{{ formatRelativeTime(notification.timestamp) }}</span>
                <button
                  v-if="notification.dismissible"
                  type="button"
                  class="ml-auto rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  @click.stop="dismiss(notification.id)"
                >
                  <X class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div class="mb-4 rounded-full bg-muted p-4">
            <BellOff class="h-8 w-8 text-muted-foreground" />
          </div>
          <p class="text-base font-medium text-foreground">暂无通知</p>
          <p class="mt-1 text-sm text-muted-foreground">所有通知已读</p>
        </div>
      </ScrollArea>

      <!-- Footer -->
      <div class="border-t border-border px-4 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          class="w-full text-xs text-muted-foreground"
          :disabled="sortedNotifications.length === 0"
          @click="clear"
        >
          清除所有通知
        </Button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  AlertTriangle,
  BellOff,
  Check,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-vue-next";
import type { Component } from "vue";
import {
  useAppNotifications,
  type AppNotificationTone,
} from "@/composables/use-app-notifications";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
  showCenter?: boolean;
}>();

defineEmits<{
  (e: "update:showCenter", value: boolean): void;
}>();

const {
  notifications,
  unreadCount,
  dismiss,
  clear,
  markRead,
  markAllRead,
} = useAppNotifications();

const sortedNotifications = computed(() => {
  return [...notifications.value].sort((a, b) => b.timestamp - a.timestamp);
});

const toneBorderMap: Record<AppNotificationTone, string> = {
  success: "border-emerald-200 dark:border-emerald-900/70",
  error: "border-destructive/30 dark:border-destructive/50",
  info: "border-border",
  warning: "border-amber-200 dark:border-amber-900/70",
};

const dotClassMap: Record<AppNotificationTone, string> = {
  success: "bg-emerald-500",
  error: "bg-destructive",
  info: "bg-primary",
  warning: "bg-amber-500",
};

const iconBgMap: Record<AppNotificationTone, string> = {
  success: "bg-emerald-500",
  error: "bg-red-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
};

const toneIconMap: Record<AppNotificationTone, Component> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<style scoped>
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.panel-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
