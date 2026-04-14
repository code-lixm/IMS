import type {
  WorkspaceAgentConfigDocument,
  WorkspaceAgentConfigObject,
  WorkspaceAgentConfigScalar,
  WorkspaceAgentConfigValue,
  WorkspaceAgentLoadError,
} from "@ims/shared";

interface YamlLine {
  lineNumber: number;
  indent: number;
  content: string;
}

interface YamlObjectFrame {
  type: "object";
  indent: number;
  key: string | null;
  value: WorkspaceAgentConfigObject;
}

interface YamlArrayFrame {
  type: "array";
  indent: number;
  key: string;
  value: WorkspaceAgentConfigValue[];
}

type YamlFrame = YamlObjectFrame | YamlArrayFrame;

interface ParseYamlSuccess {
  ok: true;
  value: WorkspaceAgentConfigDocument;
}

interface ParseYamlFailure {
  ok: false;
  error: WorkspaceAgentLoadError;
}

export type ParseWorkspaceAgentYamlResult = ParseYamlSuccess | ParseYamlFailure;

function createYamlError(path: string, lineNumber: number, message: string, details?: string): WorkspaceAgentLoadError {
  return {
    code: "AGENT_CONFIG_INVALID",
    path,
    message: `agent.yaml 第 ${lineNumber} 行解析失败：${message}`,
    ...(details ? { details } : {}),
  };
}

function normalizeYamlLines(content: string): YamlLine[] {
  const rawLines = content.replace(/\r\n/g, "\n").split("\n");
  const lines: YamlLine[] = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index] ?? "";
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = rawLine.match(/^(\s*)/);
    const indent = match?.[1]?.length ?? 0;
    lines.push({
      lineNumber: index + 1,
      indent,
      content: rawLine.slice(indent),
    });
  }

  return lines;
}

function stripInlineComment(value: string): string {
  let result = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = index > 0 ? value[index - 1] : "";
    if ((char === '"' || char === "'") && previous !== "\\") {
      if (quote === char) {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
    }

    if (char === "#" && !quote) {
      break;
    }

    result += char;
  }

  return result.trimEnd();
}

function parseQuotedString(value: string): string {
  const quote = value[0];
  const body = value.slice(1, -1);
  if (quote === '"') {
    return body
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return body.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

function parseScalar(value: string): WorkspaceAgentConfigScalar {
  const normalized = stripInlineComment(value).trim();

  if (normalized === "null" || normalized === "~") {
    return null;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    return parseQuotedString(normalized);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
}

function assignObjectValue(frame: YamlObjectFrame, key: string, value: WorkspaceAgentConfigValue) {
  frame.value[key] = value;
}

function getObjectFrame(stack: YamlFrame[], path: string, lineNumber: number): YamlObjectFrame {
  const top = stack[stack.length - 1];
  if (!top || top.type !== "object") {
    throw createYamlError(path, lineNumber, "数组项不能直接声明对象字段");
  }
  return top;
}

export function parseWorkspaceAgentYaml(content: string, path: string): ParseWorkspaceAgentYamlResult {
  const lines = normalizeYamlLines(content);
  const root: YamlObjectFrame = { type: "object", indent: -1, key: null, value: {} };
  const stack: YamlFrame[] = [root];

  try {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const nextLine = lines[index + 1] ?? null;
      const trimmed = line.content.trim();

      while (stack.length > 1 && line.indent <= stack[stack.length - 1]!.indent) {
        stack.pop();
      }

      if (trimmed.startsWith("- ")) {
        const parent = stack[stack.length - 1];
        if (!parent || parent.type !== "array") {
          throw createYamlError(path, line.lineNumber, "数组项缺少上级数组字段");
        }

        const itemText = trimmed.slice(2).trim();
        if (!itemText) {
          throw createYamlError(path, line.lineNumber, "暂不支持空数组对象项", "请改为 `- value` 标量数组或显式对象字段");
        }

        if (itemText.includes(":")) {
          throw createYamlError(path, line.lineNumber, "暂不支持对象数组", "当前仅支持标量数组，例如 tools:\n  - scan_resume");
        }

        parent.value.push(parseScalar(itemText));
        continue;
      }

      const separatorIndex = trimmed.indexOf(":");
      if (separatorIndex <= 0) {
        throw createYamlError(path, line.lineNumber, "缺少 `key: value` 结构");
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const objectFrame = getObjectFrame(stack, path, line.lineNumber);

      if (!rawValue) {
        if (nextLine && nextLine.indent > line.indent && nextLine.content.trim().startsWith("- ")) {
          const arrayFrame: YamlArrayFrame = { type: "array", indent: line.indent, key, value: [] };
          assignObjectValue(objectFrame, key, arrayFrame.value as WorkspaceAgentConfigScalar[]);
          stack.push(arrayFrame);
          continue;
        }

        const nextObjectFrame: YamlObjectFrame = { type: "object", indent: line.indent, key, value: {} };
        assignObjectValue(objectFrame, key, nextObjectFrame.value);
        stack.push(nextObjectFrame);
        continue;
      }

      if (rawValue === "|" || rawValue === ">") {
        throw createYamlError(path, line.lineNumber, "暂不支持多行块字符串", "请改用 agent.md 承载长文本说明");
      }

      assignObjectValue(objectFrame, key, parseScalar(rawValue));
    }
  } catch (error) {
    if (typeof error === "object" && error && "code" in error) {
      return { ok: false, error: error as WorkspaceAgentLoadError };
    }

    return {
      ok: false,
      error: {
        code: "AGENT_CONFIG_INVALID",
        path,
        message: "agent.yaml 解析失败",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }

  return {
    ok: true,
    value: root.value as WorkspaceAgentConfigDocument,
  };
}
