import { readonly, ref } from "vue";
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
}

interface NotifyOptions {
  title?: string;
  tone?: AppNotificationTone;
  durationMs?: number;
}

interface NotifyErrorOptions {
  title?: string;
  fallbackMessage?: string;
  durationMs?: number;
}

const DEFAULT_DURATION_MS = 4000;

const notifications = ref<AppNotification[]>([]);
const dismissTimers = new Map<string, number>();

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

export function useAppNotifications() {
  return {
    notifications: readonly(notifications),
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
  };
}
