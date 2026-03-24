import { afterEach, describe, expect, test } from "bun:test";
import { ApiError, requestForm, requestJson } from "./client";

const originalFetch = globalThis.fetch;

function mockFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return implementation as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("requestJson", () => {
  test("serializes json body and returns envelope data", async () => {
    let request: RequestInit | undefined;

    globalThis.fetch = mockFetch(async (_input, init) => {
      request = init;
      return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await requestJson<{ ok: boolean }>("/api/test", {
      method: "POST",
      json: { hello: "world" },
    });

    expect(result).toEqual({ ok: true });
    expect(request?.body).toBe(JSON.stringify({ hello: "world" }));
    expect(new Headers(request?.headers).get("Content-Type")).toBe("application/json");
  });

  test("maps api failure to ApiError", async () => {
    globalThis.fetch = mockFetch(async () => new Response(JSON.stringify({
      success: false,
      error: { code: "BAD_THING", message: "boom" },
      meta: { requestId: "req_1", timestamp: Date.now() },
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }));

    await expect(requestJson("/api/test")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("requestForm", () => {
  test("removes content-type so browser can send multipart boundary", async () => {
    let headers: Headers | undefined;

    globalThis.fetch = mockFetch(async (_input, init) => {
      headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ success: true, data: { uploaded: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const formData = new FormData();
    formData.append("file", new Blob(["hello"]), "hello.txt");

    await requestForm<{ uploaded: boolean }>("/api/upload", {
      method: "POST",
      formData,
      headers: { "Content-Type": "application/json" },
    });

    expect(headers?.has("Content-Type")).toBe(false);
  });
});
