import { tool } from "@opencode-ai/plugin";
import { mkdir, access, writeFile, readFile, readdir, stat, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeFolderName(input) {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "");
}

function decodePossibleEncodedPath(inputPath) {
  const normalized = String(inputPath ?? "").trim();
  if (!normalized) return normalized;
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function parseRound(text) {
  if (!text) return null;
  const normalized = String(text).toLowerCase();
  const patterns = [
    /第\s*([1-4])\s*轮/,
    /round\s*([1-4])\b/,
    /r\s*([1-4])\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

const LEVEL_CODE_PATTERN = /^(P[5-8][+-]?|不推荐)$/;
const REJECT_EVALUATION_PATTERN = /(淘汰|不合格)/;
const DEFAULT_NOTE_NOISE_PATTERNS = [
  /\[search-mode\]/gi,
  /<\/?dcp-message-id>/gi,
  /<\/?dcp-system-reminder>/gi,
  /<dcp-message-id>.*?<\/dcp-message-id>/gsi,
  /<dcp-system-reminder>.*?<\/dcp-system-reminder>/gsi,
];

function runPythonScript(scriptPath, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        child.kill("SIGKILL");
        reject(new Error(`Python script timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (!finished) {
        finished = true;
        reject(error);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Python script exited with code ${code}: ${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        child.kill("SIGKILL");
        reject(new Error(`Command timeout after ${timeoutMs}ms: ${command}`));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (!finished) {
        finished = true;
        reject(error);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed (${command}), code=${code}: ${stderr || stdout}`));
      }
    });
  });
}

function createPythonPdfWorkerPool(scriptPath, workerCount, timeoutMs = 120000) {
  const bridgeCode = String.raw`
import json
import sys
import traceback
import importlib.util

script_path = sys.argv[1]
spec = importlib.util.spec_from_file_location("pdf_parser_module", script_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def parse_pdf(pdf_path):
    result = module.extract_text_from_pdf(pdf_path)
    if (not result.get("success")) and ("not installed" not in str(result.get("error", ""))):
        alt = module.extract_with_pdfplumber(pdf_path)
        if alt and alt.get("success"):
            result = alt
    return result

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        payload = json.loads(line)
        request_id = payload.get("request_id")
        pdf_path = payload.get("pdf_path")
        result = parse_pdf(pdf_path)
        if not result.get("success"):
            raise RuntimeError(result.get("error", "PDF scan failed"))
        print(json.dumps({"request_id": request_id, "ok": True, "result": result}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({
            "request_id": payload.get("request_id") if 'payload' in locals() and isinstance(payload, dict) else None,
            "ok": False,
            "error": f"{error}",
            "traceback": traceback.format_exc(limit=3)
        }, ensure_ascii=False), flush=True)
`;

  const workers = [];
  let requestSeq = 0;
  let dispatchCursor = 0;

  for (let index = 0; index < workerCount; index += 1) {
    const child = spawn("python3", ["-u", "-c", bridgeCode, scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const pending = new Map();
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const rejectAllPending = (message) => {
      for (const [requestId, task] of pending.entries()) {
        clearTimeout(task.timer);
        task.reject(new Error(message));
        pending.delete(requestId);
      }
    };

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        if (line) {
          let payload;
          try {
            payload = JSON.parse(line);
          } catch {
            rejectAllPending(`Python worker returned invalid JSON line: ${line.slice(0, 200)}`);
            newlineIndex = stdoutBuffer.indexOf("\n");
            continue;
          }

          const requestId = payload?.request_id;
          if (!requestId || !pending.has(requestId)) {
            newlineIndex = stdoutBuffer.indexOf("\n");
            continue;
          }

          const task = pending.get(requestId);
          pending.delete(requestId);
          clearTimeout(task.timer);

          if (payload.ok) {
            task.resolve(payload.result);
          } else {
            task.reject(new Error(payload.error || "Python worker failed"));
          }
        }

        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      if (stderrBuffer.length > 2000) {
        stderrBuffer = stderrBuffer.slice(-2000);
      }
    });

    child.on("error", (error) => {
      rejectAllPending(`Python worker error: ${error.message}`);
    });

    child.on("close", (code) => {
      const reason =
        code === 0
          ? "Python worker closed unexpectedly"
          : `Python worker exited with code ${code}: ${stderrBuffer}`;
      rejectAllPending(reason);
    });

    workers.push({ child, pending });
  }

  const execute = (pdfPath) => {
    if (workers.length === 0) {
      return Promise.reject(new Error("No python workers available"));
    }

    const worker = workers[dispatchCursor % workers.length];
    dispatchCursor += 1;

    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${requestSeq++}`;
      const timer = setTimeout(() => {
        worker.pending.delete(requestId);
        reject(new Error(`Python worker timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      worker.pending.set(requestId, { resolve, reject, timer });
      worker.child.stdin.write(`${JSON.stringify({ request_id: requestId, pdf_path: pdfPath })}\n`);
    });
  };

  const close = async () => {
    for (const worker of workers) {
      const { child, pending } = worker;
      for (const [requestId, task] of pending.entries()) {
        clearTimeout(task.timer);
        task.reject(new Error("Python worker pool closed"));
        pending.delete(requestId);
      }
      child.kill("SIGTERM");
    }
  };

  return { execute, close };
}

