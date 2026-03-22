import { db } from "../db";
import { candidates, interviews } from "../schema";

const MAX_CONSECUTIVE_ERRORS = 3;

class SyncManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs = 5000;
  private enabled = false;
  private lastSyncAt: number | null = null;
  private lastError: string | null = null;
  private consecutiveErrors = 0;

  start(intervalMs = 5000) {
    if (this.enabled && this.intervalMs === intervalMs) return;
    this.stop();
    this.intervalMs = intervalMs;
    this.enabled = true;
    this.consecutiveErrors = 0;
    this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
    console.log(`[sync] polling started, interval=${intervalMs}ms`);
  }

  stop() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.enabled = false;
    console.log("[sync] polling stopped");
  }

  isEnabled() { return this.enabled; }
  getLastSyncAt() { return this.lastSyncAt; }
  getLastError() { return this.lastError; }

  async runOnce(): Promise<{ candidates: number; interviews: number }> {
    const before = Date.now();
    try {
      const result = await this.doSync();
      this.lastSyncAt = Date.now();
      this.lastError = null;
      this.consecutiveErrors = 0;
      console.log(`[sync] done in ${this.lastSyncAt - before}ms, candidates=${result.candidates} interviews=${result.interviews}`);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      this.lastError = msg;
      this.consecutiveErrors++;
      console.error(`[sync] error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${msg}`);
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) { console.error("[sync] too many errors, pausing polling"); this.stop(); }
      throw err;
    }
  }

  status() {
    return { enabled: this.enabled, intervalMs: this.intervalMs, lastSyncAt: this.lastSyncAt, lastError: this.lastError, consecutiveErrors: this.consecutiveErrors };
  }

  private async tick() {
    if (!this.enabled) return;
    try { await this.runOnce(); } catch {}
  }

  private async doSync(): Promise<{ candidates: number; interviews: number }> {
    // TODO(remote-adapt): replace with real remote API calls
    const { count: candidateCount } = await db.select().from(candidates).then((rows) => ({ count: rows.length }));
    const { count: interviewCount } = await db.select().from(interviews).then((rows) => ({ count: rows.length }));
    return { candidates: candidateCount, interviews: interviewCount };
  }
}

export const syncManager = new SyncManager();
