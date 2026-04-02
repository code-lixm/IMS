/**
 * Agent File Operations Tools
 *
 * Provides secure file operations for the Agent system.
 * All operations are restricted to the runtime/agents/ directory.
 *
 * Tools: readFile, writeFile, listFiles, deleteFile
 */

import { mkdir, writeFile, readFile, readdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { tool } from "ai";

// ============================================================================
// Constants
// ============================================================================

/** Base directory for all agent file operations */
const AGENTS_BASE_DIR = "runtime/agents";

/** Maximum file size: 1MB */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Validates and resolves a file path to ensure it stays within AGENTS_BASE_DIR
 *
 * @param filePath - Relative or absolute file path
 * @returns Resolved absolute path within AGENTS_BASE_DIR
 * @throws Error if path traversal attempt detected or path is invalid
 */
function validatePath(filePath: string): string {
  // Normalize the path to resolve any ../ or ./ segments
  const normalized = path.normalize(filePath);

  // If absolute path provided, use it directly (for safety in local dev)
  let targetPath: string;
  if (path.isAbsolute(normalized)) {
    targetPath = normalized;
  } else {
    // Join with base directory
    targetPath = path.join(process.cwd(), AGENTS_BASE_DIR, normalized);
  }

  // Normalize again after joining
  targetPath = path.normalize(targetPath);

  // Get the resolved base directory
  const baseDir = path.normalize(path.join(process.cwd(), AGENTS_BASE_DIR));

  // Security check: ensure the resolved path starts with base directory
  // This prevents directory traversal attacks like ../../../etc/passwd
  if (!targetPath.startsWith(baseDir)) {
    throw new Error(
      `Security Error: Path traversal attempt detected. ` +
      `Requested path '${filePath}' resolves outside allowed directory. ` +
      `All operations must be within '${AGENTS_BASE_DIR}/'`
    );
  }

  return targetPath;
}

/**
 * Checks if a path exists and is a file
 */
async function isFile(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Checks if a path exists and is a directory
 */
async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// ============================================================================
// Tool Definitions (Vercel AI SDK format with Zod schemas)
// ============================================================================

/**
 * Tool: Read text file content
 */
export const readFileTool = () => tool({
  description: "Read the content of a text file from the agent workspace. " +
    "Only files within runtime/agents/ directory are accessible.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative or absolute path to the file"),
  }),
  execute: async ({ filePath }) => {
    return executeReadFile({ filePath });
  },
});

/**
 * Tool: Write content to a text file
 */
export const writeFileTool = () => tool({
  description: "Write content to a text file in the agent workspace. " +
    "Creates parent directories if needed. Only writes within runtime/agents/ directory.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative or absolute path to the file"),
    content: z.string().describe("Content to write to the file"),
  }),
  execute: async ({ filePath, content }) => {
    return executeWriteFile({ filePath, content });
  },
});

/**
 * Tool: List files in a directory
 */
export const listFilesTool = () => tool({
  description: "List files and directories within a directory in the agent workspace. " +
    "Only lists contents within runtime/agents/ directory.",
  inputSchema: z.object({
    directoryPath: z.string()
      .optional()
      .describe("Relative or absolute path to directory. Defaults to root (runtime/agents/)"),
    recursive: z.boolean()
      .optional()
      .default(false)
      .describe("Whether to list subdirectories recursively"),
  }),
  execute: async ({ directoryPath, recursive }) => {
    return executeListFiles({ directoryPath, recursive });
  },
});

/**
 * Tool: Delete a file
 */
export const deleteFileTool = () => tool({
  description: "Delete a file from the agent workspace. " +
    "Only files within runtime/agents/ directory can be deleted.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative or absolute path to the file to delete"),
  }),
  execute: async ({ filePath }) => {
    return executeDeleteFile({ filePath });
  },
});

// ============================================================================
// Tool Execution Implementations
// ============================================================================

/**
 * Execute: Read file
 */
async function executeReadFile(args: { filePath: string }): Promise<string> {
  try {
    const resolvedPath = validatePath(args.filePath);

    // Check if file exists
    if (!await isFile(resolvedPath)) {
      return JSON.stringify({
        ok: false,
        error: "File not found",
        file_path: resolvedPath,
        message: `The file '${args.filePath}' does not exist or is not a file`,
      }, null, 2);
    }

    // Check file size
    const stats = await stat(resolvedPath);
    if (stats.size > MAX_FILE_SIZE) {
      return JSON.stringify({
        ok: false,
        error: "File too large",
        file_path: resolvedPath,
        file_size: stats.size,
        max_size: MAX_FILE_SIZE,
        message: `File size (${stats.size} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`,
      }, null, 2);
    }

    // Read file content
    const content = await readFile(resolvedPath, "utf-8");

    return JSON.stringify({
      ok: true,
      file_path: resolvedPath,
      file_name: path.basename(resolvedPath),
      file_size: stats.size,
      content: content,
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      ok: false,
      error: "Read failed",
      file_path: args.filePath,
      message: errorMessage,
    }, null, 2);
  }
}

/**
 * Execute: Write file
 */