const sharedScanWorkerPools = new Map();

function getSharedScanWorkerCount() {
  return Math.max(1, Math.min(os.cpus().length, 2));
}

function resetSharedScanWorkerPool(scriptPath) {
  const existing = sharedScanWorkerPools.get(scriptPath);
  if (!existing) return;
  existing.close().catch(() => {});
  sharedScanWorkerPools.delete(scriptPath);
}

function getOrCreateSharedScanWorkerPool(scriptPath) {
  const existing = sharedScanWorkerPools.get(scriptPath);
  if (existing) return existing;

  const pool = createPythonPdfWorkerPool(scriptPath, getSharedScanWorkerCount(), 180000);
  sharedScanWorkerPools.set(scriptPath, pool);
  return pool;
}

async function executePdfScanWithSharedPool({ parserScriptPath, pdfPath, parseCacheDir }) {
  const pool = getOrCreateSharedScanWorkerPool(parserScriptPath);

  try {
    return await executePdfScanWithCache({
      parserScriptPath,
      pdfPath,
      parseCacheDir,
      workerPool: pool,
    });
  } catch (error) {
    const errorMessage = String(error?.message ?? error);
    const workerLikelyBroken = /worker|EPIPE|closed|exited with code|timeout/i.test(errorMessage);
    if (!workerLikelyBroken) {
      throw error;
    }

    resetSharedScanWorkerPool(parserScriptPath);
    const retryPool = getOrCreateSharedScanWorkerPool(parserScriptPath);
    return executePdfScanWithCache({
      parserScriptPath,
      pdfPath,
      parseCacheDir,
      workerPool: retryPool,
    });
  }
}

async function collectPdfFilesRecursive(rootDir) {
  const pdfs = [];
  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        pdfs.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return pdfs;
}

async function extractZipToTemp(zipPath, contextDir) {
  const tempBase = path.join(contextDir, "interviews", "_batch_tmp");
  await mkdir(tempBase, { recursive: true });
  const tempDir = await mkdtemp(path.join(tempBase, "zip-"));
  await runCommand("ditto", ["-x", "-k", zipPath, tempDir], 180000);
  return tempDir;
}

async function runWithConcurrency(items, maxConcurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(maxConcurrency, items.length)) },
    () => consume(),
  );
  await Promise.all(workers);
  return results;
}

function toCandidateNameFromPdfPath(pdfPath) {
  const stem = path.basename(pdfPath, path.extname(pdfPath));
  return stem.replace(/[_-]+/g, " ").trim() || stem;
}

