import type { ApiResponse } from "../types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function meta() {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString()
  };
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    error: null,
    meta: meta()
  };

  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

export function fail(code: string, message: string, status = 400): Response {
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: { code, message },
    meta: meta()
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    }
  });
}

export function options(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}
