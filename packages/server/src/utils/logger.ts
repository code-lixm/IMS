type LogLevel = "debug" | "info" | "warn" | "error";

type LogField = string | number | boolean | null | undefined | LogField[] | { [key: string]: LogField };

type LogFields = Record<string, LogField>;

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|api[-_]?key|smtp[-_]?pass|m[-_]?token)/i;
const PATH_LIKE_PATTERN = /(?:[A-Za-z]:\\|\/Users\/|\/home\/|\/var\/|\/tmp\/|\\Users\\)[^\s"']+/g;
const ENABLE_STACK_LOGS = process.env.IMS_LOG_STACK === "1";

function nowIso() {
  return new Date().toISOString();
}

function sanitizeString(value: string): string {
  return value.replace(PATH_LIKE_PATTERN, "[path-redacted]");
}

function normalizeField(value: LogField, key = ""): LogField {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    if (typeof value === "boolean" || typeof value === "number") {
      return value;
    }
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeField(item, key));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, normalizeField(entryValue, entryKey)]),
    );
  }
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  return value;
}

export function resolveRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (incoming && REQUEST_ID_PATTERN.test(incoming)) {
    return incoming;
  }
  return `req_${crypto.randomUUID()}`;
}

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };
    const code = typeof errorWithCode.code === "string"
      ? errorWithCode.code
      : undefined;
    const serialized: LogFields = {
      name: error.name,
      message: sanitizeString(error.message),
      code,
    };

    if (ENABLE_STACK_LOGS && error.stack) {
      serialized.stack = sanitizeString(error.stack);
    }

    return serialized;
  }

  return { message: sanitizeString(String(error)) };
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const entry = {
    ts: nowIso(),
    level,
    source: "server",
    event,
    ...Object.fromEntries(
      Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, normalizeField(value, key)]),
    ),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function logInfo(event: string, fields?: LogFields) {
  logEvent("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields) {
  logEvent("warn", event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}) {
  logEvent("error", event, {
    ...fields,
    error: serializeError(error),
  });
}