function buildBatchSummaryMarkdown(rows, metadata) {
  const lines = [
    "# 批量初筛汇总表",
    "",
    `- 生成时间: ${new Date().toISOString()}`,
    `- 输入源数量: ${metadata.input_count}`,
    `- 识别到 PDF 数量: ${metadata.pdf_count}`,
    `- 并发上限: ${metadata.max_concurrency}`,
    "",
    "| 候选人 | 文件路径 | 解析质量 | 词数 | 建议动作 |",
    "|---|---|---|---:|---|",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.candidate_name} | ${row.pdf_path} | ${row.quality_status} | ${row.word_count} | ${row.next_action} |`,
    );
  }

  return lines.join("\n");
}

function buildBatchIdempotencyKey(inputPaths, strictQualityGate, maxConcurrency, providedKey) {
  if (providedKey && String(providedKey).trim()) {
    return String(providedKey).trim();
  }

  const payload = JSON.stringify({
    inputPaths: [...inputPaths].sort(),
    strictQualityGate: Boolean(strictQualityGate),
    maxConcurrency: maxConcurrency ?? null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

async function buildPdfParseCacheKey(parserScriptPath, pdfPath) {
  const info = await stat(pdfPath);
  const payload = `${parserScriptPath}|${path.resolve(pdfPath)}|${info.size}|${Math.floor(info.mtimeMs)}`;
  return createHash("sha256").update(payload).digest("hex");
}

async function executePdfScanWithCache({ parserScriptPath, pdfPath, parseCacheDir, workerPool }) {
  const cacheKey = await buildPdfParseCacheKey(parserScriptPath, pdfPath);
  const cachePath = path.join(parseCacheDir, `${cacheKey}.json`);

  try {
    const cachedRaw = await readFile(cachePath, "utf-8");
    const cached = JSON.parse(cachedRaw);
    if (cached?.success) {
      return {
        parsed: cached,
        cache_hit: true,
      };
    }
  } catch {
    // cache miss / invalid cache
  }

  const parsed = workerPool
    ? await workerPool.execute(pdfPath)
    : await executePdfScan(parserScriptPath, pdfPath);

  await writeFile(cachePath, `${JSON.stringify(parsed)}\n`, "utf-8");
  return {
    parsed,
    cache_hit: false,
  };
}

async function executePdfScan(scriptPath, pdfPath) {
  const { stdout } = await runPythonScript(scriptPath, [pdfPath, "--json"]);
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Invalid JSON from script: ${error.message}`);
  }

  if (!parsed.success) {
    throw new Error(parsed.error || "PDF scan failed");
  }

  return parsed;
}

function evaluatePdfQuality(parsed, profile) {
  const wordCount = Number(parsed?.word_count ?? 0);
  const content = String(parsed?.content ?? "").trim();
  const metadata = parsed?.metadata ?? {};

  const minWordThreshold = profile === "screening" ? 120 : 80;
  const hardFailWordThreshold = 20;

  const issues = [];
  const warnings = [];

  if (!content) {
    issues.push("解析内容为空");
  }

  if (wordCount < hardFailWordThreshold) {
    issues.push(`有效词数过低（${wordCount} < ${hardFailWordThreshold}）`);
  } else if (wordCount < minWordThreshold) {
    warnings.push(`有效词数偏低（${wordCount} < ${minWordThreshold}）`);
  }

  if (!metadata || typeof metadata !== "object") {
    warnings.push("未返回结构化 metadata");
  }

  const status = issues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";
  return {
    status,
    hard_fail: status === "fail",
    min_word_threshold: minWordThreshold,
    hard_fail_word_threshold: hardFailWordThreshold,
    word_count: wordCount,
    issues,
    warnings,
  };
}

function sanitizeNotesText(inputText, customPatternLiterals = []) {
  let output = String(inputText ?? "");
  const removed = [];

  const patterns = [...DEFAULT_NOTE_NOISE_PATTERNS];
  for (const literal of customPatternLiterals) {
    if (!literal || !String(literal).trim()) continue;
    patterns.push(new RegExp(String(literal), "gi"));
  }

  for (const pattern of patterns) {
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      removed.push(...matches.map((item) => String(item).slice(0, 120)));
      output = output.replace(pattern, "");
    }
  }

  output = output
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return {
    sanitized: output,
    removed_markers: removed,
    removed_count: removed.length,
  };
}

