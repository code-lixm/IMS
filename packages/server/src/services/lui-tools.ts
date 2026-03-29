/**
 * LUI Tools Service
 *
 * Implements tools for the LUI AI assistant in Vercel AI SDK format.
 * Based on the OpenCode interview-manager agent tools.
 *
 * Enhanced with database integration for IMS (Interview Management System).
 */

import { mkdir, access, writeFile, readFile, readdir, stat, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { tool } from "ai";
import { db } from "../db";
import { candidates, resumes, interviews, artifacts, luiWorkflows } from "../schema";

// ============================================================================
// Tool Context
// ============================================================================

export interface ToolContext {
  directory: string;
  candidateId?: string;
  workflowId?: string;
}

// ============================================================================
// Vercel AI SDK Tool Definitions (with Zod schemas)
// ============================================================================

export const ensureWorkspaceTool = (context: ToolContext) => tool({
  description: "Create or verify candidate workspace exists under interviews/YYYY-MM-DD and initialize meta.json",
  inputSchema: z.object({
    candidateName: z.string().describe("Candidate name, e.g. 侯世纪"),
    position: z.string().describe("Position name, e.g. 前端开发工程师"),
    date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
  }),
  execute: async ({ candidateName, position, date }) => {
    return executeEnsureWorkspace({ candidateName, position, date }, context);
  },
});

export const resolveRoundTool = () => tool({
  description: "Resolve interview round (1-4) from text or previous round. Returns ask_required=true when undetected.",
  inputSchema: z.object({
    inputText: z.string().optional().describe("User request text or previous-round summary"),
    previousRound: z.number().min(1).max(4).optional().describe("Known previous round number"),
  }),
  execute: async ({ inputText, previousRound }) => {
    return executeResolveRound({ inputText, previousRound });
  },
});

export const buildWechatCopyTextTool = () => tool({
  description: "Build strict line-template WeChat copy text for interview assessment",
  inputSchema: z.object({
    name: z.string(),
    roleAbbr: z.string(),
    years: z.string(),
    round: z.number().min(1).max(4),
    interviewEvaluation: z.string(),
    recommendedLevel: z.string(),
    summaryBullets: z.array(z.string()),
    nextRoundFocus: z.string().optional(),
  }),
  execute: async (args) => {
    return executeBuildWechatCopyText(args);
  },
});

export const scanPdfTool = (context: ToolContext) => tool({
  description: "Scan PDF via local Python scripts and return extracted text JSON",
  inputSchema: z.object({
    pdfPath: z.string().describe("Absolute or project-relative PDF path"),
    profile: z.enum(["screening", "questioning"]).default("screening").describe("Parser profile to use"),
    strictQualityGate: z.boolean().default(true).describe("Fail when parsed quality status is fail"),
  }),
  execute: async ({ pdfPath, profile, strictQualityGate }) => {
    return executeScanPdf({ pdfPath, profile, strictQualityGate }, context);
  },
});

export const sanitizeInterviewNotesTool = () => tool({
  description: "Sanitize interview notes by removing injection/noise markers before assessment",
  inputSchema: z.object({
    notesText: z.string().describe("Raw interview notes content"),
    customNoisePatterns: z.array(z.string()).optional().describe("Optional extra regex patterns"),
  }),
  execute: async ({ notesText, customNoisePatterns }) => {
    return executeSanitizeInterviewNotes({ notesText, customNoisePatterns });
  },
});

export const batchScreenResumesTool = (context: ToolContext) => tool({
  description: "Batch screening: accept PDFs/ZIPs, extract, analyze concurrently, generate summary table",
  inputSchema: z.object({
    inputPaths: z.array(z.string()).describe("List of PDF files, directories, or ZIP files"),
    maxConcurrency: z.number().min(1).max(32).optional().describe("Maximum concurrent workers"),
    outputSummaryPath: z.string().optional().describe("Optional output markdown path"),
    strictQualityGate: z.boolean().default(true),
    keepExtractedTemp: z.boolean().default(false),
    idempotencyKey: z.string().optional(),
  }),
  execute: async (args) => {
    return executeBatchScreenResumes(args, context);
  },
});

export const writeMarkdownTool = (context: ToolContext) => tool({
  description: "Write markdown content to a file. Creates or overwrites the file at the specified path.",
  inputSchema: z.object({
    filePath: z.string().describe("Absolute or project-relative file path (must end with .md)"),
    content: z.string().describe("Markdown content to write"),
    title: z.string().optional().describe("Optional title for the document"),
  }),
  execute: async ({ filePath, content, title }) => {
    return executeWriteMarkdown({ filePath, content, title }, context);
  },
});

/**
 * Get all tools for workflow execution
 */
export function getWorkflowTools(context: ToolContext, allowedToolNames?: readonly string[] | null) {
  const allTools = {
    ensureWorkspace: ensureWorkspaceTool(context),
    resolveRound: resolveRoundTool(),
    buildWechatCopyText: buildWechatCopyTextTool(),
    scanPdf: scanPdfTool(context),
    sanitizeInterviewNotes: sanitizeInterviewNotesTool(),
    batchScreenResumes: batchScreenResumesTool(context),
    writeMarkdown: writeMarkdownTool(context),
  };

  if (!allowedToolNames || allowedToolNames.length === 0) {
    return {};
  }

  const allowed = new Set(allowedToolNames);
  return Object.fromEntries(
    Object.entries(allTools).filter(([toolName]) => allowed.has(toolName))
  );
}

// ============================================================================
// Legacy Tool Definitions (JSON Schema for backward compatibility)
// ============================================================================

export interface ToolDefinition {
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const tools: Record<string, ToolDefinition> = {
  ensureWorkspace: {
    description: "Create or verify candidate workspace exists under interviews/YYYY-MM-DD and initialize meta.json",
    parameters: {
      type: "object",
      properties: {
        candidateName: { type: "string", description: "Candidate name, e.g. 侯世纪" },
        position: { type: "string", description: "Position name, e.g. 前端开发工程师" },
        date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." }
      },
      required: ["candidateName", "position"]
    }
  },

  resolveRound: {
    description: "Resolve interview round (1-4) from text or previous round. Returns ask_required=true when undetected.",
    parameters: {
      type: "object",
      properties: {
        inputText: { type: "string", description: "User request text or previous-round summary" },
        previousRound: { type: "number", minimum: 1, maximum: 4, description: "Known previous round number" }
      }
    }
  },

  buildWechatCopyText: {
    description: "Build strict line-template WeChat copy text for interview assessment",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        roleAbbr: { type: "string" },
        years: { type: "string" },
        round: { type: "number", minimum: 1, maximum: 4 },
        interviewEvaluation: { type: "string" },
        recommendedLevel: { type: "string" },
        summaryBullets: { type: "array", items: { type: "string" } },
        nextRoundFocus: { type: "string" }
      },
      required: ["name", "roleAbbr", "years", "round", "interviewEvaluation", "recommendedLevel", "summaryBullets"]
    }
  },

  scanPdf: {
    description: "Scan PDF via local Python scripts and return extracted text JSON",
    parameters: {
      type: "object",
      properties: {
        pdfPath: { type: "string", description: "Absolute or project-relative PDF path" },
        profile: { type: "string", enum: ["screening", "questioning"], default: "screening", description: "Parser profile to use" },
        strictQualityGate: { type: "boolean", default: true, description: "Fail when parsed quality status is fail" }
      },
      required: ["pdfPath"]
    }
  },

  sanitizeInterviewNotes: {
    description: "Sanitize interview notes by removing injection/noise markers before assessment",
    parameters: {
      type: "object",
      properties: {
        notesText: { type: "string", description: "Raw interview notes content" },
        customNoisePatterns: { type: "array", items: { type: "string" }, description: "Optional extra regex patterns" }
      },
      required: ["notesText"]
    }
  },

  batchScreenResumes: {
    description: "Batch screening: accept PDFs/ZIPs, extract, analyze concurrently, generate summary table",
    parameters: {
      type: "object",
      properties: {
        inputPaths: { type: "array", items: { type: "string" }, description: "List of PDF files, directories, or ZIP files" },
        maxConcurrency: { type: "number", minimum: 1, maximum: 32, description: "Maximum concurrent workers" },
        outputSummaryPath: { type: "string", description: "Optional output markdown path" },
        strictQualityGate: { type: "boolean", default: true },
        keepExtractedTemp: { type: "boolean", default: false },
        idempotencyKey: { type: "string" }
      },
      required: ["inputPaths"]
    }
  },

  writeMarkdown: {
    description: "Write markdown content to a file. Creates or overwrites the file at the specified path.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or project-relative file path (must end with .md)" },
        content: { type: "string", description: "Markdown content to write" },
        title: { type: "string", description: "Optional title for the document" }
      },
      required: ["filePath", "content"]
    }
  }
};

