<template>
  <div class="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      class="pointer-events-auto rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur transition-all"
      :class="toneClassMap[notification.tone]"
      role="status"
      aria-live="polite"
    >
      <div class="flex items-start gap-3">
        <div class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" :class="dotClassMap[notification.tone]" />
        <div class="min-w-0 flex-1">
          <p v-if="notification.title" class="text-sm font-medium">
            {{ notification.title }}
          </p>
          <p class="text-sm text-foreground/90">
            {{ notification.message }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="dismiss(notification.id)"
        >
          <span class="i-lucide-x h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppNotifications, type AppNotificationTone } from "@/composables/use-app-notifications";

const { notifications, dismiss } = useAppNotifications();

const toneClassMap: Record<AppNotificationTone, string> = {
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
</script>
