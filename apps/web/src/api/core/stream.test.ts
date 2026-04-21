import { describe, expect, test } from "vitest";
import { consumeLuiMessageStream } from "./stream";

function createStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("consumeLuiMessageStream", () => {
  test("merges cross-chunk text updates and completes state", async () => {
    const updates: string[] = [];
    const response = createStreamResponse([
      'data: {"type":"text-delta","delta":"Hel',
      'lo"}\n\n',
      'data: {"type":"reasoning-delta","delta":"Think"}\n\n',
      'data: {"type":"tool-call","toolName":"search"}\n\n',
      'data: [DONE]\n\n',
    ]);

    const result = await consumeLuiMessageStream(response, {
      onUpdate(state) {
        updates.push(state.content);
      },
    });

    expect(updates).toContain("Hello");
    expect(result.content).toBe("Hello");
    expect(result.reasoning).toBe("Think");
    expect(result.tools).toHaveLength(1);
    expect(result.status).toBe("complete");
  });

  test("throws when stream event json is invalid", async () => {
    const response = createStreamResponse(['data: {oops}\n\n']);
    await expect(consumeLuiMessageStream(response)).rejects.toThrow("流式事件 JSON 解析失败");
  });

  test("does not stop early on finish-step before later text chunks", async () => {
    const updates: Array<{ content: string; status: string }> = [];
    const response = createStreamResponse([
      'data: {"type":"start-step"}\n\n',
      'data: {"type":"finish-step"}\n\n',
      'data: {"type":"text-delta","delta":"后续正文"}\n\n',
      'data: {"type":"finish"}\n\n',
    ]);

    const result = await consumeLuiMessageStream(response, {
      onUpdate(state) {
        updates.push({ content: state.content, status: state.status });
      },
    });

    expect(updates.some((item) => item.content === "后续正文")).toBe(true);
    expect(result.content).toBe("后续正文");
    expect(result.status).toBe("complete");
  });
});