export const ensureWorkspace = tool({
  description:
    "Ensure candidate workspace exists under interviews/YYYY-MM-DD and initialize meta.json for interview stages.",
  args: {
    candidateName: tool.schema.string().describe("Candidate name, e.g. 侯世纪"),
    position: tool.schema.string().describe("Position name, e.g. 前端开发工程师"),
    date: tool.schema
      .string()
      .optional()
      .describe("Date in YYYY-MM-DD. Defaults to today."),
  },
  async execute(args, context) {
    await context.ask({
      permission: "edit",
      patterns: ["interviews/**"],
      always: ["interviews/**"],
      metadata: { reason: "Initialize candidate workspace" },
    });

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
        candidate: {
          name: args.candidateName,
          position: args.position,
        },
        workflow: {
          current_stage: "S0",
          status: "initialized",
          updated_at: new Date().toISOString(),
        },
        documents: {
          S0: null,
          S1: {
            latest_round: null,
            latest_file: null,
            round_files: {},
          },
          S2: null,
        },
      };
      await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
      createdMeta = true;
    }

    return JSON.stringify(
      {
        ok: true,
        candidate_folder_path: baseDir,
        meta_json_path: metaPath,
        created_meta: createdMeta,
      },
      null,
      2,
    );
  },
});

export const resolveRound = tool({
  description:
    "Resolve interview round (1-4) from user text or previous-review text. Returns default ask_required=true when undetected.",
  args: {
    inputText: tool.schema
      .string()
      .optional()
      .describe("User request text or previous-round summary"),
    previousRound: tool.schema
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("Known previous round number (if provided)"),
  },
  async execute(args) {
    const parsed = parseRound(args.inputText);

    if (parsed) {
      return JSON.stringify(
        {
          ok: true,
          round: parsed,
          source: "input_text",
          ask_required: false,
        },
        null,
        2,
      );
    }

    if (args.previousRound) {
      const nextRound = Math.min(args.previousRound + 1, 4);
      return JSON.stringify(
        {
          ok: true,
          round: nextRound,
          source: "previous_round_plus_one",
          ask_required: false,
        },
        null,
        2,
      );
    }

    return JSON.stringify(
      {
        ok: true,
        round: 1,
        source: "default",
        ask_required: true,
        prompt: "需要第几轮（1-4）？",
      },
      null,
      2,
    );
  },
});

