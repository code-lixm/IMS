import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";

type SessionMapping = {
  candidateId: string;
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
};

export class OpenCodeManager {
  private process: Bun.Subprocess | null = null;
  private readonly host = "127.0.0.1";
  private port = config.opencodePort;
  private readonly mapping = new Map<string, SessionMapping>();

  constructor() {
    mkdirSync(join(config.runtimeDir, "opencode"), { recursive: true });
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  async start(): Promise<void> {
    if (this.isRunning()) {
      return;
    }

    this.process = Bun.spawn([
      "opencode",
      "web",
      "--hostname",
      this.host,
      "--port",
      String(this.port)
    ], {
      stdout: "pipe",
      stderr: "pipe"
    });

    this.watchLogs();
    await this.waitUntilHealthy(20_000);
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.process.kill();
    await this.process.exited.catch(() => undefined);
    this.process = null;
  }

  status() {
    return {
      running: this.isRunning(),
      host: this.host,
      port: this.port,
      baseUrl: this.baseUrl
    };
  }

  async ensureWorkspace(candidateId: string): Promise<{ sessionId: string; url: string }> {
    await this.start();

    const existing = this.mapping.get(candidateId);
    const now = Date.now();
    if (existing) {
      existing.lastAccessedAt = now;
      return {
        sessionId: existing.sessionId,
        url: `${this.baseUrl}/session/${existing.sessionId}`
      };
    }

    const sessionId = `ses_${crypto.randomUUID()}`;
    this.mapping.set(candidateId, {
      candidateId,
      sessionId,
      createdAt: now,
      lastAccessedAt: now
    });

    return {
      sessionId,
      url: `${this.baseUrl}/session/${sessionId}`
    };
  }

  private async waitUntilHealthy(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`${this.baseUrl}/global/health`);
        if (response.ok) {
          return;
        }
      } catch {
      }
      await Bun.sleep(200);
    }

    throw new Error("OpenCode service start timeout");
  }

  private watchLogs() {
    if (!this.process?.stdout || !this.process?.stderr) {
      return;
    }

    if (!(this.process.stdout instanceof ReadableStream) || !(this.process.stderr instanceof ReadableStream)) {
      return;
    }

    const stdout = Bun.readableStreamToText(this.process.stdout);
    const stderr = Bun.readableStreamToText(this.process.stderr);
    void stdout.then((text) => {
      if (text.trim()) {
        console.log(`[opencode] ${text.trim()}`);
      }
    });
    void stderr.then((text) => {
      if (text.trim()) {
        console.error(`[opencode] ${text.trim()}`);
      }
    });
  }
}
