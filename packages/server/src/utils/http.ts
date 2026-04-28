/**
 * Unified HTTP response helpers for consistent API responses.
 */

function meta() {
  return {
    requestId: `req_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };
}

export function corsHeaders(headers?: HeadersInit): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
    ...headers,
  };
}

export function ok<T>(data: T, extra?: { status?: number }): Response {
  return Response.json(
    { success: true as const, data, error: null, meta: meta() },
    { status: extra?.status ?? 200, headers: corsHeaders() }
  );
}

export function fail(
  code: string,
  message: string,
  status = 400
): Response {
  return Response.json(
    {
      success: false as const,
      data: null,
      error: { code, message },
      meta: meta(),
    },
    { status, headers: corsHeaders() }
  );
}
