import { ApiError } from "../client";

export interface LuiStreamMessageState {
  content: string;
  reasoning: string | null;
  tools: unknown[] | null;
  status: "streaming" | "complete";
}

export interface LuiStreamCallbacks {
  onUpdate?: (state: LuiStreamMessageState) => void;
  onComplete?: (state: LuiStreamMessageState) => void;
  onError?: (error: Error) => void;
}

interface StreamChunk {
  type: string;
  id?: string;
  messageId?: string;
  delta?: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
}

function cloneState(state: LuiStreamMessageState): LuiStreamMessageState {
  return {
    content: state.content,
    reasoning: state.reasoning,
    tools: state.tools ? [...state.tools] : null,
    status: state.status,
  };
}

function appendChunk(state: LuiStreamMessageState, chunk: StreamChunk): LuiStreamMessageState {
  const nextState = cloneState(state);

  switch (chunk.type) {
    case "text-delta":
      nextState.content += typeof chunk.delta === "string" ? chunk.delta : "";
      break;
    case "reasoning-delta":
      nextState.reasoning = `${nextState.reasoning ?? ""}${typeof chunk.delta === "string" ? chunk.delta : ""}` || null;
      break;
    case "reasoning":
      nextState.reasoning = `${nextState.reasoning ?? ""}${typeof chunk.text === "string" ? chunk.text : ""}` || null;
      break;
    case "tool-call":
    case "tool-result":
    case "tool-input-start":
    case "tool-input-delta":
    case "source-url":
    case "source-document":
      nextState.tools = [...(nextState.tools ?? []), chunk];
      break;
    default:
      break;
  }

  return nextState;
}

function splitSseEvents(buffer: string): { events: string[]; remaining: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remaining = parts.pop() ?? "";
  return {
    events: parts,
    remaining,
  };
}

function parseSseEvent(eventBlock: string): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  const dataLines: string[] = [];

  for (const rawLine of eventBlock.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return chunks;
  }

  const payload = dataLines.join("\n");
  if (payload === "[DONE]") {
    return [{ type: "done" }];
  }

  try {
    const parsed = JSON.parse(payload) as StreamChunk;
    chunks.push(parsed);
  } catch (_error) {
    chunks.push({ type: "error", errorText: "流式事件 JSON 解析失败", raw: payload });
  }

  return chunks;
}

export async function consumeLuiMessageStream(
  response: Response,
  callbacks: LuiStreamCallbacks = {}
): Promise<LuiStreamMessageState> {
  if (!response.body) {
    const error = new ApiError("EMPTY_STREAM", "流式响应没有可读取的内容", response.status);
    callbacks.onError?.(error);
    throw error;
  }

  let latestState: LuiStreamMessageState = {
    content: "",
    reasoning: null,
    tools: null,
    status: "streaming",
  };

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = splitSseEvents(buffer);
      buffer = remaining;

      for (const eventBlock of events) {
        const chunks = parseSseEvent(eventBlock);

        for (const chunk of chunks) {
          if (chunk.type === "done") {
            continue;
          }

          if (chunk.type === "error") {
            const error = new Error(
              typeof chunk.errorText === "string" ? chunk.errorText : "流式消息返回错误事件"
            );
            callbacks.onError?.(error);
            throw error;
          }

          latestState = appendChunk(latestState, chunk);
          callbacks.onUpdate?.(cloneState(latestState));
        }
      }
    }

    const tail = decoder.decode();
    if (tail) {
      buffer += tail;
      const { events } = splitSseEvents(`${buffer}\n\n`);
      for (const eventBlock of events) {
        const chunks = parseSseEvent(eventBlock);
        for (const chunk of chunks) {
          if (chunk.type === "error") {
            const error = new Error(
              typeof chunk.errorText === "string" ? chunk.errorText : "流式消息返回错误事件"
            );
            callbacks.onError?.(error);
            throw error;
          }

          if (chunk.type !== "done") {
            latestState = appendChunk(latestState, chunk);
            callbacks.onUpdate?.(cloneState(latestState));
          }
        }
      }
    }

    latestState = {
      ...latestState,
      status: "complete",
    };
    callbacks.onComplete?.(cloneState(latestState));
    return latestState;
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error("解析流式消息失败");
    callbacks.onError?.(normalizedError);
    throw normalizedError;
  }
}
