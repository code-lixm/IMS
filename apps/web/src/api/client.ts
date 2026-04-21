/**
 * Unified API client — wraps fetch with protocol-aware request helpers.
 * All API calls should go through this module.
 */

import { SERVER_BASE_URL, type ApiMeta, type ApiResponse } from "@ims/shared";

const DEFAULT_TIMEOUT_MS = 30_000;
const AUTH_REDIRECT_ERROR_CODES = new Set(["AUTH_EXPIRED", "AUTH_INVALID", "AUTH_REQUIRED"]);

let unauthorizedRedirectInFlight = false;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly meta?: ApiMeta
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface BaseRequestOptions extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface JsonRequestOptions extends Omit<BaseRequestOptions, "body"> {
  json?: unknown;
}

interface FormRequestOptions extends Omit<BaseRequestOptions, "body"> {
  formData: FormData;
}

interface TextRequestOptions extends BaseRequestOptions {
  body?: BodyInit | null;
}

interface StreamRequestOptions extends Omit<BaseRequestOptions, "body"> {
  body?: BodyInit | null;
  json?: unknown;
}

function resolveUrl(path: string): string {
  const baseUrl = import.meta.env.DEV ? "" : SERVER_BASE_URL;
  return path.startsWith("http") ? path : `${baseUrl}${path}`;
}

function createHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers);
}

function mergeSignals(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  const timeoutController = new AbortController();
  const mergedController = new AbortController();

  const abortMerged = () => mergedController.abort();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      mergedController.abort();
    } else {
      signal.addEventListener("abort", abortMerged, { once: true });
    }
  }

  if (timeoutController.signal.aborted) {
    mergedController.abort();
  } else {
    timeoutController.signal.addEventListener("abort", abortMerged, { once: true });
  }

  return {
    signal: mergedController.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortMerged);
      }
      timeoutController.signal.removeEventListener("abort", abortMerged);
    },
  };
}

async function readJsonResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch (_error) {
    throw new ApiError(
      "INVALID_JSON_RESPONSE",
      "服务器返回了无法解析的 JSON 响应",
      response.status
    );
  }
}

function isApiFailure<T>(json: ApiResponse<T>): json is Extract<ApiResponse<T>, { success: false }> {
  return json.success === false;
}

function redirectToLoginOnUnauthorized(): void {
  if (typeof window === "undefined" || unauthorizedRedirectInFlight) {
    return;
  }

  const { pathname, search, hash } = window.location;
  if (pathname === "/login") {
    return;
  }

  unauthorizedRedirectInFlight = true;
  const redirect = `${pathname}${search}${hash}` || "/candidates";
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}&reauth=1`);
}

function shouldRedirectOnUnauthorized(path: string, errorCode?: string): boolean {
  if (path.startsWith("/api/auth/")) {
    return false;
  }

  return Boolean(errorCode && AUTH_REDIRECT_ERROR_CODES.has(errorCode));
}

async function requestEnvelope<T>(path: string, options: BaseRequestOptions = {}): Promise<T> {
  const { timeoutMs, signal, headers, ...rest } = options;
  const { signal: mergedSignal, cleanup } = mergeSignals(signal, timeoutMs);

  try {
    const response = await fetch(resolveUrl(path), {
      ...rest,
      headers,
      signal: mergedSignal,
    });

    const json = await readJsonResponse<T>(response);

    if (isApiFailure(json)) {
      if (response.status === 401 && shouldRedirectOnUnauthorized(path, json.error.code)) {
        redirectToLoginOnUnauthorized();
      }
      throw new ApiError(json.error.code, json.error.message, response.status, json.meta);
    }

    return json.data;
  } finally {
    cleanup();
  }
}

export async function requestRaw(path: string, options: BaseRequestOptions = {}): Promise<Response> {
  const { timeoutMs, signal, headers, ...rest } = options;
  const { signal: mergedSignal, cleanup } = mergeSignals(signal, timeoutMs);

  try {
    const response = await fetch(resolveUrl(path), {
      ...rest,
      headers,
      signal: mergedSignal,
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await readJsonResponse<unknown>(response);
        if (isApiFailure(json)) {
          if (response.status === 401 && shouldRedirectOnUnauthorized(path, json.error.code)) {
            redirectToLoginOnUnauthorized();
          }
          throw new ApiError(json.error.code, json.error.message, response.status, json.meta);
        }
      }

      throw new ApiError("HTTP_ERROR", response.statusText || "请求失败", response.status);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("REQUEST_ABORTED", "请求已取消或超时", 0);
    }

    throw error;
  } finally {
    cleanup();
  }
}

export async function requestJson<T>(
  path: string,
  options: JsonRequestOptions = {}
): Promise<T> {
  const { json, headers, ...rest } = options;
  const resolvedHeaders = createHeaders(headers);

  if (json !== undefined && !resolvedHeaders.has("Content-Type")) {
    resolvedHeaders.set("Content-Type", "application/json");
  }

  return requestEnvelope<T>(path, {
    ...rest,
    headers: resolvedHeaders,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

export async function requestForm<T>(
  path: string,
  options: FormRequestOptions
): Promise<T> {
  const { formData, headers, ...rest } = options;
  const resolvedHeaders = createHeaders(headers);
  resolvedHeaders.delete("Content-Type");

  return requestEnvelope<T>(path, {
    ...rest,
    headers: resolvedHeaders,
    body: formData,
  });
}

export async function requestText(
  path: string,
  options: TextRequestOptions = {}
): Promise<string> {
  const response = await requestRaw(path, options);
  return response.text();
}

export async function requestStream(
  path: string,
  options: StreamRequestOptions = {}
): Promise<Response> {
  const { json, headers, ...rest } = options;
  const resolvedHeaders = createHeaders(headers);

  if (json !== undefined && !resolvedHeaders.has("Content-Type")) {
    resolvedHeaders.set("Content-Type", "application/json");
  }

  return requestRaw(path, {
    ...rest,
    headers: resolvedHeaders,
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
}

export async function api<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  return requestJson<T>(path, options);
}

export async function apiNoBody<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}
