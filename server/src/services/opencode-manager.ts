import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";
import { db } from "../db";
import { candidates, resumes, interviews, artifacts, candidateWorkspaces } from "../schema";
import { eq, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const LOG_DIR = join(config.runtimeDir, "logs");

function log(line: string) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${line}\n`;
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(join(LOG_DIR, "opencode.log"), entry);
  } catch {}
}

// ---------------------------------------------------------------------------
// OpenCodeManager
// ---------------------------------------------------------------------------

export class OpenCodeManager {
  private process: Bun.Subprocess | null = null;
  private host = "127.0.0.1";
  private port = config.opencodePort;
  private crashed = false;
  private stopping = false;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sessionBase = join(config.runtimeDir, "opencode", "sessions");
  private readonly dataDir = join(config.runtimeDir, "opencode", "data");

  constructor() {
    mkdirSync(this.sessionBase, { recursive: true });
    mkdirSync(this.dataDir, { recursive: true });
    mkdirSync(LOG_DIR, { recursive: true });
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning()) return;
    await this.spawn();
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    this.stopping = true;
    this.process.kill();
    await this.process.exited.catch(() => undefined);
    this.process = null;
    this.stopMonitoring();
    this.stopping = false;
    log("[opencode] stopped");
  }

  isRunning(): boolean {
    if (!this.process) return false;
    // @ts-ignore - exitCode exists at runtime
    return this.process.exitCode === null;
  }

  status() {
    return {
      running: this.isRunning(),
      baseUrl: this.baseUrl,
      host: this.host,
      port: this.port,
      crashed: this.crashed,
    };
  }

  // -------------------------------------------------------------------------
  // Spawn with port fallback
  // -------------------------------------------------------------------------

  private async spawn(): Promise<void> {
    const maxPort = this.port + 10;
    let port = this.port;

    while (port <= maxPort) {
      try {
        await this.trySpawn(port);
        return;
      } catch (err) {
        log(`[opencode] port ${port} failed: ${(err as Error).message}, trying next...`);
        port++;
        this.port = port;
      }
    }

    throw new Error(`[opencode] all ports ${this.port}-${maxPort} are occupied`);
  }

  private async trySpawn(port: number): Promise<void> {
    log(`[opencode] starting on ${this.host}:${port}...`);

    this.process = Bun.spawn(
      [
        "opencode", "web",
        "--hostname", this.host,
        "--port", String(port),
        "--session-dir", this.sessionBase,
        "--data-dir", this.dataDir,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );

    // Monitor for unexpected exit
    this.monitorProcessExit();

    this.watchLogs();
    await this.waitUntilHealthy(30_000);
    this.crashed = false;
    log(`[opencode] started at ${this.baseUrl}`);
  }

  // -------------------------------------------------------------------------
  // Crash detection via polling
  // -------------------------------------------------------------------------

  private monitorProcessExit() {
    this.stopMonitoring();
    this.monitorTimer = setInterval(async () => {
      const proc = this.process;
      if (!proc || this.stopping) return;

      // @ts-ignore
      const code = proc.exitCode;
      if (code !== null && !this.stopping) {
        // Process exited unexpectedly
        this.process = null;
        this.crashed = true;
        this.stopMonitoring();
        log(`[opencode] process exited with code ${code}`);
        await this.autoRestart();
      }
    }, 1000);
  }

  private stopMonitoring() {
    if (this.monitorTimer !== null) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Crash recovery
  // -------------------------------------------------------------------------

  private async autoRestart(): Promise<void> {
    const maxRetries = 3;
    for (let i = 1; i <= maxRetries; i++) {
      log(`[opencode] crash recovery attempt ${i}/${maxRetries}...`);
      await Bun.sleep(2000 * i);

      if (!this.crashed) break;

      try {
        await this.spawn();
        log("[opencode] crash recovery succeeded");
        return;
      } catch (err) {
        log(`[opencode] recovery attempt ${i} failed: ${(err as Error).message}`);
      }
    }

    log("[opencode] crash recovery exhausted");
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  private async waitUntilHealthy(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${this.baseUrl}/global/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return;
      } catch {}
      await Bun.sleep(300);
    }
    throw new Error("health check timeout");
  }

  // -------------------------------------------------------------------------
  // Workspace management
  // -------------------------------------------------------------------------

  async ensureWorkspace(candidateId: string): Promise<{ sessionId: string; url: string; status: string }> {
    if (!this.isRunning()) {
      await this.start();
    }

    // 1. Load from DB
    const [existingWs] = await db
      .select()
      .from(candidateWorkspaces)
      .where(eq(candidateWorkspaces.candidateId, candidateId))
      .limit(1);

    if (existingWs && existingWs.workspaceStatus === "active") {
      await db
        .update(candidateWorkspaces)
        .set({ lastAccessedAt: Date.now() })
        .where(eq(candidateWorkspaces.id, existingWs.id));

      return {
        sessionId: existingWs.opencodeSessionId,
        url: `${this.baseUrl}/session/${existingWs.opencodeSessionId}`,
        status: existingWs.workspaceStatus,
      };
    }

    // 2. Build context
    const context = await this.buildCandidateContext(candidateId);

    // 3. Create session via OpenCode API
    const opencodeSessionId = await this.createSession(context);

    // 4. Persist to DB
    const wsId = `ws_${crypto.randomUUID()}`;
    const now = Date.now();
    await db.insert(candidateWorkspaces).values({
      id: wsId,
      candidateId,
      opencodeSessionId,
      workspaceStatus: "active",
      lastAccessedAt: now,
      createdAt: now,
    });

    log(`[opencode] workspace created for ${candidateId}, session ${opencodeSessionId}`);

    return {
      sessionId: opencodeSessionId,
      url: `${this.baseUrl}/session/${opencodeSessionId}`,
      status: "active",
    };
  }

  private async buildCandidateContext(candidateId: string): Promise<string> {
    const [cand] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);

    if (!cand) return "";

    const resumeRows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.candidateId, candidateId));

    const interviewRows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.candidateId, candidateId))
      .orderBy(desc(interviews.scheduledAt));

    const artifactRows = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.candidateId, candidateId))
      .orderBy(desc(artifacts.updatedAt));

    const resumeTexts = resumeRows
      .map((r) => r.extractedText ?? "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    const interviewSummaries = interviewRows.map((i) => {
      const eval_ = i.manualEvaluationJson
        ? JSON.parse(i.manualEvaluationJson as string)
        : null;
      return `第 ${i.round} 轮面试 | 状态: ${i.status}${
        eval_ ? ` | 评价: ${JSON.stringify(eval_)}` : ""
      }`;
    }).join("\n");

    const artifactSummaries = artifactRows.map((a) => {
      return `【${a.type}】当前版本 v${a.currentVersion}`;
    }).join("\n");

    const tags: string[] = cand.tagsJson
      ? JSON.parse(cand.tagsJson as string)
      : [];

    return [
      `# 候选人信息`,
      `姓名: ${cand.name}`,
      `岗位: ${cand.position ?? "未知"}`,
      `工作年限: ${cand.yearsOfExperience ?? "未知"} 年`,
      `来源: ${cand.source}`,
      `技能标签: ${tags.join(", ") || "无"}`,
      ``,
      `## 简历内容`,
      resumeTexts || "(无简历文本)",
      ``,
      `## 面试记录`,
      interviewSummaries || "(无面试记录)",
      ``,
      `## AI 产物`,
      artifactSummaries || "(无 AI 产物)",
    ].join("\n");
  }

  private async createSession(context: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "default",
        systemPrompt:
          "你是面试管理工具的 AI 助手，正在辅助面试官对候选人进行面试准备工作。",
        context,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(
        `create session failed: ${res.status} ${await res.text()}`
      );
    }

    const body = (await res.json()) as { sessionId?: string; id?: string };
    return (body.sessionId ?? body.id ?? "").toString();
  }

  // -------------------------------------------------------------------------
  // Log capture
  // -------------------------------------------------------------------------

  private watchLogs() {
    const proc = this.process;
    if (!proc) return;

    const tee = (stream: unknown, prefix: string) => {
      if (!stream) return;
      // Bun subprocess stdout/stderr are Blob-like
      void (stream as { text(): Promise<string> }).text().then((text: string) => {
        for (const line of text.split("\n")) {
          if (line.trim()) log(`[opencode][${prefix}] ${line}`);
        }
      }).catch(() => {});
    };

    tee(proc.stdout, "out");
    tee(proc.stderr, "err");
  }
}
