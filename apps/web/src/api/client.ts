/**
 * Unified API client — wraps fetch with consistent response parsing.
 * All API calls go through this module.
 */

import { SERVER_BASE_URL } from "@ims/shared";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
  meta: { requestId: string; timestamp: string };
}

interface ApiFailure {
  success: false;
  data: null;
  error: { code: string; message: string };
  meta: { requestId: string; timestamp: string };
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = import.meta.env.DEV ? "" : SERVER_BASE_URL;
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const json: ApiResponse<T> = await res.json();

  if (!json.success) {
    throw new ApiError(
      json.error.code,
      json.error.message,
      res.status
    );
  }

  return json.data;
}

export async function apiNoBody<T>(path: string): Promise<T> {
  return api<T>(path);
}
