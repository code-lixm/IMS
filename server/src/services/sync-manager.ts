/**
 * SyncManager — manages automatic polling sync with the remote system.
 *
 * Usage:
 *   syncManager.start(5000)   // enable, poll every 5s
 *   syncManager.stop()        // disable
 *   syncManager.isEnabled()    // boolean
 */

import { db } from "../db";
import { candidates, interviews } from "../schema";

// How many consecutive errors before we pause polling
const MAX_CONSECUTIVE_ERRORS = 3;

class SyncManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs = 5000;
  private enabled = false;
  private lastSyncAt: number | null = null;
  private lastError: string | null = null;
  private consecutiveErrors = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  start(intervalMs = 5000) {
    if (this.enabled && this.intervalMs === intervalMs) return;
    this.stop();

    this.intervalMs = intervalMs;
    this.enabled = true;
    this.consecutiveErrors = 0;

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    console.log(`[sync] polling started, interval=${intervalMs}ms`);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.enabled = false;
    console.log("[sync] polling stopped");
  }

  isEnabled() {
    return this.enabled;
  }

  getLastSyncAt() {
    return this.lastSyncAt;
  }

  getLastError() {
    return this.lastError;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // One-shot sync (also called by the timer)
  // ─────────────────────────────────────────────────────────────────────────

  async runOnce(): Promise<{ candidates: number; interviews: number }> {
    const before = Date.now();

    try {
      const result = await this.doSync();

      this.lastSyncAt = Date.now();
      this.lastError = null;
      this.consecutiveErrors = 0;

      console.log(
        `[sync] done in ${this.lastSyncAt - before}ms, candidates=${result.candidates} interviews=${result.interviews}`
      );

      return result;
    } catch (err) {
      const msg = (err as Error).message;
      this.lastError = msg;
      this.consecutiveErrors++;

      console.error(`[sync] error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${msg}`);

      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error("[sync] too many errors, pausing polling");
        this.stop();
      }

      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Status snapshot (for API responses)
  // ─────────────────────────────────────────────────────────────────────────

  status() {
    return {
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: tick — called by the timer
  // ─────────────────────────────────────────────────────────────────────────

  private async tick() {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch {
      // error already logged in runOnce
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: the actual sync work (stub — replace with real remote calls)
  // ─────────────────────────────────────────────────────────────────────────

  private async doSync(): Promise<{ candidates: number; interviews: number }> {
    /**
     * TODO (remote-adapt):
     * Replace this stub with real API calls to the company internal system:
     *
     *   const remoteCandidates = await remoteClient.fetchCandidates();
     *   for (const rc of remoteCandidates) {
     *     await upsertCandidateFromRemote(rc);
     *   }
     *
     * For now this stub just counts local records to show the mechanism works.
     */

    // Stub: just return local counts
    const { count: candidateCount } = await db
      .select()
      .from(candidates)
      .then((rows) => ({ count: rows.length }));

    const { count: interviewCount } = await db
      .select()
      .from(interviews)
      .then((rows) => ({ count: rows.length }));

    return { candidates: candidateCount, interviews: interviewCount };
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const syncManager = new SyncManager();