export const buildWechatCopyText = tool({
  description:
    "Build strict line-template WeChat copy text for interview assessment output.",
  args: {
    name: tool.schema.string(),
    roleAbbr: tool.schema.string(),
    years: tool.schema.string(),
    round: tool.schema.number().int().min(1).max(4),
    interviewEvaluation: tool.schema.string(),
    recommendedLevel: tool.schema.string(),
    summaryBullets: tool.schema.array(tool.schema.string()).min(1),
    nextRoundFocus: tool.schema.string().optional(),
  },
  async execute(args) {
    const rawEvaluation = String(args.interviewEvaluation ?? "").trim();
    const normalizedEvaluation = rawEvaluation === "B"
      ? "B（非必要不推荐）"
      : rawEvaluation === "C"
        ? "C（面试淘汰）"
        : rawEvaluation;
    const isRejectedFlow = REJECT_EVALUATION_PATTERN.test(normalizedEvaluation);

    const rawLevel = String(args.recommendedLevel ?? "").trim();
    const normalizedLevel = isRejectedFlow ? "不推荐" : rawLevel;

    if (!LEVEL_CODE_PATTERN.test(normalizedLevel)) {
      throw new Error(
        `Invalid recommendedLevel: ${args.recommendedLevel}. Must be one of P5-/P5/P5+/P6-/P6/P6+/P7-/P7/P7+/P8-/P8/P8+ or 不推荐.`,
      );
    }

    if (isRejectedFlow && rawLevel && rawLevel !== "不推荐") {
      throw new Error(
        `Rejected evaluation must use recommendedLevel=不推荐. Received: ${args.recommendedLevel}`,
      );
    }

    const formatSummaryBullet = (item) => {
      const normalized = String(item ?? "").trim();
      const sceneEvaluationMatch = normalized.match(/^场景：(.+?)；评价：(.+)$/);
      if (!sceneEvaluationMatch) {
        return [`- ${normalized}`];
      }

      return [
        `- 场景：${sceneEvaluationMatch[1].trim()}`,
        `  评价：${sceneEvaluationMatch[2].trim()}`,
      ];
    };

    const formatNextRoundFocus = (value) => {
      const items = String(value ?? "")
        .split(/[、,，；;\n]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (items.length === 0) {
        return [];
      }

      return [
        "下一阶段面试侧重点：",
        ...items.map((item) => `- ${item}`),
      ];
    };

    const lines = [
      `${args.name}｜${args.roleAbbr}｜${args.years}`,
      `面试轮次：第${args.round}轮`,
      `面试评价：${normalizedEvaluation}`,
      `推荐职级：${normalizedLevel}`,
      "面试总结：",
      ...args.summaryBullets.flatMap(formatSummaryBullet),
    ];

    if (isRejectedFlow && args.nextRoundFocus && args.nextRoundFocus.trim()) {
      throw new Error("Rejected evaluation must not provide nextRoundFocus.");
    }

    if (!isRejectedFlow && args.nextRoundFocus && args.nextRoundFocus.trim()) {
      lines.push(...formatNextRoundFocus(args.nextRoundFocus.trim()));
    }

    return lines.join("\n");
  },
});

export const scanPdf = tool({
  description:
    "Scan PDF via local Python fallback scripts and return extracted text JSON. Use when direct PDF read/multimodal extraction is unavailable.",
  args: {
    pdfPath: tool.schema
      .string()
      .describe("Absolute or project-relative PDF path"),
    profile: tool.schema
      .enum(["screening", "questioning"])
      .default("screening")
      .describe("Which fallback parser profile to use"),
    strictQualityGate: tool.schema
      .boolean()
      .default(true)
      .describe("Fail-fast when parsed quality status is fail"),
  },
  async execute(args, context) {
    await context.ask({
      permission: "edit",
      patterns: ["interviews/**"],
      always: ["interviews/**"],
      metadata: { reason: "Store parse cache for single-PDF fast path" },
    });

    const normalizedPdfPath = decodePossibleEncodedPath(args.pdfPath);
    const resolvedPdfPath = path.isAbsolute(normalizedPdfPath)
      ? normalizedPdfPath
      : path.join(context.directory, normalizedPdfPath);

    const scriptPath =
      args.profile === "questioning"
        ? path.join(
            context.directory,
            ".opencode/skills/interview-questioning/scripts/parse_resume.py",
          )
        : path.join(
            context.directory,
            ".opencode/skills/interview-screening/scripts/parse_pdf.py",
          );

    const parseCacheDir = path.join(context.directory, "interviews", "_parse_cache");
    await mkdir(parseCacheDir, { recursive: true });

    const { parsed, cache_hit } = await executePdfScanWithSharedPool({
      parserScriptPath: scriptPath,
      pdfPath: resolvedPdfPath,
      parseCacheDir,
    });

    const quality = evaluatePdfQuality(parsed, args.profile);

    if (args.strictQualityGate && quality.hard_fail) {
      throw new Error(
        `PDF quality gate failed: ${quality.issues.join("; ") || "unknown reason"}`,
      );
    }

    return JSON.stringify(
      {
        ok: true,
        profile: args.profile,
        parser_script: scriptPath,
        pdf_path: resolvedPdfPath,
        parse_cache_dir: parseCacheDir,
        parse_cache_hit: cache_hit,
        metadata: parsed.metadata ?? {},
        word_count: parsed.word_count ?? 0,
        content: parsed.content ?? "",
        quality,
      },
      null,
      2,
    );
  },
});

export const sanitizeInterviewNotes = tool({
  description:
    "Sanitize interview notes by removing injection/noise markers (e.g. [search-mode], dcp tags) before assessment.",
  args: {
    notesText: tool.schema.string().describe("Raw interview notes content"),
    customNoisePatterns: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Optional extra regex patterns as strings"),
  },
  async execute(args) {
    const result = sanitizeNotesText(args.notesText, args.customNoisePatterns ?? []);
    return JSON.stringify(
      {
        ok: true,
        sanitized_notes: result.sanitized,
        removed_count: result.removed_count,
        removed_markers: result.removed_markers,
      },
      null,
      2,
    );
  },
});

export const batchScreenResumes = tool({
  description:
    "Batch screening command: accept multiple PDFs or ZIP files, extract locally, run maximum-concurrency analysis, and generate a screening summary table.",
  args: {
    inputPaths: tool.schema
      .array(tool.schema.string())
      .min(1)
      .describe("List of PDF files, directories, or ZIP files (absolute or project-relative)"),
    maxConcurrency: tool.schema
      .number()
      .int()
      .min(1)
      .max(32)
      .optional()
      .describe("Maximum concurrent analysis workers. Defaults to CPU count capped at 8."),
    outputSummaryPath: tool.schema
      .string()
      .optional()
      .describe("Optional output markdown path. Defaults to interviews/YYYY-MM-DD/batch_筛选汇总.md"),
    strictQualityGate: tool.schema
      .boolean()
      .default(true)
      .describe("Whether to mark parser hard-fail items as blocked for next action"),
    keepExtractedTemp: tool.schema
      .boolean()
      .default(false)
      .describe("Keep temporary extracted ZIP content for debugging"),
    idempotencyKey: tool.schema
      .string()
      .optional()
      .describe("Optional stable key for idempotent batch execution"),
  },
  async execute(args, context) {
    await context.ask({
      permission: "edit",
      patterns: ["interviews/**"],
      always: ["interviews/**"],
      metadata: { reason: "Batch screening summary generation and local unzip temp files" },
    });

    const resolvedInputs = args.inputPaths.map((inputPath) => {
      const normalizedInputPath = decodePossibleEncodedPath(inputPath);
      return path.isAbsolute(normalizedInputPath)
        ? normalizedInputPath
        : path.join(context.directory, normalizedInputPath);
    });

    const runStateDir = path.join(context.directory, "interviews", "_batch_runs");
    await mkdir(runStateDir, { recursive: true });
    const idempotencyKey = buildBatchIdempotencyKey(
      resolvedInputs,
      args.strictQualityGate,
      args.maxConcurrency,
      args.idempotencyKey,
    );
    const runStatePath = path.join(runStateDir, `${idempotencyKey}.json`);

    try {
      const existingStateStat = await stat(runStatePath);
      if (existingStateStat.isFile()) {
        const existing = JSON.parse(await readFile(runStatePath, "utf-8"));
        return JSON.stringify(
          {
            ...existing,
            reused_from_idempotency_cache: true,
            standalone_enforced: true,
            next_step: "stop_after_summary",
            forbidden_followup_actions: [
              "skill:interview-screening",
              "skill:interview-orchestrator",
              "skill:interview-batch-legacy",
              "write_stage_documents_after_batch_command",
              "manual_meta_json_mutation_after_batch_command",
            ],
          },
          null,
          2,
        );
      }
    } catch {
      // no cached run, continue
    }

    const tempDirs = [];
    const discoveredPdfPaths = [];

    const directoryInputs = [];
    const zipInputs = [];
    const pdfInputs = [];

    await runWithConcurrency(resolvedInputs, Math.min(8, resolvedInputs.length), async (inputPath) => {
      const fileStat = await stat(inputPath);
      if (fileStat.isDirectory()) {
        directoryInputs.push(inputPath);
        return;
      }

      const lower = inputPath.toLowerCase();
      if (lower.endsWith(".pdf")) {
        pdfInputs.push(inputPath);
      } else if (lower.endsWith(".zip")) {
        zipInputs.push(inputPath);
      }
    });

    discoveredPdfPaths.push(...pdfInputs);

    const [directoryDiscovered, zipDiscovered] = await Promise.all([
      Promise.all(directoryInputs.map((directoryPath) => collectPdfFilesRecursive(directoryPath))),
      Promise.all(
        zipInputs.map(async (zipPath) => {
          const extractedDir = await extractZipToTemp(zipPath, context.directory);
          tempDirs.push(extractedDir);
          return collectPdfFilesRecursive(extractedDir);
        }),
      ),
    ]);

    for (const fileList of directoryDiscovered) {
      discoveredPdfPaths.push(...fileList);
    }
    for (const fileList of zipDiscovered) {
      discoveredPdfPaths.push(...fileList);
    }

    const uniquePdfPaths = Array.from(new Set(discoveredPdfPaths));
    if (uniquePdfPaths.length === 0) {
      throw new Error("No PDF files discovered from inputPaths (pdf/dir/zip)");
    }

    const parserScript = path.join(
      context.directory,
      ".opencode/skills/interview-screening/scripts/parse_pdf.py",
    );

    const maxConcurrency = Math.max(
      1,
      Math.min(args.maxConcurrency ?? Math.min(os.cpus().length, 8), uniquePdfPaths.length),
    );

    const parseCacheDir = path.join(context.directory, "interviews", "_parse_cache");
    await mkdir(parseCacheDir, { recursive: true });
    const workerPool = createPythonPdfWorkerPool(parserScript, maxConcurrency, 180000);

    let rows;
    try {
      rows = await runWithConcurrency(uniquePdfPaths, maxConcurrency, async (pdfPath) => {
        try {
          const { parsed, cache_hit } = await executePdfScanWithCache({
            parserScriptPath: parserScript,
            pdfPath,
            parseCacheDir,
            workerPool,
          });
          const quality = evaluatePdfQuality(parsed, "screening");
          const blocked = args.strictQualityGate && quality.hard_fail;
          return {
            candidate_name: toCandidateNameFromPdfPath(pdfPath),
            pdf_path: pdfPath,
            quality_status: quality.status,
            word_count: quality.word_count,
            parse_cache_hit: cache_hit,
            next_action: blocked
              ? "阻断：解析质量失败，需重传或人工复核"
              : "通过：仅纳入批量汇总，禁止触发任何 skill 链",
            quality,
          };
        } catch (error) {
          return {
            candidate_name: toCandidateNameFromPdfPath(pdfPath),
            pdf_path: pdfPath,
            quality_status: "fail",
            word_count: 0,
            parse_cache_hit: false,
            next_action: "阻断：解析异常，需人工复核",
            error: String(error?.message ?? error),
          };
        }
      });
    } finally {
      await workerPool.close();
      if (!args.keepExtractedTemp) {
        await Promise.all(tempDirs.map((tempDir) => rm(tempDir, { recursive: true, force: true })));
      }
    }

    const date = todayDate();
    const defaultSummaryPath = path.join(
      context.directory,
      "interviews",
      date,
      "batch_筛选汇总.md",
    );
    const summaryPath = args.outputSummaryPath
      ? (() => {
          const normalizedOutputPath = decodePossibleEncodedPath(args.outputSummaryPath);
          return path.isAbsolute(normalizedOutputPath)
            ? normalizedOutputPath
            : path.join(context.directory, normalizedOutputPath);
        })()
      : defaultSummaryPath;

    await mkdir(path.dirname(summaryPath), { recursive: true });

    const summaryMarkdown = buildBatchSummaryMarkdown(rows, {
      input_count: resolvedInputs.length,
      pdf_count: uniquePdfPaths.length,
      max_concurrency: maxConcurrency,
    });

    await writeFile(summaryPath, `${summaryMarkdown}\n`, "utf-8");

    const payload = {
      ok: true,
      command: "interview_batchScreenResumes",
      mode: "standalone",
      idempotency_key: idempotencyKey,
      input_paths: resolvedInputs,
      discovered_pdf_count: uniquePdfPaths.length,
      max_concurrency: maxConcurrency,
      parse_cache_dir: parseCacheDir,
      summary_path: summaryPath,
      candidate_stage_files_written: false,
      meta_json_mutated: false,
      next_step: "stop_after_summary",
      forbidden_followup_actions: [
        "skill:interview-screening",
        "skill:interview-orchestrator",
        "skill:interview-batch-legacy",
        "write_stage_documents_after_batch_command",
        "manual_meta_json_mutation_after_batch_command",
      ],
      rows,
    };

    await writeFile(runStatePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

    return JSON.stringify(payload, null, 2);
  },
});
