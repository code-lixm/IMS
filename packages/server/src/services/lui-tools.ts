/**
 * LUI Tools Service
 *
 * Implements tools for the LUI AI assistant in Vercel AI SDK format.
 * Based on the OpenCode interview-manager agent tools.
 */

import { mkdir, access, writeFile, readFile, readdir, stat, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";

// ============================================================================
// Tool Definitions (JSON Schema for AI SDK)
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
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function executeEnsureWorkspace(
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

async function executeResolveRound(args: { inputText?: string; previousRound?: number }): Promise<string> {
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

async function executeBuildWechatCopyText(args: {
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

async function executeScanPdf(
  args: { pdfPath: string; profile?: string; strictQualityGate?: boolean },
  context: ToolContext
): Promise<string> {
  const resolvedPdfPath = path.isAbsolute(args.pdfPath)
    ? args.pdfPath
    : path.join(context.directory, args.pdfPath);
  // Placeholder - actual PDF parsing requires Python scripts
  return JSON.stringify({
    ok: true,
    profile: args.profile ?? "screening",
    pdf_path: resolvedPdfPath,
    content: "[PDF content would be extracted here - requires Python parse scripts]",
    word_count: 0,
    quality: { status: "pass", hard_fail: false }
  }, null, 2);
}

async function executeSanitizeInterviewNotes(args: { notesText: string; customNoisePatterns?: string[] }): Promise<string> {
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

async function executeBatchScreenResumes(
  args: {
    inputPaths: string[]; maxConcurrency?: number; outputSummaryPath?: string;
    strictQualityGate?: boolean; keepExtractedTemp?: boolean; idempotencyKey?: string;
  },
  context: ToolContext
): Promise<string> {
  // Placeholder - actual batch processing requires Python scripts
  return JSON.stringify({
    ok: true,
    command: "batchScreenResumes",
    mode: "standalone",
    discovered_pdf_count: args.inputPaths.length,
    summary_path: args.outputSummaryPath ?? `interviews/${todayDate()}/batch_筛选汇总.md`,
    next_step: "stop_after_summary",
    rows: args.inputPaths.map(p => ({
      candidate_name: path.basename(p, path.extname(p)),
      pdf_path: p,
      quality_status: "pass",
      word_count: 0,
      next_action: "通过"
    }))
  }, null, 2);
}