// ============================================================================
// Tool Names
// ============================================================================

export type ToolName = keyof typeof tools;

export const TOOL_NAMES = Object.keys(tools) as ToolName[];

// ============================================================================
// Helper Functions
// ============================================================================

function todayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeFolderName(input: string): string {
  return input.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "");
}

function parseRound(text: string | null | undefined): number | null {
  if (!text) return null;
  const normalized = String(text).toLowerCase();
  const patterns = [/第\s*([1-4])\s*轮/, /round\s*([1-4])\b/, /r\s*([1-4])\b/];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function runCommand(command: string, args: string[], timeoutMs = 120000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) { child.kill("SIGKILL"); reject(new Error(`Command timeout after ${timeoutMs}ms`)); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timer); if (!finished) { finished = true; reject(error); } });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed (${command}), code=${code}: ${stderr || stdout}`));
    });
  });
}

// ============================================================================
// Tool Implementations
// ============================================================================

interface ToolContext {
  directory: string;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  switch (toolName) {
    case "ensureWorkspace":
      return executeEnsureWorkspace(args as { candidateName: string; position: string; date?: string }, context);
    case "resolveRound":
      return executeResolveRound(args as { inputText?: string; previousRound?: number });
    case "buildWechatCopyText":
      return executeBuildWechatCopyText(args as {
        name: string; roleAbbr: string; years: string; round: number;
        interviewEvaluation: string; recommendedLevel: string;
        summaryBullets: string[]; nextRoundFocus?: string;
      });
    case "scanPdf":
      return executeScanPdf(args as { pdfPath: string; profile?: string; strictQualityGate?: boolean }, context);
    case "sanitizeInterviewNotes":
      return executeSanitizeInterviewNotes(args as { notesText: string; customNoisePatterns?: string[] });
    case "batchScreenResumes":
      return executeBatchScreenResumes(args as {
        inputPaths: string[]; maxConcurrency?: number; outputSummaryPath?: string;
        strictQualityGate?: boolean; keepExtractedTemp?: boolean; idempotencyKey?: string;
      }, context);
    case "writeMarkdown":
      return executeWriteMarkdown(args as { filePath: string; content: string; title?: string }, context);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export async function executeEnsureWorkspace(
  args: { candidateName: string; position: string; date?: string },
  context: ToolContext
): Promise<string> {
  const date = args.date ?? todayDate();
  const folderName = normalizeFolderName(args.candidateName);
  const baseDir = path.join(context.directory, "interviews", date, folderName);
  await mkdir(baseDir, { recursive: true });
  const metaPath = path.join(baseDir, "meta.json");
  let createdMeta = false;
  try {
    await access(metaPath);
  } catch {
    const meta = {
      candidate: { name: args.candidateName, position: args.position },
      workflow: { current_stage: "S0", status: "initialized", updated_at: new Date().toISOString() },
      documents: { S0: null, S1: { latest_round: null, latest_file: null, round_files: {} }, S2: null }
    };
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
    createdMeta = true;
  }
  return JSON.stringify({ ok: true, candidate_folder_path: baseDir, meta_json_path: metaPath, created_meta: createdMeta }, null, 2);
}

export async function executeResolveRound(args: { inputText?: string; previousRound?: number }): Promise<string> {
  const parsed = parseRound(args.inputText);
  if (parsed) {
    return JSON.stringify({ ok: true, round: parsed, source: "input_text", ask_required: false }, null, 2);
  }
  if (args.previousRound) {
    const nextRound = Math.min(args.previousRound + 1, 4);
    return JSON.stringify({ ok: true, round: nextRound, source: "previous_round_plus_one", ask_required: false }, null, 2);
  }
  return JSON.stringify({ ok: true, round: 1, source: "default", ask_required: true, prompt: "需要第几轮（1-4）？" }, null, 2);
}

export async function executeBuildWechatCopyText(args: {
  name: string; roleAbbr: string; years: string; round: number;
  interviewEvaluation: string; recommendedLevel: string;
  summaryBullets: string[]; nextRoundFocus?: string;
}): Promise<string> {
  const REJECT_EVALUATION_PATTERN = /(淘汰|不合格)/;
  const LEVEL_CODE_PATTERN = /^(P[5-8][+-]?|不推荐)$/;
  const normalizedEvaluation = String(args.interviewEvaluation ?? "").trim();
  const isRejectedFlow = REJECT_EVALUATION_PATTERN.test(normalizedEvaluation);
  let normalizedLevel = String(args.recommendedLevel ?? "").trim();
  if (isRejectedFlow) normalizedLevel = "不推荐";
  if (!LEVEL_CODE_PATTERN.test(normalizedLevel)) {
    throw new Error(`Invalid recommendedLevel: ${args.recommendedLevel}`);
  }
  if (isRejectedFlow && args.recommendedLevel && args.recommendedLevel !== "不推荐") {
    throw new Error("Rejected evaluation must use recommendedLevel=不推荐");
  }
  const lines = [
    `${args.name} ${args.roleAbbr} ${args.years}`,
    `面试轮次：第${args.round}轮`,
    `面试评价：${normalizedEvaluation}`,
    `推荐职级：${normalizedLevel}`,
    "面试总结：",
    ...args.summaryBullets.map((item) => `- ${item}`)
  ];
  if (isRejectedFlow && args.nextRoundFocus) {
    throw new Error("Rejected evaluation must not provide nextRoundFocus.");
  }
  if (!isRejectedFlow && args.nextRoundFocus) {
    lines.push(`下一阶段面试侧重点：${args.nextRoundFocus.trim()}`);
  }
  return lines.join("\n");
}

export async function executeScanPdf(
  args: { pdfPath: string; profile?: string; strictQualityGate?: boolean },
  context: ToolContext
): Promise<string> {
  const resolvedPdfPath = path.isAbsolute(args.pdfPath)
    ? args.pdfPath
    : path.join(context.directory, args.pdfPath);

  try {
    // Check if file exists
    const fileStats = await stat(resolvedPdfPath);
    if (!fileStats.isFile()) {
      throw new Error(`Path is not a file: ${resolvedPdfPath}`);
    }

    // Extract text from PDF using pdf-parse
    const extract = await import("pdf-parse");
    const fileBuffer = await readFile(resolvedPdfPath);
    const pdfData = await extract.default(fileBuffer);
    const content = (pdfData.text ?? "").trim();

    // Calculate quality metrics
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    const charCount = content.length;

    // Quality assessment
    let qualityStatus: "pass" | "warning" | "fail" = "pass";
    let hardFail = false;
    const qualityIssues: string[] = [];

    if (wordCount < 50) {
      qualityStatus = "fail";
      hardFail = true;
      qualityIssues.push("Text extraction yielded very few words - likely a scanned/image PDF");
    } else if (wordCount < 200) {
      qualityStatus = "warning";
      qualityIssues.push("Low word count - document may be incomplete or image-based");
    }

    if (charCount > 0) {
      const printableRatio = content.replace(/[^\x20-\x7E\u4E00-\u9FFF\s]/g, "").length / charCount;
      if (printableRatio < 0.5) {
        qualityStatus = "fail";
        hardFail = true;
        qualityIssues.push("High ratio of non-printable characters - extraction failed");
      }
    }

    // Apply strict quality gate if requested
    if (args.strictQualityGate && qualityStatus === "fail") {
      return JSON.stringify({
        ok: false,
        profile: args.profile ?? "screening",
        pdf_path: resolvedPdfPath,
        content: content.slice(0, 500), // Include partial content for debugging
        word_count: wordCount,
        char_count: charCount,
        quality: {
          status: qualityStatus,
          hard_fail: hardFail,
          issues: qualityIssues,
          printable_ratio: charCount > 0 ? content.replace(/[^\x20-\x7E\u4E00-\u9FFF\s]/g, "").length / charCount : 0
        },
        error: "Quality gate failed. PDF may be image-based or corrupted. Consider using OCR."
      }, null, 2);
    }

    return JSON.stringify({
      ok: true,
      profile: args.profile ?? "screening",
      pdf_path: resolvedPdfPath,
      file_size: fileStats.size,
      content: content,
      word_count: wordCount,
      char_count: charCount,
      quality: {
        status: qualityStatus,
        hard_fail: hardFail,
        issues: qualityIssues,
        printable_ratio: charCount > 0 ? content.replace(/[^\x20-\x7E\u4E00-\u9FFF\s]/g, "").length / charCount : 0
      },
      page_count: pdfData.numpages || null,
      info: pdfData.info || {}
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      ok: false,
      profile: args.profile ?? "screening",
      pdf_path: resolvedPdfPath,
      content: "",
      word_count: 0,
      quality: { status: "fail", hard_fail: true },
      error: `PDF extraction failed: ${errorMessage}`
    }, null, 2);
  }
}

export async function executeSanitizeInterviewNotes(args: { notesText: string; customNoisePatterns?: string[] }): Promise<string> {
  const DEFAULT_NOTE_NOISE_PATTERNS = [
    /\[search-mode\]/gi,
    /<\/?dcp-message-id>/gi,
    /<\/?dcp-system-reminder>/gi,
    /<dcp-message-id>.*?<\/dcp-message-id>/gsi,
    /<dcp-system-reminder>.*?<\/dcp-system-reminder>/gsi,
  ];
  let output = String(args.notesText ?? "");
  const patterns = [...DEFAULT_NOTE_NOISE_PATTERNS];
  if (args.customNoisePatterns) {
    for (const literal of args.customNoisePatterns) {
      if (literal) patterns.push(new RegExp(String(literal), "gi"));
    }
  }
  for (const pattern of patterns) {
    output = output.replace(pattern, "");
  }
  output = output.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return JSON.stringify({ ok: true, sanitized_notes: output, removed_count: 0, removed_markers: [] }, null, 2);
}

export async function executeBatchScreenResumes(
  args: {
    inputPaths: string[]; maxConcurrency?: number; outputSummaryPath?: string;
    strictQualityGate?: boolean; keepExtractedTemp?: boolean; idempotencyKey?: string;
  },
  context: ToolContext
): Promise<string> {
  const startTime = Date.now();
  const maxConcurrency = Math.max(1, Math.min(args.maxConcurrency ?? 4, 32));
  const results: Array<{
    candidate_name: string;
    pdf_path: string;
    quality_status: "pass" | "warning" | "fail";
    word_count: number;
    next_action: string;
    error?: string;
  }> = [];

  // Create temp directory for extracted files
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ims-batch-screen-"));
  const extractedPdfs: string[] = [];

  try {
    // Phase 1: Discover and extract PDFs from input paths
    for (const inputPath of args.inputPaths) {
      const resolvedPath = path.isAbsolute(inputPath)
        ? inputPath
        : path.join(context.directory, inputPath);

      try {
        const stats = await stat(resolvedPath);

        if (stats.isFile()) {
          const ext = path.extname(resolvedPath).toLowerCase();
          if (ext === ".pdf") {
            extractedPdfs.push(resolvedPath);
          } else if (ext === ".zip") {
            // Extract ZIP files
            const JSZip = await import("jszip");
            const zipBuffer = await readFile(resolvedPath);
            const zip = await JSZip.default.loadAsync(zipBuffer);

            for (const [filename, file] of Object.entries(zip.files)) {
              if (file.dir) continue;
              if (path.extname(filename).toLowerCase() === ".pdf") {
                const extractedPath = path.join(tempDir, path.basename(filename));
                const content = await file.async("nodebuffer");
                await writeFile(extractedPath, content);
                extractedPdfs.push(extractedPath);
              }
            }
          }
        } else if (stats.isDirectory()) {
          // Scan directory for PDFs
          const entries = await readdir(resolvedPath, { recursive: true });
          for (const entry of entries) {
            const entryPath = path.join(resolvedPath, entry);
            const entryStats = await stat(entryPath);
            if (entryStats.isFile() && path.extname(entry).toLowerCase() === ".pdf") {
              extractedPdfs.push(entryPath);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing ${inputPath}:`, error);
      }
    }

    // Phase 2: Process PDFs concurrently
    const processPdf = async (pdfPath: string): Promise<void> => {
      const candidateName = path.basename(pdfPath, path.extname(pdfPath));

      try {
        // Import pdf-parse dynamically
        const extract = await import("pdf-parse");
        const fileBuffer = await readFile(pdfPath);
        const pdfData = await extract.default(fileBuffer);
        const content = (pdfData.text ?? "").trim();

        // Calculate metrics
        const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
        const charCount = content.length;

        // Quality assessment
        let qualityStatus: "pass" | "warning" | "fail" = "pass";
        const qualityIssues: string[] = [];

        if (wordCount < 50) {
          qualityStatus = "fail";
          qualityIssues.push("Very few words extracted - likely image-based PDF");
        } else if (wordCount < 200) {
          qualityStatus = "warning";
          qualityIssues.push("Low word count - possible partial extraction");
        }

        if (charCount > 0) {
          const printableRatio = content.replace(/[^\x20-\x7E\u4E00-\u9FFF\s]/g, "").length / charCount;
          if (printableRatio < 0.5) {
            qualityStatus = "fail";
            qualityIssues.push("High non-printable character ratio");
          }
        }

        // Determine next action based on quality
        let nextAction = "通过";
        if (qualityStatus === "fail") {
          nextAction = args.strictQualityGate ? "跳过" : "需人工审核";
        } else if (qualityStatus === "warning") {
          nextAction = "需人工审核";
        }

        results.push({
          candidate_name: candidateName,
          pdf_path: pdfPath,
          quality_status: qualityStatus,
          word_count: wordCount,
          next_action: nextAction
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          candidate_name: candidateName,
          pdf_path: pdfPath,
          quality_status: "fail",
          word_count: 0,
          next_action: "跳过",
          error: errorMessage
        });
      }
    };

    // Process PDFs with concurrency limit
    const queue = [...extractedPdfs];
    const workers: Promise<void>[] = [];

    for (let i = 0; i < maxConcurrency; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const pdfPath = queue.shift();
            if (pdfPath) await processPdf(pdfPath);
          }
        })()
      );
    }

    await Promise.all(workers);

    // Phase 3: Generate summary markdown
    const summaryPath = args.outputSummaryPath
      ? (path.isAbsolute(args.outputSummaryPath)
          ? args.outputSummaryPath
          : path.join(context.directory, args.outputSummaryPath))
      : path.join(context.directory, "interviews", todayDate(), "batch_筛选汇总.md");

    // Ensure parent directory exists
    await mkdir(path.dirname(summaryPath), { recursive: true });

    // Build summary table
    const passed = results.filter(r => r.quality_status === "pass").length;
    const warnings = results.filter(r => r.quality_status === "warning").length;
    const failed = results.filter(r => r.quality_status === "fail").length;

    const summaryContent = `# 批量简历筛选报告

## 统计信息

- **生成时间**: ${new Date().toISOString()}
- **处理时长**: ${((Date.now() - startTime) / 1000).toFixed(2)}s
- **总简历数**: ${results.length}
- **通过**: ${passed}
- **警告**: ${warnings}
- **失败**: ${failed}

## 详细结果

| 候选人 | 文件路径 | 质量状态 | 字数 | 建议操作 |
|--------|----------|----------|------|----------|
${results.map(r =>
  `| ${r.candidate_name} | ${path.basename(r.pdf_path)} | ${r.quality_status} | ${r.word_count} | ${r.next_action} |`
).join("\n")}

## 处理失败的文件

${results.filter(r => r.error).map(r => `- **${r.candidate_name}**: ${r.error}`).join("\n") || "无"}

## 质量说明

- **通过**: PDF 文本提取成功，内容完整
- **警告**: 文本提取部分成功，可能需要人工审核
- **失败**: 文本提取失败，可能是图片格式或加密 PDF

${args.idempotencyKey ? `\n**幂等键**: ${args.idempotencyKey}` : ""}
`;

    await writeFile(summaryPath, summaryContent, "utf-8");

    // Cleanup temp directory if not keeping
    if (!args.keepExtractedTemp) {
      await rm(tempDir, { recursive: true, force: true });
    }

    return JSON.stringify({
      ok: true,
      command: "batchScreenResumes",
      mode: "standalone",
      discovered_pdf_count: extractedPdfs.length,
      processed_count: results.length,
      summary_path: summaryPath,
      next_step: "stop_after_summary",
      statistics: {
        passed,
        warnings,
        failed,
        total: results.length
      },
      rows: results,
      processing_time_ms: Date.now() - startTime,
      temp_directory: args.keepExtractedTemp ? tempDir : null
    }, null, 2);
  } catch (error) {
    // Cleanup temp directory on error
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      ok: false,
      command: "batchScreenResumes",
      error: `Batch processing failed: ${errorMessage}`,
      discovered_pdf_count: extractedPdfs.length,
      processed_count: results.length,
      rows: results
    }, null, 2);
  }
}

