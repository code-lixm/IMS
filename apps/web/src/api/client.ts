/**
 * Unified API client — wraps fetch with protocol-aware request helpers.
 * All API calls should go through this module.
 */

import { SERVER_BASE_URL, type ApiMeta, type ApiResponse } from "@ims/shared";

const DEFAULT_TIMEOUT_MS = 30_000;
const DESKTOP_SERVER_DISCOVERY_TIMEOUT_MS = 1_500;
const DESKTOP_SERVER_BASE_URL_STORAGE_KEY = "ims:serverBaseUrl";
const DESKTOP_SERVER_PORTS = Array.from({ length: 21 }, (_, index) => 9092 + index);

let desktopServerDiscoveryPromise: Promise<string | null> | null = null;

declare global {
  interface Window {
    __IMS_SERVER_BASE_URL?: string;
  }
}

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

export interface JsonRequestOptions extends Omit<BaseRequestOptions, "body"> {
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
  const baseUrl = import.meta.env.DEV ? "" : resolveProductionBaseUrl();
  return path.startsWith("http") ? path : `${baseUrl}${path}`;
}

function resolveProductionBaseUrl(): string {
  if (typeof window === "undefined") {
    return SERVER_BASE_URL;
  }

  const runtimeBaseUrl = window.__IMS_SERVER_BASE_URL || window.localStorage.getItem(DESKTOP_SERVER_BASE_URL_STORAGE_KEY);
  return runtimeBaseUrl || SERVER_BASE_URL;
}

function isRelativeApiPath(path: string): boolean {
  return path.startsWith("/api/");
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("failed to fetch")
      || message.includes("network")
      || message.includes("econnrefused")
      || message.includes("econnreset")
      || message.includes("enotfound")
      || message.includes("timeout");
  }

  return false;
}

function rememberDesktopServerBaseUrl(baseUrl: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.__IMS_SERVER_BASE_URL = baseUrl;
  window.localStorage.setItem(DESKTOP_SERVER_BASE_URL_STORAGE_KEY, baseUrl);
}

async function probeDesktopServerBaseUrl(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DESKTOP_SERVER_DISCOVERY_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }

    const json = await response.json() as { success?: unknown; data?: { service?: unknown; status?: unknown } };
    return json.success === true
      && json.data?.service === "interview-manager"
      && json.data?.status === "ok";
  } catch (_error) {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function discoverDesktopServerBaseUrl(): Promise<string | null> {
  if (import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  if (!desktopServerDiscoveryPromise) {
    desktopServerDiscoveryPromise = (async () => {
      const candidates = [
        window.__IMS_SERVER_BASE_URL,
        window.localStorage.getItem(DESKTOP_SERVER_BASE_URL_STORAGE_KEY),
        SERVER_BASE_URL,
        ...DESKTOP_SERVER_PORTS.map((port) => `http://127.0.0.1:${port}`),
      ].filter((value): value is string => Boolean(value));

      for (const baseUrl of Array.from(new Set(candidates))) {
        if (await probeDesktopServerBaseUrl(baseUrl)) {
          rememberDesktopServerBaseUrl(baseUrl);
          return baseUrl;
        }
      }

      return null;
    })().finally(() => {
      desktopServerDiscoveryPromise = null;
    });
  }

  return desktopServerDiscoveryPromise;
}

async function retryAfterDesktopServerDiscovery<T>(
  path: string,
  error: unknown,
  retry: () => Promise<T>
): Promise<T> {
  if (import.meta.env.DEV || path.startsWith("http") || !isRelativeApiPath(path) || !isNetworkFailure(error)) {
    throw error;
  }

  const discoveredBaseUrl = await discoverDesktopServerBaseUrl();
  if (!discoveredBaseUrl) {
    throw new ApiError("DESKTOP_SERVER_UNAVAILABLE", "本地 IMS 服务未就绪，请稍后重试或重启客户端", 0);
  }

  return retry();
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

async function requestEnvelope<T>(path: string, options: BaseRequestOptions = {}): Promise<T> {
  const { timeoutMs, signal, headers, ...rest } = options;
  const { signal: mergedSignal, cleanup } = mergeSignals(signal, timeoutMs);

  const run = async () => {
    const response = await fetch(resolveUrl(path), {
      ...rest,
      headers,
      signal: mergedSignal,
    });

    const json = await readJsonResponse<T>(response);

    if (isApiFailure(json)) {
      throw new ApiError(json.error.code, json.error.message, response.status, json.meta);
    }

    return json.data;
  };

  try {
    return await run();
  } catch (error) {
    return retryAfterDesktopServerDiscovery(path, error, run);
  } finally {
    cleanup();
  }
}

export async function requestRaw(path: string, options: BaseRequestOptions = {}): Promise<Response> {
  const { timeoutMs, signal, headers, ...rest } = options;
  const { signal: mergedSignal, cleanup } = mergeSignals(signal, timeoutMs);

  const run = async () => {
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
          throw new ApiError(json.error.code, json.error.message, response.status, json.meta);
        }
      }

      throw new ApiError("HTTP_ERROR", response.statusText || "请求失败", response.status);
    }

    return response;
  };

  try {
    return await run();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("REQUEST_ABORTED", "请求已取消或超时", 0);
    }

    return retryAfterDesktopServerDiscovery(path, error, run);
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
