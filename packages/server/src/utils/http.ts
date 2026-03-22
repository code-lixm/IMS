/**
 * Unified HTTP response helpers for consistent API responses.
 */

function meta() {
  return {
    requestId: `req_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };
}

export function ok<T>(data: T, extra?: { status?: number }): Response {
  return Response.json(
    { success: true as const, data, error: null, meta: meta() },
    { status: extra?.status ?? 200 }
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
    { status }
  );
}