export async function executeWriteMarkdown(
  args: { filePath: string; content: string; title?: string },
  context: ToolContext
): Promise<string> {
  // Validate file path ends with .md
  if (!args.filePath.endsWith(".md")) {
    throw new Error("File path must end with .md extension");
  }

  // Resolve the file path
  const resolvedPath = path.isAbsolute(args.filePath)
    ? args.filePath
    : path.join(context.directory, args.filePath);

  // Ensure parent directory exists
  const parentDir = path.dirname(resolvedPath);
  await mkdir(parentDir, { recursive: true });

  // Add frontmatter with title if provided
  let content = args.content;
  if (args.title) {
    const frontmatter = `---
title: "${args.title.replace(/"/g, '\\"')}"
date: ${new Date().toISOString()}
---

`;
    content = frontmatter + content;
  }

  // Write the file
  await writeFile(resolvedPath, content, "utf-8");

  // Get file stats
  const stats = await stat(resolvedPath);

  return JSON.stringify({
    ok: true,
    file_path: resolvedPath,
    file_name: path.basename(resolvedPath),
    size: stats.size,
    content_length: content.length,
    message: `Successfully wrote ${stats.size} bytes to ${resolvedPath}`
  }, null, 2);
}

// ============================================================================
// Database-Aware Tool Implementations (IMS Integration)
// ============================================================================

