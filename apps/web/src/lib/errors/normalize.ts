import { ApiError } from "@/api/client";

export interface AppErrorDetails {
  title: string;
  message: string;
  code?: string;
  status?: number;
  cause?: unknown;
}

interface NormalizeAppErrorOptions {
  title?: string;
  fallbackMessage?: string;
}

const DEFAULT_FALLBACK_MESSAGE = "请稍后重试";

export function normalizeAppError(
  error: unknown,
  options: NormalizeAppErrorOptions = {},
): AppErrorDetails {
  const title = options.title ?? "操作失败";
  const fallbackMessage = options.fallbackMessage ?? DEFAULT_FALLBACK_MESSAGE;

  if (error instanceof ApiError) {
    return {
      title,
      message: error.message || fallbackMessage,
      code: error.code,
      status: error.status,
      cause: error,
    };
  }

  if (error instanceof Error) {
    return {
      title,
      message: error.message || fallbackMessage,
      cause: error,
    };
  }

  if (typeof error === "string" && error.trim()) {
    return {
      title,
      message: error,
      cause: error,
    };
  }

  return {
    title,
    message: fallbackMessage,
    cause: error,
  };
}

export function reportAppError(
  scope: string,
  error: unknown,
  options: NormalizeAppErrorOptions = {},
): AppErrorDetails {
  const normalized = normalizeAppError(error, options);
  console.error(`[${scope}]`, error);
  return normalized;
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