async function executeWriteFile(args: { filePath: string; content: string }): Promise<string> {
  try {
    const resolvedPath = validatePath(args.filePath);

    // Check content size
    const contentSize = Buffer.byteLength(args.content, "utf-8");
    if (contentSize > MAX_FILE_SIZE) {
      return JSON.stringify({
        ok: false,
        error: "Content too large",
        file_path: resolvedPath,
        content_size: contentSize,
        max_size: MAX_FILE_SIZE,
        message: `Content size (${contentSize} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`,
      }, null, 2);
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(resolvedPath);
    await mkdir(parentDir, { recursive: true });

    // Write file
    await writeFile(resolvedPath, args.content, "utf-8");

    // Get file stats
    const stats = await stat(resolvedPath);

    return JSON.stringify({
      ok: true,
      file_path: resolvedPath,
      file_name: path.basename(resolvedPath),
      file_size: stats.size,
      content_size: contentSize,
      message: `Successfully wrote ${stats.size} bytes to ${resolvedPath}`,
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      ok: false,
      error: "Write failed",
      file_path: args.filePath,
      message: errorMessage,
    }, null, 2);
  }
}

/**
 * Execute: List files
 */
async function executeListFiles(args: { directoryPath?: string; recursive?: boolean }): Promise<string> {
  try {
    const dirPath = args.directoryPath ?? "";
    const resolvedPath = validatePath(dirPath);

    // Check if directory exists
    if (!await isDirectory(resolvedPath)) {
      return JSON.stringify({
        ok: false,
        error: "Directory not found",
        directory_path: resolvedPath,
        message: `The directory '${dirPath || AGENTS_BASE_DIR}' does not exist or is not a directory`,
      }, null, 2);
    }

    // List directory contents
    const entries = await readdir(resolvedPath, { recursive: false, withFileTypes: true });

    const formattedEntries = entries.map((entry) => {
      const fullPath = path.join(resolvedPath, entry.name);
      const relativePath = path.relative(path.join(process.cwd(), AGENTS_BASE_DIR), fullPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        path: relativePath || ".",
      };
    });

    // Group by type
    const files = formattedEntries.filter((e) => e.type === "file");
    const directories = formattedEntries.filter((e) => e.type === "directory");

    return JSON.stringify({
      ok: true,
      directory_path: resolvedPath,
      base_directory: AGENTS_BASE_DIR,
      recursive: args.recursive ?? false,
      total_entries: formattedEntries.length,
      files: files,
      directories: directories,
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      ok: false,
      error: "List failed",
      directory_path: AGENTS_BASE_DIR,
      message: errorMessage,
    }, null, 2);
  }
}

/**
 * Execute: Delete file
 */
async function executeDeleteFile(args: { filePath: string }): Promise<string> {
  try {
    const resolvedPath = validatePath(args.filePath);

    // Check if file exists
    if (!await isFile(resolvedPath)) {
      return JSON.stringify({
        ok: false,
        error: "File not found",
        file_path: resolvedPath,
        message: `The file '${args.filePath}' does not exist or is not a file`,
      }, null, 2);
    }

    // Delete file
    await rm(resolvedPath);

    return JSON.stringify({
      ok: true,
      file_path: resolvedPath,
      file_name: path.basename(resolvedPath),
      message: `Successfully deleted ${resolvedPath}`,
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      ok: false,
      error: "Delete failed",
      file_path: args.filePath,
      message: errorMessage,
    }, null, 2);
  }
}

// ============================================================================
// Tool Export
// ============================================================================

/**
 * Get all file operation tools for an agent
 */
export function getAgentFileTools() {
  return {
    readFile: readFileTool(),
    writeFile: writeFileTool(),
    listFiles: listFilesTool(),
    deleteFile: deleteFileTool(),
  };
}

/**
 * Legacy tool definitions (JSON Schema for backward compatibility)
 */
export const agentFileTools = {
  readFile: {
    description: "Read the content of a text file from the agent workspace",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Relative or absolute path to the file" },
      },
      required: ["filePath"],
    },
  },
  writeFile: {
    description: "Write content to a text file in the agent workspace",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Relative or absolute path to the file" },
        content: { type: "string", description: "Content to write to the file" },
      },
      required: ["filePath", "content"],
    },
  },
  listFiles: {
    description: "List files and directories within a directory",
    parameters: {
      type: "object",
      properties: {
        directoryPath: {
          type: "string",
          description: "Relative or absolute path to directory. Defaults to root",
        },
        recursive: {
          type: "boolean",
          description: "Whether to list subdirectories recursively",
          default: false,
        },
      },
    },
  },
  deleteFile: {
    description: "Delete a file from the agent workspace",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Relative or absolute path to the file to delete" },
      },
      required: ["filePath"],
    },
  },
};

export type AgentFileToolName = keyof typeof agentFileTools;

export const AGENT_FILE_TOOL_NAMES = Object.keys(agentFileTools) as AgentFileToolName[];

// ============================================================================
// Direct Execution (for non-AI SDK usage)
// ============================================================================

export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "readFile":
      return executeReadFile(args as { filePath: string });
    case "writeFile":
      return executeWriteFile(args as { filePath: string; content: string });
    case "listFiles":
      return executeListFiles(args as { directoryPath?: string; recursive?: boolean });
    case "deleteFile":
      return executeDeleteFile(args as { filePath: string });
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
