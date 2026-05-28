import { computed, readonly, ref } from "vue";
import {
  normalizeAppError,
  type AppErrorDetails,
} from "@/lib/errors/normalize";

export type AppNotificationTone = "success" | "error" | "info" | "warning";

export interface AppNotification {
  id: string;
  tone: AppNotificationTone;
  title?: string;
  message: string;
  durationMs: number;
  dismissible: boolean;
  timestamp: number;
  read: boolean;
}

export interface ToastToneConfig {
  bg: string;
  text: string;
  border: string;
  icon: string;
}

/** Tone color mapping per design toast spec (M1pa1p node).
 * success=green, info=blue, warning=amber, error=red */
export const TONE_COLORS: Record<AppNotificationTone, ToastToneConfig> = {
  success: {
    bg: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-900/70",
    icon: "i-lucide-check-circle",
  },
  info: {
    bg: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900/70",
    icon: "i-lucide-info",
  },
  warning: {
    bg: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-900/70",
    icon: "i-lucide-alert-triangle",
  },
  error: {
    bg: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-900/70",
    icon: "i-lucide-x-circle",
  },
};

interface NotifyOptions {
  title?: string;
  tone?: AppNotificationTone;
  durationMs?: number;
  dismissible?: boolean;
}

interface NotifyErrorOptions {
  title?: string;
  fallbackMessage?: string;
  durationMs?: number;
}

const DEFAULT_DURATION_MS = 4000;

const notifications = ref<AppNotification[]>([]);
const dismissTimers = new Map<string, number>();

const unreadCount = computed(() =>
  notifications.value.filter((n) => !n.read).length,
);

function dismiss(id: string) {
  notifications.value = notifications.value.filter(
    (notification) => notification.id !== id,
  );

  const timer = dismissTimers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    dismissTimers.delete(id);
  }
}

function scheduleDismiss(id: string, durationMs: number) {
  const existing = dismissTimers.get(id);
  if (existing !== undefined) {
    window.clearTimeout(existing);
  }

  const timer = window.setTimeout(() => {
    dismiss(id);
  }, durationMs);

  dismissTimers.set(id, timer);
}

function notify(message: string, options: NotifyOptions = {}): string {
  const id = `notification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;

  notifications.value = [
    ...notifications.value,
    {
      id,
      tone: options.tone ?? "info",
      title: options.title,
      message,
      durationMs,
      dismissible: options.dismissible ?? true,
      timestamp: Date.now(),
      read: false,
    },
  ];

  scheduleDismiss(id, durationMs);
  return id;
}

function notifyError(
  error: unknown,
  options: NotifyErrorOptions = {},
): AppErrorDetails {
  const normalized = normalizeAppError(error, options);
  notify(normalized.message, {
    title: normalized.title,
    tone: "error",
    durationMs: options.durationMs,
  });
  return normalized;
}

function clear() {
  for (const timer of dismissTimers.values()) {
    window.clearTimeout(timer);
  }
  dismissTimers.clear();
  notifications.value = [];
}

function markRead(id: string) {
  const notification = notifications.value.find((n) => n.id === id);
  if (notification) {
    notification.read = true;
  }
}

function markAllRead() {
  notifications.value.forEach((n) => {
    n.read = true;
  });
}

export function useAppNotifications() {
  return {
    notifications: readonly(notifications),
    unreadCount,
    notify,
    notifySuccess(message: string, options: Omit<NotifyOptions, "tone"> = {}) {
      return notify(message, { ...options, tone: "success" });
    },
    notifyInfo(message: string, options: Omit<NotifyOptions, "tone"> = {}) {
      return notify(message, { ...options, tone: "info" });
    },
    notifyWarning(message: string, options: Omit<NotifyOptions, "tone"> = {}) {
      return notify(message, { ...options, tone: "warning" });
    },
    notifyError,
    dismiss,
    clear,
    markRead,
    markAllRead,
  };
}