/**
 * Get candidate details from database.
 */
export async function getCandidateDetails(candidateId: string): Promise<{
  id: string;
  name: string;
  position: string | null;
  yearsOfExperience: number | null;
  tags: string[];
  resumeCount: number;
  interviewCount: number;
} | null> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!candidate) return null;

  const [resumeCount] = await db
    .select({ count: db.$count(resumes) })
    .from(resumes)
    .where(eq(resumes.candidateId, candidateId));

  const [interviewCount] = await db
    .select({ count: db.$count(interviews) })
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId));

  return {
    id: candidate.id,
    name: candidate.name,
    position: candidate.position,
    yearsOfExperience: candidate.yearsOfExperience,
    tags: candidate.tagsJson ? JSON.parse(candidate.tagsJson) : [],
    resumeCount: resumeCount?.count ?? 0,
    interviewCount: interviewCount?.count ?? 0,
  };
}

/**
 * Get resume text content for a candidate.
 */
export async function getCandidateResumeText(candidateId: string): Promise<string | null> {
  const [resume] = await db
    .select({ extractedText: resumes.extractedText, fileName: resumes.fileName })
    .from(resumes)
    .where(eq(resumes.candidateId, candidateId))
    .orderBy(desc(resumes.createdAt))
    .limit(1);

  if (!resume?.extractedText) return null;

  return `[${resume.fileName}]\n${resume.extractedText}`;
}

