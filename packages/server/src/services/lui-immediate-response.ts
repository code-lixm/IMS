export function createImmediateLuiTextStreamResponse(content: string): Response {
  const encoder = new TextEncoder();
  const payloads = [
    `data: ${JSON.stringify({ type: 'text', text: content })}\n\n`,
    `data: ${JSON.stringify({ type: 'finish' })}\n\n`,
    'data: [DONE]\n\n',
  ];

  return new Response(new ReadableStream({
    start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(payload));
      }
      controller.close();
    },
  }), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
