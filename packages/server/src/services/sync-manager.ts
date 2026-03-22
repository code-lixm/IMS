import { db } from "../db";
import { candidates, interviews } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { getBaobaoClient } from "./baobao-client";

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

  async runOnce(): Promise<{ syncedCandidates: number; syncedInterviews: number }> {
    const before = Date.now();
    try {
      const result = await this.doSync();
      this.lastSyncAt = Date.now();
      this.lastError = null;
      this.consecutiveErrors = 0;
      console.log(`[sync] done in ${this.lastSyncAt - before}ms, syncedCandidates=${result.syncedCandidates} syncedInterviews=${result.syncedInterviews}`);
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

  private async doSync(): Promise<{ syncedCandidates: number; syncedInterviews: number }> {
    const client = getBaobaoClient();
    if (!client) {
      throw new Error("Baobao client not initialized. Please connect via /api/auth/baobao/connect");
    }

    // Fetch all interviews from Baobao (paginated)
    let totalSynced = 0;
    let page = 1;
    const pageSize = 50;
    let hasMore = true;

    while (hasMore) {
      const response = await client.getApplicantInterviewAll({
        pageNum: page,
        pageSize: pageSize,
      });

      if (response.errno !== 0) {
        throw new Error(`Baobao API error: ${response.errmsg || response.errcode}`);
      }

      const list = response.data?.list || [];
      
      for (const applicant of list) {
        await this.syncApplicantToLocal(applicant);
        totalSynced++;
      }

      hasMore = list.length === pageSize;
      page++;
    }

    // Get interview count from count API
    const countResponse = await client.getInterviewCount();
    const interviewCount = countResponse.data?.today || 0;

    return {
      syncedCandidates: totalSynced,
      syncedInterviews: interviewCount,
    };
  }

  private async syncApplicantToLocal(applicant: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    applyPosition?: string;
    organizationName?: string;
    interviewTime?: string;
    status?: string;
  }): Promise<void> {
    const now = Date.now();

    // Check if candidate exists by remoteId
    const existing = await db.select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.remoteId, applicant.id), isNull(candidates.deletedAt)))
      .limit(1);

    if (existing.length) {
      // Update existing candidate
      await db.update(candidates)
        .set({
          name: applicant.name,
          phone: applicant.phone || null,
          email: applicant.email || null,
          position: applicant.applyPosition || null,
          source: "remote",
          updatedAt: now,
        })
        .where(eq(candidates.id, existing[0].id));
    } else {
      // Create new candidate
      const candidateId = `cand_${crypto.randomUUID()}`;
      await db.insert(candidates).values({
        id: candidateId,
        source: "remote",
        remoteId: applicant.id,
        name: applicant.name,
        phone: applicant.phone || null,
        email: applicant.email || null,
        position: applicant.applyPosition || null,
        createdAt: now,
        updatedAt: now,
      });

      // Create interview record if interview time exists
      if (applicant.interviewTime) {
        const interviewId = `intv_${crypto.randomUUID()}`;
        const scheduledAt = new Date(applicant.interviewTime).getTime();
        await db.insert(interviews).values({
          id: interviewId,
          candidateId: candidateId,
          remoteId: applicant.id,
          round: 1,
          status: this.mapInterviewStatus(applicant.status),
          scheduledAt: scheduledAt,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  private mapInterviewStatus(baobaoStatus?: string): string {
    if (!baobaoStatus) return "scheduled";
    if (baobaoStatus.includes("待面试")) return "scheduled";
    if (baobaoStatus.includes("已面试")) return "completed";
    if (baobaoStatus.includes("已取消")) return "cancelled";
    return "scheduled";
  }
}

export const syncManager = new SyncManager();