/**
 * Get interview history for a candidate.
 */
export async function getCandidateInterviews(candidateId: string): Promise<Array<{
  round: number;
  status: string;
  scheduledAt: string | null;
  feedback: string | null;
}> | null> {
  const rows = await db
    .select({
      round: interviews.round,
      status: interviews.status,
      scheduledAt: interviews.scheduledAt,
      manualEvaluationJson: interviews.manualEvaluationJson,
    })
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId))
    .orderBy(desc(interviews.round));

  if (!rows.length) return null;

  return rows.map(row => {
    let feedback: string | null = null;
    if (row.manualEvaluationJson) {
      try {
        const eval_ = JSON.parse(row.manualEvaluationJson);
        if (eval_.comments) {
          feedback = `${eval_.decision || 'No decision'}: ${eval_.comments}`;
        }
      } catch {
        // ignore parse errors
      }
    }
    return {
      round: row.round,
      status: row.status,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
      feedback,
    };
  });
}

/**
 * Update workflow document tracking.
 */
export async function updateWorkflowDocument(
  workflowId: string,
  stage: "S0" | "S1" | "S2",
  document: { filePath?: string; content?: string; summary?: string }
): Promise<void> {
  const [workflow] = await db
    .select({ documentsJson: luiWorkflows.documentsJson })
    .from(luiWorkflows)
    .where(eq(luiWorkflows.id, workflowId))
    .limit(1);

  if (!workflow) return;

  const documents = workflow.documentsJson ? JSON.parse(workflow.documentsJson) : {};
  documents[stage] = {
    ...document,
    generatedAt: new Date().toISOString(),
  };

  await db
    .update(luiWorkflows)
    .set({
      documentsJson: JSON.stringify(documents),
      updatedAt: new Date(),
    })
    .where(eq(luiWorkflows.id, workflowId));
}
